/**
 * npm run db:reset:dev   (DEVELOPMENT ONLY - DESTRUCTIVE)
 *
 * Drops every CampusConnect object (db/dev/reset.sql), then re-applies
 * the migrations.  Refuses to run unless ALLOW_DB_RESET=yes and
 * NODE_ENV is not "production".  Re-run db:import and db:seed afterwards.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DB_DIR, databaseUrl, maskUrl } from '../lib/env.js';
import { connect } from '../lib/db.js';
import { migrate } from '../lib/migrations.js';

const url = databaseUrl();
if (process.env.ALLOW_DB_RESET !== 'yes' || process.env.NODE_ENV === 'production') {
  console.error('\n✖ Refusing to reset the database.');
  console.error('  This DROPS ALL CampusConnect tables and data. To proceed set ALLOW_DB_RESET=yes in .env');
  console.error('  (and make sure NODE_ENV is not production), then run the command again.\n');
  process.exit(1);
}

console.log(`\n⚠ Resetting ${maskUrl(url)} ...`);
const client = await connect(url);
try {
  await client.query(fs.readFileSync(path.join(DB_DIR, 'dev', 'reset.sql'), 'utf8'));
  console.log('  all objects dropped');
  await migrate(client);
  console.log('Reset complete. Now run: npm run db:import && npm run db:seed\n');
} finally {
  await client.end();
}
