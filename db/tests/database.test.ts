/**
 * Database tests - run against TEST_DATABASE_URL (rebuilt from scratch).
 *   npm run test:db
 * Each test runs inside BEGIN ... ROLLBACK unless it needs a real COMMIT.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB_DIR } from '../lib/env.js';
import '../lib/db.js'; // registers NUMERIC/INT8 parsers
import { runSeed } from '../lib/seed.js';
import { loadNamedQueries } from '../lib/sqlfile.js';
import { parseRoster } from '../lib/roster.js';
import { rebuildTestDatabase, testDatabaseUrl } from '../lib/testdb.js';

const url = testDatabaseUrl();
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-dbtest-'));
let db: pg.Client;

beforeAll(async () => {
  await rebuildTestDatabase(url, uploadDir);
  db = new pg.Client({ connectionString: url });
  await db.connect();
  // Most tests place orders "now": lift opening hours so they do not depend on the clock.
  // Opening hours themselves are tested explicitly in 'opening hours' below.
  await db.query('UPDATE campus_store SET opens_at = NULL, closes_at = NULL');
});
afterAll(async () => {
  await db?.end();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});
beforeEach(async () => { await db.query('BEGIN'); });
afterEach(async () => { await db.query('ROLLBACK'); });

/** Runs a statement in a savepoint and returns the PostgreSQL error (or null). */
async function pgError(sql: string, params: unknown[] = []) {
  await db.query('SAVEPOINT t');
  try {
    await db.query(sql, params);
    await db.query('RELEASE SAVEPOINT t');
    return null;
  } catch (e) {
    await db.query('ROLLBACK TO SAVEPOINT t');
    return e as pg.DatabaseError;
  }
}
const one = async <T = any>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
const DEMO = 'DEMO2023A7PS001H';

describe('schema objects', () => {
  it('has exactly the 12 relations of the design', async () => {
    const { rows } = await db.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`);
    expect(rows.map((r) => r.table_name)).toEqual([
      'admin', 'calendar', 'campus_store', 'document', 'hostel', 'menu_item', 'order_item', 'orders',
      'outpass_request', 'room', 'room_allocation', 'student',
    ]);
  });

  it('has the 10 indexes of the schema', async () => {
    const { rows } = await db.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`);
    const names = rows.map((r) => r.indexname);
    for (const n of ['uq_one_active_allocation', 'idx_alloc_room', 'idx_orders_student', 'idx_orders_store', 'idx_item_menu',
      'idx_document_student', 'idx_outpass_student', 'idx_outpass_reviewer', 'idx_outpass_status', 'idx_calendar_start']) {
      expect(names).toContain(n);
    }
  });

  it('has the 6 triggers, the 2 deferred ones being DEFERRABLE INITIALLY DEFERRED', async () => {
    const { rows } = await db.query(`SELECT tgname, tgdeferrable, tginitdeferred FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`);
    expect(rows.map((r) => r.tgname)).toEqual([
      'ctrg_item_delete_keeps_one', 'ctrg_order_has_items', 'trg_alloc_occupancy', 'trg_item', 'trg_item_frozen', 'trg_order',
    ]);
    for (const r of rows.filter((r) => r.tgname.startsWith('ctrg'))) {
      expect(r.tgdeferrable).toBe(true);
      expect(r.tginitdeferred).toBe(true);
    }
  });

  it('has the views and the stored function', async () => {
    const v = await db.query(`SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY 1`);
    expect(v.rows.map((r) => r.table_name)).toEqual(['v_hostel_occupancy', 'v_overdue_outpass', 'v_student_spend']);
    const f = await one(`SELECT to_regprocedure('sp_place_order(varchar,varchar,jsonb,timestamptz)') AS f`);
    expect(f.f).not.toBeNull();
  });

  it('records applied migrations outside the domain schema', async () => {
    const { rows } = await db.query('SELECT id FROM app_meta.schema_migrations ORDER BY id');
    expect(rows.map((r) => r.id)).toEqual(['R__functions', 'R__views', 'V001__core_schema']);
  });
});

