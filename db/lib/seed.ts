import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import {
  ADMINS, CALENDAR, DEMO_STUDENTS, DOC_TYPES, FLOORS, HOSTELS, OUTPASS_REASONS,
  ROOMS_PER_FLOOR_PER_WING, STORES,
} from './seedData.js';

/** Deterministic PRNG (mulberry32) so the generated dataset is reproducible. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

export const SEED = 20260923; // date of the on-campus list
const IST = '+05:30';
const DAY = 86_400_000;

export interface SeedOptions {
  /** Absolute path of the uploads folder (sample documents are written here). */
  uploadDir: string;
  /** Anchor for relative transaction dates (defaults to today). */
  now?: Date;
  log?: (msg: string) => void;
}

async function seeded(client: pg.Client, section: string): Promise<boolean> {
  const { rowCount } = await client.query('SELECT 1 FROM app_meta.seed_log WHERE section = $1', [section]);
  return (rowCount ?? 0) > 0;
}
async function markSeeded(client: pg.Client, section: string, details: object) {
  await client.query(
    `INSERT INTO app_meta.seed_log (section, details) VALUES ($1, $2)
     ON CONFLICT (section) DO UPDATE SET details = EXCLUDED.details, applied_at = now()`,
    [section, JSON.stringify(details)],
  );
}

