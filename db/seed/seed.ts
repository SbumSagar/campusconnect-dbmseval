/**
 * npm run db:seed
 *
 * Generates the reproducible demonstration dataset (fixed PRNG seed):
 * six hostels and 2,600 rooms, gender-correct ACTIVE allocations for
 * every student (plus historical stays), admins, stores and menus, the
 * 2026-27 calendar, and synthetic orders / outpasses / documents for the
 * DEMO* accounts only.  Runs in ONE transaction and is idempotent.
 * Run `npm run db:import` first so the real roster is allocated too.
 */
import path from 'node:path';
import { ROOT_DIR, databaseUrl } from '../lib/env.js';
import { connect, withTransaction } from '../lib/db.js';
import { runSeed } from '../lib/seed.js';

const uploadDir = path.resolve(ROOT_DIR, process.env.UPLOAD_DIR || 'uploads');
const client = await connect(databaseUrl());

try {
  console.log('\nSeeding CampusConnect ...');
  const t0 = Date.now();
  await withTransaction(client, () => runSeed(client, { uploadDir }));
  const { rows } = await client.query(`
    SELECT 'hostel' AS relation, COUNT(*)::int AS n FROM hostel UNION ALL
    SELECT 'room', COUNT(*) FROM room UNION ALL
    SELECT 'student', COUNT(*) FROM student UNION ALL
    SELECT 'room_allocation', COUNT(*) FROM room_allocation UNION ALL
    SELECT 'campus_store', COUNT(*) FROM campus_store UNION ALL
    SELECT 'menu_item', COUNT(*) FROM menu_item UNION ALL
    SELECT 'orders', COUNT(*) FROM orders UNION ALL
    SELECT 'order_item', COUNT(*) FROM order_item UNION ALL
    SELECT 'document', COUNT(*) FROM document UNION ALL
    SELECT 'admin', COUNT(*) FROM admin UNION ALL
    SELECT 'outpass_request', COUNT(*) FROM outpass_request UNION ALL
    SELECT 'calendar', COUNT(*) FROM calendar`);
  console.table(rows);
  const total = rows.reduce((s, r) => s + r.n, 0);
  console.log(`Total rows: ${total}  (${((Date.now() - t0) / 1000).toFixed(1)} s)\nDone.\n`);
} catch (err) {
  console.error(`\n✖ Seed failed and was rolled back: ${(err as Error).message}\n`);
  process.exitCode = 1;
} finally {
  await client.end();
}