describe('imported data and seed', () => {
  it('imports every valid roster row and skips header / empty rows', async () => {
    const parsed = await parseRoster(path.join(DB_DIR, 'seed', 'data', 'on_campus_list.xlsx'));
    expect(parsed.valid.length).toBe(4651);
    expect(parsed.skipped.every((s) => ['header row', 'empty row'].includes(s.reason))).toBe(true);
    const r = await one(`SELECT COUNT(*)::int AS n FROM student WHERE student_id NOT LIKE 'DEMO%'`);
    expect(r.n).toBe(4651);
    const g = await one(`SELECT COUNT(*) FILTER (WHERE gender = 'MALE')::int AS m, COUNT(*) FILTER (WHERE gender = 'FEMALE')::int AS f
                           FROM student WHERE student_id NOT LIKE 'DEMO%'`);
    expect(g).toEqual({ m: 3732, f: 919 });
    const nulls = await one(`SELECT COUNT(*)::int AS n FROM student WHERE student_id NOT LIKE 'DEMO%' AND (phone IS NOT NULL OR program IS NOT NULL)`);
    expect(nulls.n).toBe(0);
    const emails = await one(`SELECT bool_and(email LIKE '%.invalid') AS ok FROM student`);
    expect(emails.ok).toBe(true);
  });

  it('has exactly the six hostels with the right genders', async () => {
    const { rows } = await db.query('SELECT hostel_name, gender FROM hostel ORDER BY hostel_name');
    expect(rows).toEqual([
      { hostel_name: 'Krishna', gender: 'MALE' }, { hostel_name: 'Malviya', gender: 'FEMALE' },
      { hostel_name: 'Meera', gender: 'FEMALE' }, { hostel_name: 'Ram', gender: 'MALE' },
      { hostel_name: 'Valmiki', gender: 'MALE' }, { hostel_name: 'Vishwakarma', gender: 'MALE' },
    ]);
  });

  it('gives every student exactly one ACTIVE allocation in a same-gender hostel', async () => {
    const r = await one(`SELECT
        (SELECT COUNT(*) FROM student)::int AS students,
        (SELECT COUNT(*) FROM room_allocation WHERE status = 'ACTIVE')::int AS active,
        (SELECT COUNT(*) FROM room_allocation a JOIN student s USING (student_id) JOIN hostel h USING (hostel_name)
          WHERE a.status = 'ACTIVE' AND s.gender <> h.gender)::int AS cross_gender,
        (SELECT COUNT(*) FROM room_allocation WHERE status = 'ENDED')::int AS history`);
    expect(r.active).toBe(r.students);
    expect(r.cross_gender).toBe(0);
    expect(r.history).toBeGreaterThan(100);
  });

  it('distributes residents evenly over the same-gender hostels', async () => {
    const { rows } = await db.query('SELECT gender, MIN(residents) AS lo, MAX(residents) AS hi FROM v_hostel_occupancy GROUP BY gender');
    for (const r of rows) expect(r.hi - r.lo).toBeLessThanOrEqual(2);
  });

  it('keeps transactions on synthetic DEMO accounts only', async () => {
    const r = await one(`SELECT
        (SELECT COUNT(*) FROM orders WHERE student_id NOT LIKE 'DEMO%')::int +
        (SELECT COUNT(*) FROM outpass_request WHERE student_id NOT LIKE 'DEMO%')::int +
        (SELECT COUNT(*) FROM document WHERE student_id NOT LIKE 'DEMO%')::int AS n`);
    expect(r.n).toBe(0);
  });

  it('has at least 500 rows in total', async () => {
    const r = await one(`SELECT (SELECT COUNT(*) FROM student) + (SELECT COUNT(*) FROM room) + (SELECT COUNT(*) FROM orders) AS n`);
    expect(r.n).toBeGreaterThan(500);
  });

  it('is idempotent: re-running the seed adds nothing', async () => {
    const count = async () => one(`SELECT (SELECT COUNT(*) FROM room)::int r, (SELECT COUNT(*) FROM room_allocation)::int a,
      (SELECT COUNT(*) FROM orders)::int o, (SELECT COUNT(*) FROM calendar)::int c, (SELECT COUNT(*) FROM admin)::int ad`);
    const before = await count();
    await runSeed(db, { uploadDir, log: () => undefined });
    expect(await count()).toEqual(before);
  });
});