const roomNo = (wing: string, floor: number, n: number) => `${wing}-${floor}${String(n).padStart(2, '0')}`;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Minimal valid single-page PDF used for sample documents. */
function samplePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 18 : 11} Tf 60 ${760 - i * 26} Td (${esc(l)}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/**
 * Seeds reference data and synthetic transactions.  Idempotent:
 *  - reference rows use ON CONFLICT DO NOTHING;
 *  - allocations are created only for students without any allocation;
 *  - synthetic transactions are created once (recorded in app_meta.seed_log).
 * Must be called inside a transaction (the caller commits).
 */
export async function runSeed(client: pg.Client, opts: SeedOptions): Promise<Record<string, number>> {
  const log = opts.log ?? console.log;
  const rng = makeRng(SEED);
  const now = opts.now ?? new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const stats: Record<string, number> = {};

  // ---------------------------------------------------------------- hostels
  for (const h of HOSTELS) {
    await client.query(
      `INSERT INTO hostel (hostel_name, hostel_type, warden_name, gender) VALUES ($1,$2,$3,$4)
       ON CONFLICT (hostel_name) DO NOTHING`, [h.hostel_name, h.hostel_type, h.warden_name, h.gender]);
  }

  // ---------------------------------------------------------------- rooms
  const rH: string[] = [], rN: string[] = [], rF: number[] = [];
  for (const h of HOSTELS) {
    for (const wing of h.wings) {
      for (let f = 0; f < FLOORS; f++) {
        for (let n = 1; n <= ROOMS_PER_FLOOR_PER_WING; n++) {
          rH.push(h.hostel_name); rN.push(roomNo(wing, f, n)); rF.push(f);
        }
      }
    }
  }
  const roomsRes = await client.query(
    `INSERT INTO room (hostel_name, room_no, floor_no)
     SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::int[])
     ON CONFLICT (hostel_name, room_no) DO NOTHING`, [rH, rN, rF]);
  stats.rooms_inserted = roomsRes.rowCount ?? 0;

  // ---------------------------------------------------------------- admins
  for (const a of ADMINS) {
    await client.query(
      `INSERT INTO admin (full_name, email, role) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING`,
      [a.full_name, a.email, a.role]);
  }

  // ---------------------------------------------------------------- demo students
  for (const s of DEMO_STUDENTS) {
    await client.query(
      `INSERT INTO student (student_id, full_name, email, gender, program) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT DO NOTHING`,
      [s.student_id, s.full_name, `${s.student_id.toLowerCase()}@demo.campusconnect.invalid`, s.gender, s.program]);
  }

  // ---------------------------------------------------------------- stores & menu
  for (const st of STORES) {
    await client.query(
      `INSERT INTO campus_store (store_name, store_type, location, opens_at, closes_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (store_name) DO NOTHING`, [st.store_name, st.store_type, st.location, st.opens_at, st.closes_at]);
    for (const [item, cat, price, avail] of st.items) {
      await client.query(
        `INSERT INTO menu_item (store_name, item_name, category, price, is_available) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (store_name, item_name) DO NOTHING`, [st.store_name, item, cat, price, avail ?? true]);
    }
  }

  // ---------------------------------------------------------------- calendar
  for (const [title, type, start, end, desc] of CALENDAR) {
    await client.query(
      `INSERT INTO calendar (title, event_type, description, start_datetime, end_datetime)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (title, start_datetime) DO NOTHING`,
      [title, type, desc, `${start}${IST}`, end ? `${end}${IST}` : null]);
  }

  // ---------------------------------------------------------------- allocations
  // Only students that have NO allocation history are allocated, so re-running
  // the seed (or running it after admins moved people) never duplicates stays.
  const { rows: unallocated } = await client.query<{ student_id: string; gender: string }>(
    `SELECT s.student_id, s.gender FROM student s
      WHERE s.gender IN ('MALE','FEMALE')
        AND NOT EXISTS (SELECT 1 FROM room_allocation a WHERE a.student_id = s.student_id)
      ORDER BY s.student_id`);
  if (unallocated.length) {
    const { rows: roomRows } = await client.query<{ hostel_name: string; room_no: string; occupancy: number; gender: string }>(
      `SELECT r.hostel_name, r.room_no, r.occupancy, h.gender
         FROM room r JOIN hostel h USING (hostel_name) ORDER BY r.hostel_name, r.room_no`);
    const pools = new Map<string, { room_no: string; free: number }[]>();
    for (const r of roomRows) {
      if (!pools.has(r.hostel_name)) pools.set(r.hostel_name, []);
      pools.get(r.hostel_name)!.push({ room_no: r.room_no, free: Math.max(0, 2 - r.occupancy) });
    }
    for (const list of pools.values()) rng.shuffle(list);
    const cursor = new Map<string, number>();
    const hostelsFor = (g: string) => HOSTELS.filter((h) => h.gender === g).map((h) => h.hostel_name);

    const take = (hostel: string): string | null => {
      const list = pools.get(hostel)!;
      let i = cursor.get(hostel) ?? 0;
      while (i < list.length && list[i].free <= 0) i++;
      cursor.set(hostel, i);
      if (i >= list.length) return null;
      list[i].free--;
      return list[i].room_no;
    };

    const A = { sid: [] as string[], h: [] as string[], r: [] as string[], s: [] as string[], e: [] as (string | null)[], st: [] as string[] };
    const push = (sid: string, h: string, r: string, s: string, e: string | null) => {
      A.sid.push(sid); A.h.push(h); A.r.push(r); A.s.push(s); A.e.push(e); A.st.push(e ? 'ENDED' : 'ACTIVE');
    };

    for (const gender of ['MALE', 'FEMALE']) {
      const hostels = hostelsFor(gender);
      const group = rng.shuffle(unallocated.filter((u) => u.gender === gender));
      group.forEach((stu, idx) => {
        // round-robin keeps the hostels balanced; fall back to the next hostel when one is full
        let room: string | null = null, hostel = '';
        for (let k = 0; k < hostels.length && !room; k++) {
          hostel = hostels[(idx + k) % hostels.length];
          room = take(hostel);
        }
        if (!room) return; // every same-gender room is full - leave unallocated
        const m = /(20\d\d)/.exec(stu.student_id);
        const batch = m ? Number(m[1]) : 2026;
        const isDemo = stu.student_id.startsWith('DEMO');
        // Earlier stays (history) for ~15% of senior students and every senior demo student
        if (batch < 2026 && (isDemo || rng.chance(0.15))) {
          const prevYears = rng.int(1, Math.min(2, 2026 - batch));
          for (let y = 2026 - prevYears; y < 2026; y++) {
            const ph = rng.pick(hostels);
            const pr = roomNo(rng.pick(HOSTELS.find((x) => x.hostel_name === ph)!.wings), rng.int(0, FLOORS - 1), rng.int(1, ROOMS_PER_FLOOR_PER_WING));
            push(stu.student_id, ph, pr, `${y}-08-0${rng.int(1, 6)}`, `${y + 1}-05-${rng.int(15, 28)}`);
          }
        }
        const start = batch === 2026 ? '2026-08-03' : `2026-07-${rng.int(28, 31)}`;
        push(stu.student_id, hostel, room, start, null);
      });
    }
    const res = await client.query(
      `INSERT INTO room_allocation (student_id, hostel_name, room_no, start_date, end_date, status)
       SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::date[], $5::date[], $6::varchar[])
       ON CONFLICT DO NOTHING`, [A.sid, A.h, A.r, A.s, A.e, A.st]);
    stats.allocations_inserted = res.rowCount ?? 0;
    log(`  allocations: ${A.st.filter((s) => s === 'ACTIVE').length} active + ${A.st.filter((s) => s === 'ENDED').length} historical`);
  }

  // ---------------------------------------------------------------- synthetic transactions
  if (await seeded(client, 'demo_transactions')) {
    log('  demo transactions already seeded - skipped');
    return stats;
  }
  const { rows: demo } = await client.query<{ student_id: string }>(
    `SELECT student_id FROM student WHERE student_id = ANY($1) ORDER BY student_id`,
    [DEMO_STUDENTS.map((d) => d.student_id)]);
  const { rows: menu } = await client.query<{ store_name: string; item_name: string }>(
    `SELECT store_name, item_name FROM menu_item WHERE is_available ORDER BY store_name, item_name`);
  const byStore = new Map<string, string[]>();
  for (const m of menu) {
    if (!byStore.has(m.store_name)) byStore.set(m.store_name, []);
    byStore.get(m.store_name)!.push(m.item_name);
  }
  const storeNames = [...byStore.keys()];
  const foodStores = storeNames.filter((s) => !/Stationery|General/.test(s));
  const { rows: admins } = await client.query<{ admin_id: number }>('SELECT admin_id FROM admin ORDER BY admin_id');
  // opening window per store in minutes after local midnight (close may pass midnight)
  const { rows: hourRows } = await client.query<{ store_name: string; o: number | null; c: number | null }>(
    `SELECT store_name, EXTRACT(EPOCH FROM opens_at)::int / 60 AS o, EXTRACT(EPOCH FROM closes_at)::int / 60 AS c FROM campus_store`);
  const hoursOf = new Map(hourRows.map((h) => {
    const open = h.o ?? 0;
    let close = h.c ?? 24 * 60;
    if (close <= open) close += 24 * 60;
    return [h.store_name, { open, close }];
  }));

  // ---- orders, placed through the stored function so triggers do the totals
  let orders = 0;
  const cancelIds: number[] = [];
  const statusUpdates: { id: number; status: string }[] = [];
  for (const [i, { student_id }] of demo.entries()) {
    const n = rng.int(18, 34);
    const plan: string[] = [];
    if (i % 4 === 0) plan.push(...storeNames); // some students visit every store (relational-division report)
    while (plan.length < n) plan.push(rng.chance(0.85) ? rng.pick(foodStores) : rng.pick(storeNames));
    for (const store of plan) {
      const choices = rng.shuffle([...byStore.get(store)!]).slice(0, rng.int(1, 4));
      const items = choices.map((item_name) => ({ item_name, quantity: rng.int(1, 3) }));
      // A moment inside the store's opening hours (campus time, IST = UTC+5:30)
      const hrs = hoursOf.get(store)!;
      const daysAgo = rng.int(0, 104);
      let at = new Date(today.getTime() - daysAgo * DAY + rng.int(hrs.open, hrs.close - 10) * 60_000 - 330 * 60_000);
      if (at > now) at = new Date(at.getTime() - DAY); // not in the future: same time a day earlier
      const { rows } = await client.query<{ id: number }>(
        'SELECT sp_place_order($1, $2, $3::jsonb, $4) AS id', [student_id, store, JSON.stringify(items), at.toISOString()]);
      const id = rows[0].id;
      orders++;
      if (rng.chance(0.08)) cancelIds.push(id);
      else if (daysAgo >= 1) statusUpdates.push({ id, status: 'COMPLETED' });
      else statusUpdates.push({ id, status: rng.pick(['PLACED', 'PREPARING', 'READY', 'COMPLETED']) });
    }
  }
  for (const u of statusUpdates) {
    if (u.status !== 'PLACED') await client.query('UPDATE orders SET status = $2 WHERE order_id = $1', [u.id, u.status]);
  }
  if (cancelIds.length) await client.query(`UPDATE orders SET status = 'CANCELLED' WHERE order_id = ANY($1)`, [cancelIds]);
  stats.orders = orders;
  stats.cancelled_orders = cancelIds.length;

  // ---- outpasses
  let outpasses = 0;
  const hours = (h: number) => h * 3_600_000;
  const at = (d: Date) => d.toISOString();
  for (const { student_id } of demo) {
    const n = rng.int(4, 8);
    for (let k = 0; k < n; k++) {
      const kind = k === 0 ? 'PENDING' : k === 1 && rng.chance(0.4) ? 'OVERDUE'
        : rng.pick(['RETURNED', 'RETURNED', 'RETURNED', 'LATE', 'REJECTED', 'CANCELLED', 'UPCOMING']);
      const reason = rng.pick(OUTPASS_REASONS);
      const reviewer = rng.pick(admins).admin_id;
      let outAt: Date, returnBy: Date;
      if (kind === 'PENDING' || kind === 'UPCOMING') {
        outAt = new Date(today.getTime() + rng.int(1, 12) * DAY + hours(rng.int(8, 18)) - hours(5.5));
      } else if (kind === 'OVERDUE') {
        outAt = new Date(today.getTime() - rng.int(3, 6) * DAY + hours(rng.int(8, 18)) - hours(5.5));
      } else {
        outAt = new Date(today.getTime() - rng.int(4, 100) * DAY + hours(rng.int(8, 18)) - hours(5.5));
      }
      returnBy = new Date(outAt.getTime() + hours(rng.pick([6, 10, 24, 48, 72])));
      if (kind === 'OVERDUE' && returnBy >= now) returnBy = new Date(now.getTime() - hours(rng.int(4, 30)));
      const reviewedAt = new Date(outAt.getTime() - hours(rng.int(2, 40)));
      let row: (string | number | null)[];
      switch (kind) {
        case 'PENDING': row = [null, reason, at(outAt), at(returnBy), null, 'PENDING', null]; break;
        case 'UPCOMING': row = [reviewer, reason, at(outAt), at(returnBy), null, 'APPROVED', at(reviewedAt)]; break;
        case 'OVERDUE': row = [reviewer, reason, at(outAt), at(returnBy), null, 'APPROVED', at(reviewedAt)]; break;
        case 'RETURNED': row = [reviewer, reason, at(outAt), at(returnBy),
          at(new Date(returnBy.getTime() - hours(rng.int(0, 5)) - 60_000)), 'APPROVED', at(reviewedAt)]; break;
        case 'LATE': row = [reviewer, reason, at(outAt), at(returnBy),
          at(new Date(returnBy.getTime() + hours(rng.int(1, 9)))), 'APPROVED', at(reviewedAt)]; break;
        case 'REJECTED': row = [reviewer, reason, at(outAt), at(returnBy), null, 'REJECTED', at(reviewedAt)]; break;
        default: row = [null, reason, at(outAt), at(returnBy), null, 'CANCELLED', null];
      }
      await client.query(
        `INSERT INTO outpass_request (student_id, reviewed_by, reason, out_at, return_by, returned_at, status, reviewed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [student_id, ...row]);
      outpasses++;
    }
  }
  stats.outpasses = outpasses;

  // ---- documents (sample PDFs written to the uploads folder)
  let documents = 0;
  for (const { student_id } of demo) {
    const types = rng.shuffle([...DOC_TYPES]).slice(0, rng.int(2, 4));
    for (const [k, type] of types.entries()) {
      const slug = type.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const rel = path.posix.join(student_id, `seed-${k + 1}__${slug}.pdf`);
      const abs = path.join(opts.uploadDir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, samplePdf([
        'CampusConnect - sample document', `Type: ${type}`, `Student: ${student_id}`,
        'Synthetic file generated by the seed script for demonstration only.',
      ]));
      const status = rng.pick(['PENDING', 'VERIFIED', 'VERIFIED', 'REJECTED']);
      const uploaded = new Date(today.getTime() - rng.int(1, 90) * DAY + hours(rng.int(3, 15)));
      await client.query(
        `INSERT INTO document (student_id, doc_type, file_path, uploaded_at, verify_status) VALUES ($1,$2,$3,$4,$5)`,
        [student_id, type, rel, uploaded.toISOString(), status]);
      documents++;
    }
  }
  stats.documents = documents;

  await markSeeded(client, 'demo_transactions', { seed: SEED, anchor: isoDate(today), ...stats });
  log(`  demo transactions: ${orders} orders (${cancelIds.length} cancelled), ${outpasses} outpasses, ${documents} documents`);
  return stats;
}
