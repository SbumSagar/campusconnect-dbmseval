/**
 * Database Integrity Lab.
 *
 * Every scenario executes REAL statements against PostgreSQL on a dedicated
 * connection inside BEGIN ... ROLLBACK, so nothing it does can persist.
 * (The "order with no items" scenario must reach COMMIT to fire the deferred
 * trigger; PostgreSQL then rolls that transaction back itself.)
 * The reported SQLSTATE, constraint and message are exactly what the
 * database returned - nothing is hard-coded.
 */
import type pg from 'pg';
import { loadNamedQueries, pool } from '../db/pool.js';
import { notFound, type HttpError, type PgError } from '../utils/errors.js';
import { assertGenderRule } from './hostels.service.js';

type Category = 'Constraint' | 'Trigger' | 'Application rule' | 'Behaviour';

interface Outcome {
  outcome: 'REJECTED' | 'ACCEPTED';
  sqlstate: string | null;
  constraint: string | null;
  message: string;
  detail?: string | null;
}

export interface TestResult {
  key: string;
  title: string;
  category: Category;
  rule: string;
  enforcedBy: string;
  operation: string;
  expected: string;
  actual: Outcome;
  passed: boolean;
  notes: string[];
  durationMs: number;
  rolledBack: boolean;
}

interface Ctx {
  db: pg.PoolClient;
  notes: string[];
  ops: string[];
}

interface TestDef {
  key: string;
  title: string;
  category: Category;
  rule: string;
  enforcedBy: string;
  expected: string;
  /** expected SQLSTATE (null for application-rule / behaviour scenarios) */
  sqlstate: string | null;
  constraint: string | null;
  /** true when the scenario needs its own COMMIT (deferred constraint) */
  commits?: boolean;
  run(ctx: Ctx): Promise<Outcome>;
}

// ---------------------------------------------------------------- helpers
const lit = (v: unknown): string =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

/** SQL shown to the user: parameters inlined as literals (display only). */
const show = (sql: string, params: unknown[] = []) =>
  sql.replace(/\$(\d+)/g, (_, i) => lit(params[Number(i) - 1])).replace(/\s+/g, ' ').trim();