describe('declarative constraints', () => {
  it('rejects a second ACTIVE allocation (partial unique index)', async () => {
    const a = await one(`SELECT hostel_name, room_no FROM room_allocation WHERE student_id = $1 AND status = 'ACTIVE'`, [DEMO]);
    const other = await one(`SELECT room_no FROM room WHERE hostel_name = $1 AND room_no <> $2 LIMIT 1`, [a.hostel_name, a.room_no]);
    const e = await pgError(`INSERT INTO room_allocation (student_id, hostel_name, room_no, start_date) VALUES ($1,$2,$3,CURRENT_DATE)`,
      [DEMO, a.hostel_name, other.room_no]);
    expect(e?.code).toBe('23505');
    expect(e?.constraint).toBe('uq_one_active_allocation');
  });

  it('allows several ENDED allocations (index is partial)', async () => {
    const e = await pgError(`INSERT INTO room_allocation (student_id, hostel_name, room_no, start_date, end_date, status)
      VALUES ($1, 'Krishna', 'A-001', '2019-01-01', '2019-02-01', 'ENDED'), ($1, 'Krishna', 'A-002', '2019-03-01', '2019-04-01', 'ENDED')`, [DEMO]);
    expect(e).toBeNull();
  });

  it.each([
    ['chk_alloc_status', `INSERT INTO room_allocation VALUES ('${DEMO}', 'Krishna', 'A-003', '2019-01-01', NULL, 'ENDED')`],
    ['chk_alloc_dates', `INSERT INTO room_allocation VALUES ('${DEMO}', 'Krishna', 'A-003', '2019-01-05', '2019-01-01', 'ENDED')`],
    ['chk_outpass_window', `INSERT INTO outpass_request (student_id, reason, out_at, return_by) VALUES ('${DEMO}', 'x', now(), now() - interval '1 hour')`],
    ['chk_outpass_returned', `INSERT INTO outpass_request (student_id, reason, out_at, return_by, returned_at) VALUES ('${DEMO}', 'x', now(), now() + interval '1 hour', now() - interval '1 hour')`],
    ['chk_outpass_reviewed', `INSERT INTO outpass_request (student_id, reason, out_at, return_by, reviewed_by) VALUES ('${DEMO}', 'x', now(), now() + interval '1 hour', 1)`],
    ['chk_calendar_dates', `INSERT INTO calendar VALUES ('Bad', 'EVENT', NULL, now(), now() - interval '1 day')`],
    ['menu_item_price_check', `UPDATE menu_item SET price = -1 WHERE store_name = 'Central Canteen' AND item_name = 'Masala Dosa'`],
    ['hostel_gender_check', `INSERT INTO hostel VALUES ('Test', 'UG', NULL, 'ALIEN')`],
    ['room_floor_no_check', `INSERT INTO room VALUES ('Krishna', 'Z-999', -1)`],
    ['calendar_event_type_check', `INSERT INTO calendar VALUES ('Bad', 'PARTY', NULL, now(), NULL)`],
  ])('CHECK %s rejects invalid rows (23514)', async (constraint, sql) => {
    const e = await pgError(sql);
    expect(e?.code).toBe('23514');
    expect(e?.constraint).toBe(constraint);
  });

  it('rejects duplicate student e-mails (UNIQUE)', async () => {
    const s = await one(`SELECT email FROM student LIMIT 1`);
    const e = await pgError(`INSERT INTO student (student_id, full_name, email) VALUES ('X1', 'X', $1)`, [s.email]);
    expect(e?.constraint).toBe('student_email_key');
  });

  it('rejects an item from another store (composite FK)', async () => {
    const o = await one(`INSERT INTO orders (student_id, store_name) VALUES ($1, 'Central Canteen') RETURNING order_id`, [DEMO]);
    const e = await pgError(`INSERT INTO order_item VALUES ($1, 'Campus Café', 'Cappuccino', 1, 90)`, [o.order_id]);
    expect(e?.code).toBe('23503');
    expect(e?.constraint).toBe('order_item_order_id_store_name_fkey');
  });

  it('rejects an item that is not on the menu (composite FK to MENU_ITEM)', async () => {
    const o = await one(`INSERT INTO orders (student_id, store_name) VALUES ($1, 'Central Canteen') RETURNING order_id`, [DEMO]);
    const e = await pgError(`INSERT INTO order_item VALUES ($1, 'Central Canteen', 'Caviar', 1, 90)`, [o.order_id]);
    expect(e?.constraint).toBe('order_item_store_name_item_name_fkey');
  });

  it('keeps history: restrictive FKs block deleting referenced rows', async () => {
    expect((await pgError(`DELETE FROM campus_store WHERE store_name = 'Central Canteen'`))?.code).toBe('23503');
    expect((await pgError(`DELETE FROM student WHERE student_id = $1`, [DEMO]))?.code).toBe('23503');
    expect((await pgError(`DELETE FROM room WHERE (hostel_name, room_no) IN (SELECT hostel_name, room_no FROM room_allocation LIMIT 1)`))?.code).toBe('23503');
  });

  it('sets reviewed_by to NULL when the admin is deleted (and reviewed_at must follow)', async () => {
    const a = await one(`SELECT reviewed_by FROM outpass_request WHERE reviewed_by IS NOT NULL LIMIT 1`);
    // ON DELETE SET NULL leaves reviewed_at set → chk_outpass_reviewed refuses: reviewing admins cannot vanish silently
    const e = await pgError('DELETE FROM admin WHERE admin_id = $1', [a.reviewed_by]);
    expect(e?.constraint).toBe('chk_outpass_reviewed');
  });
});

describe('triggers', () => {
  it('trg_item / trg_order maintain order totals and student spend', async () => {
    const before = await one(`SELECT total_deductions_amount AS s FROM student WHERE student_id = $1`, [DEMO]);
    const o = await one(`SELECT sp_place_order($1, 'Central Canteen', '[{"item_name":"Masala Dosa","quantity":2},{"item_name":"Filter Coffee","quantity":3}]') AS id`, [DEMO]);
    const order = await one(`SELECT total_amount FROM orders WHERE order_id = $1`, [o.id]);
    expect(order.total_amount).toBe(2 * 60 + 3 * 20);
    const after = await one(`SELECT total_deductions_amount AS s FROM student WHERE student_id = $1`, [DEMO]);
    expect(after.s - before.s).toBe(180);

    await db.query(`UPDATE order_item SET quantity = 1 WHERE order_id = $1 AND item_name = 'Masala Dosa'`, [o.id]);
    expect((await one(`SELECT total_amount FROM orders WHERE order_id = $1`, [o.id])).total_amount).toBe(120);
    expect((await one(`SELECT total_deductions_amount AS s FROM student WHERE student_id = $1`, [DEMO])).s - before.s).toBe(120);
  });

  it('cancelling removes the order from the spend; reinstating adds it back', async () => {
    const o = await one(`SELECT order_id, total_amount, student_id FROM orders WHERE status = 'COMPLETED' LIMIT 1`);
    const spend = async () => (await one(`SELECT total_deductions_amount AS s FROM student WHERE student_id = $1`, [o.student_id])).s;
    const s0 = await spend();
    await db.query(`UPDATE orders SET status = 'CANCELLED' WHERE order_id = $1`, [o.order_id]);
    expect(await spend()).toBeCloseTo(s0 - o.total_amount, 2);
    expect((await one(`SELECT total_amount FROM orders WHERE order_id = $1`, [o.order_id])).total_amount).toBe(o.total_amount);
    await db.query(`UPDATE orders SET status = 'PLACED' WHERE order_id = $1`, [o.order_id]);
    expect(await spend()).toBeCloseTo(s0, 2);
  });

  it('trg_item_frozen blocks insert / update / delete on cancelled orders', async () => {
    const o = await one(`SELECT o.order_id, oi.item_name, o.store_name FROM orders o JOIN order_item oi USING (order_id) WHERE o.status = 'CANCELLED' LIMIT 1`);
    for (const sql of [
      `UPDATE order_item SET quantity = 9 WHERE order_id = $1 AND item_name = $2`,
      `DELETE FROM order_item WHERE order_id = $1 AND item_name = $2`,
    ]) {
      const e = await pgError(sql, [o.order_id, o.item_name]);
      expect(e?.code).toBe('P0001');
      expect(e?.message).toMatch(/cancelled/);
    }
  });

  it('menu price changes never change past orders (unit_price snapshot)', async () => {
    const i = await one(`SELECT order_id, store_name, item_name, unit_price FROM order_item LIMIT 1`);
    const t = await one(`SELECT total_amount FROM orders WHERE order_id = $1`, [i.order_id]);
    await db.query(`UPDATE menu_item SET price = price * 3 WHERE store_name = $1 AND item_name = $2`, [i.store_name, i.item_name]);
    expect((await one(`SELECT unit_price FROM order_item WHERE order_id = $1 AND item_name = $2`, [i.order_id, i.item_name])).unit_price).toBe(i.unit_price);
    expect((await one(`SELECT total_amount FROM orders WHERE order_id = $1`, [i.order_id])).total_amount).toBe(t.total_amount);
  });

  it('trg_alloc_occupancy updates both rooms on a transfer', async () => {
    const a = await one(`SELECT hostel_name, room_no, start_date FROM room_allocation WHERE student_id = $1 AND status = 'ACTIVE'`, [DEMO]);
    const to = await one(`SELECT room_no, occupancy FROM room WHERE hostel_name = $1 AND occupancy = 0 LIMIT 1`, [a.hostel_name]);
    const from0 = (await one(`SELECT occupancy FROM room WHERE hostel_name = $1 AND room_no = $2`, [a.hostel_name, a.room_no])).occupancy;
    await db.query(`UPDATE room_allocation SET status = 'ENDED', end_date = CURRENT_DATE WHERE student_id = $1 AND status = 'ACTIVE'`, [DEMO]);
    await db.query(`INSERT INTO room_allocation (student_id, hostel_name, room_no, start_date) VALUES ($1, $2, $3, CURRENT_DATE)`, [DEMO, a.hostel_name, to.room_no]);
    expect((await one(`SELECT occupancy FROM room WHERE hostel_name = $1 AND room_no = $2`, [a.hostel_name, a.room_no])).occupancy).toBe(from0 - 1);
    expect((await one(`SELECT occupancy FROM room WHERE hostel_name = $1 AND room_no = $2`, [a.hostel_name, to.room_no])).occupancy).toBe(1);
  });
});