function triggerFromWhere(where?: string): string | null {
  const m = /function (\w+)\(/.exec(where ?? '');
  return m ? m[1] : null;
}

const fromError = (e: PgError): Outcome => ({
  outcome: 'REJECTED',
  sqlstate: e.code ?? null,
  constraint: e.constraint ?? triggerFromWhere(e.where),
  message: e.message,
  detail: e.detail ?? null,
});

const accepted = (message: string): Outcome => ({ outcome: 'ACCEPTED', sqlstate: null, constraint: null, message });

/** Runs one statement inside a SAVEPOINT so the surrounding test transaction stays usable. */
async function attempt(ctx: Ctx, sql: string, params: unknown[] = []): Promise<Outcome> {
  ctx.ops.push(show(sql, params));
  await ctx.db.query('SAVEPOINT lab');
  try {
    const r = await ctx.db.query(sql, params);
    await ctx.db.query('RELEASE SAVEPOINT lab');
    return accepted(`Statement succeeded (${r.command} ${r.rowCount ?? 0})`);
  } catch (err) {
    await ctx.db.query('ROLLBACK TO SAVEPOINT lab');
    return fromError(err as PgError);
  }
}

async function one<T = any>(ctx: Ctx, sql: string, params: unknown[] = [], what = 'sample data'): Promise<T> {
  const { rows } = await ctx.db.query(sql, params);
  if (!rows.length) throw new Error(`No ${what} available - run "npm run db:seed" first.`);
  return rows[0] as T;
}

const activeStudent = (ctx: Ctx, gender = 'MALE') => one<{ student_id: string; hostel_name: string; room_no: string; full_name: string }>(ctx,
  `SELECT a.student_id, a.hostel_name, a.room_no, s.full_name FROM room_allocation a JOIN student s USING (student_id)
    WHERE a.status = 'ACTIVE' AND s.gender = $1 ORDER BY (a.student_id LIKE 'DEMO%') DESC, a.student_id LIMIT 1`,
  [gender], 'student with an active allocation');

// ---------------------------------------------------------------- scenarios
const TESTS: TestDef[] = [
  {
    key: 'two_active_rooms',
    title: 'Assign one student to two ACTIVE rooms',
    category: 'Constraint',
    rule: 'A student holds at most one ACTIVE room allocation.',
    enforcedBy: 'Partial unique index uq_one_active_allocation ON room_allocation(student_id) WHERE status = \'ACTIVE\'',
    expected: 'Rejected - unique violation (23505) on uq_one_active_allocation',
    sqlstate: '23505', constraint: 'uq_one_active_allocation',
    async run(ctx) {
      const s = await activeStudent(ctx);
      const r = await one<{ room_no: string }>(ctx,
        `SELECT room_no FROM room WHERE hostel_name = $1 AND room_no <> $2 ORDER BY occupancy, room_no LIMIT 1`, [s.hostel_name, s.room_no]);
      ctx.notes.push(`${s.full_name} (${s.student_id}) is ACTIVE in ${s.hostel_name} ${s.room_no}.`);
      return attempt(ctx,
        `INSERT INTO room_allocation (student_id, hostel_name, room_no, start_date, status) VALUES ($1, $2, $3, CURRENT_DATE, 'ACTIVE')`,
        [s.student_id, s.hostel_name, r.room_no]);
    },
  },
  {
    key: 'cross_gender_hostel',
    title: 'Allocate a male student to a female hostel',
    category: 'Application rule',
    rule: 'Students live only in hostels of their own gender (MALE → Krishna/Ram/Valmiki/Vishwakarma, FEMALE → Malviya/Meera).',
    enforcedBy: 'Application layer (allocation service). The approved schema deliberately does not force HOSTEL.gender = STUDENT.gender (design assumption 3).',
    expected: 'Rejected by the application rule before any INSERT is sent',
    sqlstate: null, constraint: 'app: hostel gender rule',
    async run(ctx) {
      const s = await activeStudent(ctx, 'MALE');
      const room = await one<{ hostel_name: string; room_no: string }>(ctx,
        `SELECT r.hostel_name, r.room_no FROM room r JOIN hostel h USING (hostel_name)
          WHERE h.gender = 'FEMALE' ORDER BY r.occupancy, r.hostel_name, r.room_no LIMIT 1`, [], 'female hostel room');
      ctx.ops.push(`-- application check (allocation service)\nSELECT s.gender, h.gender FROM student s, hostel h WHERE s.student_id = ${lit(s.student_id)} AND h.hostel_name = ${lit(room.hostel_name)}`);
      let result: Outcome;
      try {
        await assertGenderRule(ctx.db, s.student_id, room.hostel_name);
        result = accepted('Application allowed the allocation');
      } catch (err) {
        const e = err as HttpError;
        result = { outcome: 'REJECTED', sqlstate: null, constraint: 'app: hostel gender rule', message: e.message };
      }
      // Show WHY the rule lives in the application: the raw row is accepted by the database.
      await ctx.db.query(`UPDATE room_allocation SET status = 'ENDED', end_date = GREATEST(CURRENT_DATE, start_date) WHERE student_id = $1 AND status = 'ACTIVE'`, [s.student_id]);
      const raw = await attempt(ctx,
        `INSERT INTO room_allocation (student_id, hostel_name, room_no, start_date, status) VALUES ($1, $2, $3, CURRENT_DATE + 1, 'ACTIVE')`,
        [s.student_id, room.hostel_name, room.room_no]);
      ctx.notes.push(raw.outcome === 'ACCEPTED'
        ? 'For comparison, the same row sent directly as SQL is ACCEPTED by PostgreSQL (no schema constraint) - it was rolled back. This is why the rule is enforced in the application.'
        : `Raw SQL comparison was rejected: ${raw.message}`);
      return result;
    },
  },
  {
    key: 'item_from_other_store',
    title: 'Add an item from a different store to an order',
    category: 'Constraint',
    rule: 'An order may contain only items offered by the store that received it.',
    enforcedBy: 'Composite FK order_item(order_id, store_name) → orders(order_id, store_name)',
    expected: 'Rejected - foreign-key violation (23503) on order_item_order_id_store_name_fkey',
    sqlstate: '23503', constraint: 'order_item_order_id_store_name_fkey',
    async run(ctx) {
      const s = await activeStudent(ctx);
      const stores = await ctx.db.query(`SELECT store_name FROM campus_store ORDER BY store_name LIMIT 2`);
      if (stores.rows.length < 2) throw new Error('Need at least two stores');
      const [a, b] = stores.rows.map((r) => r.store_name as string);
      const item = await one<{ item_name: string }>(ctx, `SELECT item_name FROM menu_item WHERE store_name = $1 ORDER BY item_name LIMIT 1`, [b]);
      const ins = `INSERT INTO orders (student_id, store_name) VALUES ($1, $2) RETURNING order_id`;
      ctx.ops.push(show(ins, [s.student_id, a]));
      const { rows } = await ctx.db.query(ins, [s.student_id, a]);
      ctx.notes.push(`Order ${rows[0].order_id} was received by "${a}"; the item "${item.item_name}" is on the menu of "${b}".`);
      return attempt(ctx,
        `INSERT INTO order_item (order_id, store_name, item_name, quantity, unit_price) VALUES ($1, $2, $3, 1, 10)`,
        [rows[0].order_id, b, item.item_name]);
    },
  },
  {
    key: 'closed_store_order',
    title: 'Place an order at a store that is closed',
    category: 'Trigger',
    rule: 'Orders are accepted only during the store\'s opening hours (campus time).',
    enforcedBy: 'Stored function sp_place_order → fn_store_is_open(opens_at, closes_at, ordered_at)',
    expected: 'Rejected - raise_exception (P0001) from sp_place_order',
    sqlstate: 'P0001', constraint: 'sp_place_order',
    async run(ctx) {
      const s = await activeStudent(ctx);
      const store = await one<{ store_name: string; open: boolean; opens: string; closes: string }>(ctx,
        `SELECT store_name, fn_store_is_open(opens_at, closes_at) AS open,
                to_char(opens_at, 'HH24:MI') AS opens, to_char(closes_at, 'HH24:MI') AS closes
           FROM campus_store WHERE opens_at IS NOT NULL
          ORDER BY fn_store_is_open(opens_at, closes_at), store_name LIMIT 1`);
      if (store.open) {
        // every store is open right now: inside this rolled-back transaction, move its hours later
        const sql = `UPDATE campus_store
                        SET opens_at  = ((now() AT TIME ZONE 'Asia/Kolkata') + interval '2 hours')::time,
                            closes_at = ((now() AT TIME ZONE 'Asia/Kolkata') + interval '3 hours')::time
                      WHERE store_name = $1`;
        ctx.ops.push(show(sql, [store.store_name]));
        await ctx.db.query(sql, [store.store_name]);
        ctx.notes.push(`${store.store_name} was open, so its hours were moved 2-3 hours ahead inside this transaction (rolled back).`);
      } else {
        ctx.notes.push(`${store.store_name} is closed now (hours ${store.opens}-${store.closes}, campus time).`);
      }
      const item = await one<{ item_name: string }>(ctx,
        `SELECT item_name FROM menu_item WHERE store_name = $1 AND is_available ORDER BY item_name LIMIT 1`, [store.store_name]);
      return attempt(ctx, `SELECT sp_place_order($1, $2, $3::jsonb)`,
        [s.student_id, store.store_name, JSON.stringify([{ item_name: item.item_name, quantity: 1 }])]);
    },
  },
  {
    key: 'order_without_items',
    title: 'Commit an order that has no items',
    category: 'Trigger',
    rule: 'Every order contains at least one item (total participation in CONTAINS).',
    enforcedBy: 'Deferred constraint trigger ctrg_order_has_items → fn_order_min_one_item(), checked at COMMIT',
    expected: 'Rejected at COMMIT - raise_exception (P0001) from fn_order_min_one_item',
    sqlstate: 'P0001', constraint: 'fn_order_min_one_item',
    commits: true,
    async run(ctx) {
      const s = await activeStudent(ctx);
      const store = await one<{ store_name: string }>(ctx, `SELECT store_name FROM campus_store ORDER BY store_name LIMIT 1`);
      const ins = `INSERT INTO orders (student_id, store_name) VALUES ($1, $2) RETURNING order_id`;
      ctx.ops.push(show(ins, [s.student_id, store.store_name]));
      const { rows } = await ctx.db.query(ins, [s.student_id, store.store_name]);
      ctx.notes.push(`INSERT succeeded (order ${rows[0].order_id}) because the check is DEFERRED until COMMIT.`);
      ctx.ops.push('COMMIT');
      try {
        await ctx.db.query('COMMIT');
      } catch (err) {
        ctx.notes.push('PostgreSQL rolled the whole transaction back - the order never became visible.');
        return fromError(err as PgError);
      }
      // Should never happen; clean up so the lab cannot leave data behind.
      await ctx.db.query('DELETE FROM orders WHERE order_id = $1', [rows[0].order_id]);
      return accepted('COMMIT succeeded (unexpected) - the order was deleted again');
    },
  },
  {
    key: 'delete_all_items',
    title: 'Delete every item of an existing order',
    category: 'Trigger',
    rule: 'An existing order may not lose its last item.',
    enforcedBy: 'Deferred constraint trigger ctrg_item_delete_keeps_one (forced IMMEDIATE here, then rolled back)',
    expected: 'Rejected - raise_exception (P0001) from fn_order_min_one_item',
    sqlstate: 'P0001', constraint: 'fn_order_min_one_item',
    async run(ctx) {
      const o = await one<{ order_id: number }>(ctx,
        `SELECT order_id FROM orders WHERE status <> 'CANCELLED' ORDER BY order_id LIMIT 1`, [], 'order');
      const del = `DELETE FROM order_item WHERE order_id = $1`;
      ctx.ops.push(show(del, [o.order_id]));
      await ctx.db.query('SAVEPOINT lab');
      await ctx.db.query(del, [o.order_id]);
      ctx.notes.push(`All items of order ${o.order_id} deleted inside the transaction; the deferred check is now forced to run.`);
      ctx.ops.push('SET CONSTRAINTS ctrg_item_delete_keeps_one IMMEDIATE');
      try {
        await ctx.db.query('SET CONSTRAINTS ctrg_item_delete_keeps_one IMMEDIATE');
        await ctx.db.query('RELEASE SAVEPOINT lab');
        return accepted('Deleting every item was accepted');
      } catch (err) {
        await ctx.db.query('ROLLBACK TO SAVEPOINT lab');
        return fromError(err as PgError);
      }
    },
  },
  {
    key: 'cancelled_order_frozen',
    title: 'Modify an item of a CANCELLED order',
    category: 'Trigger',
    rule: 'Items of a cancelled order are frozen (cannot be inserted, changed or deleted).',
    enforcedBy: 'BEFORE trigger trg_item_frozen → fn_item_frozen()',
    expected: 'Rejected - raise_exception (P0001) from fn_item_frozen',
    sqlstate: 'P0001', constraint: 'fn_item_frozen',
    async run(ctx) {
      let o = (await ctx.db.query(
        `SELECT oi.order_id, oi.item_name FROM orders o JOIN order_item oi USING (order_id)
          WHERE o.status = 'CANCELLED' ORDER BY o.order_id LIMIT 1`)).rows[0];
      if (!o) {
        const s = await activeStudent(ctx);
        const m = await one<{ store_name: string; item_name: string }>(ctx, `SELECT store_name, item_name FROM menu_item WHERE is_available LIMIT 1`);
        // opening hours are irrelevant to this scenario: lift them inside the rolled-back transaction
        await ctx.db.query('UPDATE campus_store SET opens_at = NULL, closes_at = NULL WHERE store_name = $1', [m.store_name]);
        const { rows } = await ctx.db.query(`SELECT sp_place_order($1, $2, $3::jsonb) AS id`,
          [s.student_id, m.store_name, JSON.stringify([{ item_name: m.item_name, quantity: 1 }])]);
        await ctx.db.query(`UPDATE orders SET status = 'CANCELLED' WHERE order_id = $1`, [rows[0].id]);
        o = { order_id: rows[0].id, item_name: m.item_name };
      }
      ctx.notes.push(`Order ${o.order_id} has status CANCELLED.`);
      return attempt(ctx, `UPDATE order_item SET quantity = quantity + 1 WHERE order_id = $1 AND item_name = $2`, [o.order_id, o.item_name]);
    },
  },
  {
    key: 'outpass_return_before_out',
    title: 'Outpass whose expected return is before departure',
    category: 'Constraint',
    rule: 'An outpass must return after it leaves (return_by > out_at).',
    enforcedBy: 'CHECK chk_outpass_window',
    expected: 'Rejected - check violation (23514) on chk_outpass_window',
    sqlstate: '23514', constraint: 'chk_outpass_window',
    async run(ctx) {
      const s = await activeStudent(ctx);
      return attempt(ctx,
        `INSERT INTO outpass_request (student_id, reason, out_at, return_by)
         VALUES ($1, 'Integrity Lab test', now() + interval '2 days', now() + interval '1 day')`, [s.student_id]);
    },
  },
  {
    key: 'returned_before_out',
    title: 'Record a return (returned_at) before departure (out_at)',
    category: 'Constraint',
    rule: 'A student cannot return before leaving (returned_at ≥ out_at).',
    enforcedBy: 'CHECK chk_outpass_returned',
    expected: 'Rejected - check violation (23514) on chk_outpass_returned',
    sqlstate: '23514', constraint: 'chk_outpass_returned',
    async run(ctx) {
      const o = await one<{ request_id: number }>(ctx,
        `SELECT request_id FROM outpass_request WHERE status = 'APPROVED' ORDER BY request_id LIMIT 1`, [], 'approved outpass');
      return attempt(ctx,
        `UPDATE outpass_request SET returned_at = out_at - interval '3 hours' WHERE request_id = $1`, [o.request_id]);
    },
  },
  {
    key: 'duplicate_email',
    title: 'Create a student with a duplicate e-mail address',
    category: 'Constraint',
    rule: 'Student e-mail addresses are unique (candidate key).',
    enforcedBy: 'UNIQUE constraint student_email_key',
    expected: 'Rejected - unique violation (23505) on student_email_key',
    sqlstate: '23505', constraint: 'student_email_key',
    async run(ctx) {
      const s = await one<{ email: string }>(ctx, `SELECT email FROM student ORDER BY student_id LIMIT 1`);
      return attempt(ctx,
        `INSERT INTO student (student_id, full_name, email, gender) VALUES ('LABTEST0001', 'Integrity Lab', $1, 'MALE')`, [s.email]);
    },
  },
  {
    key: 'reviewer_without_time',
    title: 'Set reviewed_by without reviewed_at',
    category: 'Constraint',
    rule: 'reviewed_by and reviewed_at are set together or not at all.',
    enforcedBy: 'CHECK chk_outpass_reviewed',
    expected: 'Rejected - check violation (23514) on chk_outpass_reviewed',
    sqlstate: '23514', constraint: 'chk_outpass_reviewed',
    async run(ctx) {
      const o = await one<{ request_id: number }>(ctx,
        `SELECT request_id FROM outpass_request WHERE status = 'PENDING' ORDER BY request_id LIMIT 1`, [], 'pending outpass');
      const a = await one<{ admin_id: number }>(ctx, `SELECT admin_id FROM admin ORDER BY admin_id LIMIT 1`);
      return attempt(ctx,
        `UPDATE outpass_request SET status = 'APPROVED', reviewed_by = $2, reviewed_at = NULL WHERE request_id = $1`,
        [o.request_id, a.admin_id]);
    },
  },
  {
    key: 'allocation_status_mismatch',
    title: 'ENDED allocation without an end date',
    category: 'Constraint',
    rule: 'An allocation is ACTIVE exactly when end_date IS NULL.',
    enforcedBy: 'CHECK chk_alloc_status',
    expected: 'Rejected - check violation (23514) on chk_alloc_status',
    sqlstate: '23514', constraint: 'chk_alloc_status',
    async run(ctx) {
      const s = await activeStudent(ctx);
      return attempt(ctx,
        `INSERT INTO room_allocation (student_id, hostel_name, room_no, start_date, end_date, status)
         VALUES ($1, $2, $3, DATE '2020-01-01', NULL, 'ENDED')`, [s.student_id, s.hostel_name, s.room_no]);
    },
  },
  {
    key: 'negative_price',
    title: 'Set a negative menu price',
    category: 'Constraint',
    rule: 'Prices are never negative.',
    enforcedBy: 'CHECK menu_item_price_check (price >= 0)',
    expected: 'Rejected - check violation (23514) on menu_item_price_check',
    sqlstate: '23514', constraint: 'menu_item_price_check',
    async run(ctx) {
      const m = await one<{ store_name: string; item_name: string }>(ctx, `SELECT store_name, item_name FROM menu_item ORDER BY 1, 2 LIMIT 1`);
      return attempt(ctx, `UPDATE menu_item SET price = -10 WHERE store_name = $1 AND item_name = $2`, [m.store_name, m.item_name]);
    },
  },
  {
    key: 'delete_store_with_history',
    title: 'Delete a store that has order history',
    category: 'Constraint',
    rule: 'History is never cascaded away: stores with orders cannot be deleted.',
    enforcedBy: 'Restrictive FK orders.store_name → campus_store (no ON DELETE action)',
    expected: 'Rejected - foreign-key violation (23503)',
    sqlstate: '23503', constraint: null,
    async run(ctx) {
      const s = await one<{ store_name: string }>(ctx,
        `SELECT store_name FROM orders GROUP BY store_name ORDER BY COUNT(*) DESC LIMIT 1`, [], 'store with orders');
      return attempt(ctx, `DELETE FROM campus_store WHERE store_name = $1`, [s.store_name]);
    },
  },
  // ------------------------------------------------------------ behaviour (triggers doing their job)
  {
    key: 'price_snapshot',
    title: 'Menu price change does not alter past orders',
    category: 'Behaviour',
    rule: 'ORDER_ITEM.unit_price is a snapshot taken when the order was placed.',
    enforcedBy: 'Schema design: unit_price stored per order line (no FK on price)',
    expected: 'Accepted - menu price changes, historical unit_price and order total unchanged',
    sqlstate: null, constraint: null,
    async run(ctx) {
      const o = await one<{ order_id: number; store_name: string; item_name: string; unit_price: number; total_amount: number }>(ctx,
        `SELECT oi.order_id, oi.store_name, oi.item_name, oi.unit_price, o.total_amount
           FROM order_item oi JOIN orders o USING (order_id) ORDER BY oi.order_id LIMIT 1`, [], 'order item');
      const r = await attempt(ctx, `UPDATE menu_item SET price = price + 50 WHERE store_name = $1 AND item_name = $2`, [o.store_name, o.item_name]);
      const after = await one<{ unit_price: number; total_amount: number; price: number }>(ctx,
        `SELECT oi.unit_price, o.total_amount, m.price FROM order_item oi JOIN orders o USING (order_id)
           JOIN menu_item m ON m.store_name = oi.store_name AND m.item_name = oi.item_name
          WHERE oi.order_id = $1 AND oi.item_name = $2`, [o.order_id, o.item_name]);
      const same = Number(after.unit_price) === Number(o.unit_price) && Number(after.total_amount) === Number(o.total_amount);
      ctx.notes.push(`Menu price of "${o.item_name}" is now ₹${after.price}; order ${o.order_id} still records ₹${after.unit_price} per unit (total ₹${after.total_amount}).`);
      return same ? { ...r, message: 'Price updated; historical order unchanged' }
        : { outcome: 'REJECTED', sqlstate: null, constraint: null, message: 'Historical order changed!' };
    },
  },
  {
    key: 'transfer_occupancy',
    title: 'Room transfer updates both rooms\' occupancy',
    category: 'Behaviour',
    rule: 'ROOM.occupancy always equals the number of ACTIVE allocations.',
    enforcedBy: 'Trigger trg_alloc_occupancy → fn_alloc_occupancy()',
    expected: 'Accepted - old room −1, new room +1 (computed by the trigger)',
    sqlstate: null, constraint: null,
    async run(ctx) {
      const s = await activeStudent(ctx);
      const to = await one<{ room_no: string; occupancy: number }>(ctx,
        `SELECT room_no, occupancy FROM room WHERE hostel_name = $1 AND room_no <> $2 ORDER BY occupancy, room_no LIMIT 1`, [s.hostel_name, s.room_no]);
      const occ = async (room: string) => Number((await ctx.db.query(
        'SELECT occupancy FROM room WHERE hostel_name = $1 AND room_no = $2', [s.hostel_name, room])).rows[0].occupancy);
      const fromBefore = await occ(s.room_no);
      const toBefore = await occ(to.room_no);
      const r1 = await attempt(ctx, `UPDATE room_allocation SET status = 'ENDED', end_date = GREATEST(CURRENT_DATE, start_date) WHERE student_id = $1 AND status = 'ACTIVE'`, [s.student_id]);
      const r2 = await attempt(ctx, `INSERT INTO room_allocation (student_id, hostel_name, room_no, start_date) VALUES ($1, $2, $3, CURRENT_DATE)`, [s.student_id, s.hostel_name, to.room_no]);
      if (r1.outcome === 'REJECTED') return r1;
      if (r2.outcome === 'REJECTED') return r2;
      const fromAfter = await occ(s.room_no);
      const toAfter = await occ(to.room_no);
      ctx.notes.push(`${s.hostel_name} ${s.room_no}: ${fromBefore} → ${fromAfter};  ${s.hostel_name} ${to.room_no}: ${toBefore} → ${toAfter}`);
      return fromAfter === fromBefore - 1 && toAfter === toBefore + 1
        ? accepted('Both occupancies were updated by the trigger')
        : { outcome: 'REJECTED', sqlstate: null, constraint: null, message: 'Occupancy was not maintained' };
    },
  },
  {
    key: 'cancel_adjusts_spend',
    title: 'Cancelling an order reduces the student\'s spend',
    category: 'Behaviour',
    rule: 'STUDENT.total_deductions_amount = Σ totals of non-cancelled orders.',
    enforcedBy: 'Trigger trg_order → fn_order_changed() (delta update)',
    expected: 'Accepted - spend decreases by exactly the order total',
    sqlstate: null, constraint: null,
    async run(ctx) {
      const o = await one<{ order_id: number; student_id: string; total_amount: number }>(ctx,
        `SELECT order_id, student_id, total_amount FROM orders WHERE status <> 'CANCELLED' ORDER BY order_id DESC LIMIT 1`, [], 'order');
      const spend = async () => Number((await ctx.db.query(
        'SELECT total_deductions_amount AS v FROM student WHERE student_id = $1', [o.student_id])).rows[0].v);
      const before = await spend();
      const r = await attempt(ctx, `UPDATE orders SET status = 'CANCELLED' WHERE order_id = $1`, [o.order_id]);
      if (r.outcome === 'REJECTED') return r;
      const after = await spend();
      ctx.notes.push(`Order ${o.order_id} total ₹${o.total_amount}; ${o.student_id} spend ₹${before} → ₹${after}.`);
      return Math.abs(before - after - Number(o.total_amount)) < 0.001
        ? accepted('Spend was adjusted by the trigger')
        : { outcome: 'REJECTED', sqlstate: null, constraint: null, message: 'Spend was not adjusted correctly' };
    },
  },
];

export function listTests() {
  return TESTS.map(({ run: _r, ...t }) => t);
}

export async function runTest(key: string): Promise<TestResult> {
  const def = TESTS.find((t) => t.key === key);
  if (!def) throw notFound('Integrity test');
  const db = await pool.connect();
  const ctx: Ctx = { db, notes: [], ops: [] };
  const t0 = performance.now();
  let actual: Outcome;
  try {
    await db.query('BEGIN');
    actual = await def.run(ctx);
  } catch (err) {
    const e = err as PgError;
    actual = e.code ? fromError(e) : { outcome: 'REJECTED', sqlstate: null, constraint: null, message: `Test could not run: ${e.message}` };
  } finally {
    // Always roll back: the lab never changes real data.
    await db.query('ROLLBACK').catch(() => undefined);
    db.release();
  }
  let passed: boolean;
  if (def.category === 'Behaviour') passed = actual.outcome === 'ACCEPTED';
  else if (def.category === 'Application rule') passed = actual.outcome === 'REJECTED' && actual.constraint === def.constraint;
  else passed = actual.outcome === 'REJECTED' && actual.sqlstate === def.sqlstate
    && (def.constraint === null || actual.constraint === def.constraint);
  const { run: _r, commits: _c, sqlstate: _s, constraint: _k, ...meta } = def;
  return {
    ...meta,
    operation: ctx.ops.join(';\n') + (ctx.ops.length ? ';' : ''),
    actual,
    passed,
    notes: ctx.notes,
    durationMs: Math.round((performance.now() - t0) * 10) / 10,
    rolledBack: true,
  };
}

export async function runAll() {
  const results: TestResult[] = [];
  for (const t of TESTS) results.push(await runTest(t.key));
  return { results, passed: results.filter((r) => r.passed).length, total: results.length };
}

// ---------------------------------------------------------------- audits & catalog
const audits = loadNamedQueries('audit.sql');

export async function runAudits() {
  const out = [];
  for (const q of audits.values()) {
    const r = await pool.query(q.sql);
    out.push({ name: q.name, description: q.comment.split('\n')[0], sql: q.sql, rowCount: r.rowCount, sample: r.rows.slice(0, 5) });
  }
  return { audits: out, allPassed: out.every((a) => a.rowCount === 0) };
}

/** Live view of the database objects that implement the design (from pg_catalog). */
export async function catalog() {
  const [triggers, indexes, constraints, views, functions] = await Promise.all([
    pool.query(`SELECT t.tgname AS name, c.relname AS table_name, p.proname AS function_name,
                       pg_get_triggerdef(t.oid) AS definition, t.tgdeferrable AS deferrable
                  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE NOT t.tgisinternal AND n.nspname = 'public' ORDER BY c.relname, t.tgname`),
    pool.query(`SELECT indexname AS name, tablename AS table_name, indexdef AS definition
                  FROM pg_indexes WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey'
                   AND indexname NOT LIKE '%_key' AND indexname <> 'uq_order_store' ORDER BY tablename, indexname`),
    pool.query(`SELECT con.conname AS name, cl.relname AS table_name,
                       CASE con.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
                                        WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' ELSE con.contype::text END AS type,
                       pg_get_constraintdef(con.oid) AS definition
                  FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
                  JOIN pg_namespace n ON n.oid = cl.relnamespace
                 WHERE n.nspname = 'public' AND con.contype IN ('p','f','u','c')
                 ORDER BY cl.relname, con.contype, con.conname`),
    pool.query(`SELECT table_name AS name, view_definition AS definition FROM information_schema.views
                 WHERE table_schema = 'public' ORDER BY table_name`),
    pool.query(`SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args,
                       pg_get_function_result(p.oid) AS returns
                  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' ORDER BY p.proname`),
  ]);
  const exact = await pool.query(`
    SELECT 'hostel' AS t, COUNT(*)::int AS n FROM hostel UNION ALL SELECT 'room', COUNT(*) FROM room UNION ALL
    SELECT 'student', COUNT(*) FROM student UNION ALL SELECT 'room_allocation', COUNT(*) FROM room_allocation UNION ALL
    SELECT 'campus_store', COUNT(*) FROM campus_store UNION ALL SELECT 'menu_item', COUNT(*) FROM menu_item UNION ALL
    SELECT 'orders', COUNT(*) FROM orders UNION ALL SELECT 'order_item', COUNT(*) FROM order_item UNION ALL
    SELECT 'document', COUNT(*) FROM document UNION ALL SELECT 'admin', COUNT(*) FROM admin UNION ALL
    SELECT 'outpass_request', COUNT(*) FROM outpass_request UNION ALL SELECT 'calendar', COUNT(*) FROM calendar`);
  return {
    tables: exact.rows.map((r) => ({ table_name: r.t, rows: r.n })),
    triggers: triggers.rows, indexes: indexes.rows, constraints: constraints.rows,
    views: views.rows, functions: functions.rows,
  };
}