describe('deferred constraint triggers (need a real COMMIT)', () => {
  it('ctrg_order_has_items rejects an order without items at COMMIT', async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(`INSERT INTO orders (student_id, store_name) VALUES ($1, 'Central Canteen') RETURNING order_id`, [DEMO]);
      expect(rows[0].order_id).toBeGreaterThan(0); // accepted until COMMIT
      await expect(c.query('COMMIT')).rejects.toMatchObject({ code: 'P0001' });
      const left = await c.query('SELECT 1 FROM orders WHERE order_id = $1', [rows[0].order_id]);
      expect(left.rowCount).toBe(0);
    } finally {
      await c.end();
    }
  });

  it('an order and its items committed together succeed', async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(`SELECT sp_place_order($1, 'Night Canteen', '[{"item_name":"Maggi Noodles","quantity":1}]') AS id`, [DEMO]);
      await c.query('COMMIT');
      expect((await c.query('SELECT total_amount FROM orders WHERE order_id = $1', [rows[0].id])).rows[0].total_amount).toBe(40);
      // clean up through the same rules: cancel is allowed, deleting the order cascades its items
      await c.query('DELETE FROM orders WHERE order_id = $1', [rows[0].id]);
    } finally {
      await c.end();
    }
  });

  it('ctrg_item_delete_keeps_one rejects removing the last item', async () => {
    const o = await one(`SELECT order_id FROM orders WHERE status <> 'CANCELLED' LIMIT 1`);
    await db.query('SAVEPOINT s');
    await db.query('DELETE FROM order_item WHERE order_id = $1', [o.order_id]);
    await expect(db.query('SET CONSTRAINTS ctrg_item_delete_keeps_one IMMEDIATE')).rejects.toMatchObject({ code: 'P0001' });
    await db.query('ROLLBACK TO SAVEPOINT s');
  });
});

describe('sp_place_order', () => {
  it('merges duplicate item names and snapshots prices', async () => {
    const o = await one(`SELECT sp_place_order($1, 'Central Canteen', '[{"item_name":"Samosa (2 pcs)","quantity":1},{"item_name":"Samosa (2 pcs)","quantity":2}]') AS id`, [DEMO]);
    const i = await one(`SELECT quantity, unit_price FROM order_item WHERE order_id = $1`, [o.id]);
    expect(i).toEqual({ quantity: 3, unit_price: 30 });
  });

  it.each([
    ['empty item list', '[]', /at least one item/],
    ['unknown item', '[{"item_name":"Caviar","quantity":1}]', /Not available/],
    ['item of another store', '[{"item_name":"Cappuccino","quantity":1}]', /Not available/],
  ])('rejects %s', async (_n, items, msg) => {
    const e = await pgError(`SELECT sp_place_order($1, 'Central Canteen', $2::jsonb)`, [DEMO, items]);
    expect(e?.code).toBe('P0001');
    expect(e?.message).toMatch(msg);
  });

  it('rejects unavailable items and non-positive quantities', async () => {
    expect((await pgError(`SELECT sp_place_order($1, 'Night Canteen', '[{"item_name":"Chocolate Brownie","quantity":1}]')`, [DEMO]))?.message).toMatch(/Not available/);
    expect((await pgError(`SELECT sp_place_order($1, 'Night Canteen', '[{"item_name":"Maggi Noodles","quantity":0}]')`, [DEMO]))?.constraint).toBe('order_item_quantity_check');
  });
});

describe('opening hours (fn_store_is_open / sp_place_order)', () => {
  const ist = (hhmm: string) => `2026-11-16T${hhmm}:00+05:30`;

  it('evaluates normal and past-midnight hours in campus time', async () => {
    const r = await one(`SELECT
        fn_store_is_open('07:30', '22:00', $1) AS day_open,
        fn_store_is_open('07:30', '22:00', $2) AS day_closed,
        fn_store_is_open('20:00', '03:00', $3) AS night_late,
        fn_store_is_open('20:00', '03:00', $4) AS night_early,
        fn_store_is_open('20:00', '03:00', $5) AS night_noon,
        fn_store_is_open(NULL, NULL, $5) AS no_hours`, [ist('12:00'), ist('23:15'), ist('23:30'), ist('02:00'), ist('12:00')]);
    expect(r).toEqual({ day_open: true, day_closed: false, night_late: true, night_early: true, night_noon: false, no_hours: true });
  });

  it('sp_place_order refuses orders outside the store hours', async () => {
    await db.query(`UPDATE campus_store SET opens_at = '07:30', closes_at = '22:00' WHERE store_name = 'Central Canteen'`);
    const items = '[{"item_name":"Masala Dosa","quantity":1}]';
    const e = await pgError(`SELECT sp_place_order($1, 'Central Canteen', $2::jsonb, $3)`, [DEMO, items, ist('23:30')]);
    expect(e?.code).toBe('P0001');
    expect(e?.message).toMatch(/closed/);
    expect(await pgError(`SELECT sp_place_order($1, 'Central Canteen', $2::jsonb, $3)`, [DEMO, items, ist('12:00')])).toBeNull();
  });

  it('every seeded order was placed while its store was open', async () => {
    // hours were lifted in beforeAll, so compare against the seed definitions
    const { STORES } = await import('../lib/seedData.js');
    const hours = new Map(STORES.map((s) => [s.store_name, [s.opens_at, s.closes_at]]));
    const { rows } = await db.query(`SELECT store_name, ordered_at FROM orders`);
    const bad = [];
    for (const o of rows) {
      const [op, cl] = hours.get(o.store_name)!;
      const r = await one('SELECT fn_store_is_open($1, $2, $3) AS ok', [op, cl, o.ordered_at]);
      if (!r.ok) bad.push(o);
    }
    expect(bad).toEqual([]);
  });
});

describe('views', () => {
  it('v_student_spend is consistent with the trigger-maintained totals', async () => {
    expect((await one('SELECT bool_and(is_consistent) AS ok FROM v_student_spend')).ok).toBe(true);
  });
  it('v_hostel_occupancy sums to the number of ACTIVE allocations', async () => {
    const r = await one(`SELECT (SELECT SUM(residents) FROM v_hostel_occupancy)::int AS a, (SELECT COUNT(*) FROM room_allocation WHERE status = 'ACTIVE')::int AS b`);
    expect(r.a).toBe(r.b);
  });
  it('v_overdue_outpass lists only approved, unreturned, late requests', async () => {
    const r = await one(`SELECT COUNT(*)::int AS n, bool_and(o.status = 'APPROVED' AND o.returned_at IS NULL AND o.return_by < now()) AS ok
                           FROM v_overdue_outpass v JOIN outpass_request o USING (request_id)`);
    expect(r.n).toBeGreaterThan(0);
    expect(r.ok).toBe(true);
  });
});

describe('reports and audits', () => {
  it('every report in db/reports.sql executes', async () => {
    for (const q of loadNamedQueries(path.join(DB_DIR, 'reports.sql')).values()) {
      const n = Math.max(0, ...[...q.sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
      const r = await db.query(q.sql, Array(n).fill(null));
      expect(r.rowCount, q.name).toBeGreaterThan(0);
    }
  });

  it('the double NOT EXISTS report finds the students who used every store', async () => {
    const q = loadNamedQueries(path.join(DB_DIR, 'reports.sql')).get('all_store_customers')!;
    const r = await db.query(q.sql);
    const stores = (await one('SELECT COUNT(*)::int AS n FROM campus_store')).n;
    for (const row of r.rows) {
      const c = await one(`SELECT COUNT(DISTINCT store_name)::int AS n FROM orders WHERE student_id = $1 AND status <> 'CANCELLED'`, [row.student_id]);
      expect(c.n).toBe(stores);
    }
  });

  it('every audit query returns zero rows', async () => {
    for (const q of loadNamedQueries(path.join(DB_DIR, 'audit.sql')).values()) {
      const r = await db.query(q.sql);
      expect(r.rowCount, q.name).toBe(0);
    }
  });
});
