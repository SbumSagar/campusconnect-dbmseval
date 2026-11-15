/**
 * npm run db:audit
 * Runs every query of db/audit.sql; each must return zero rows.
 * Exit code 1 when any audit finds inconsistent rows.
 */
import path from 'node:path';
import { DB_DIR, databaseUrl } from '../lib/env.js';
import { connect } from '../lib/db.js';
import { loadNamedQueries } from '../lib/sqlfile.js';

const audits = loadNamedQueries(path.join(DB_DIR, 'audit.sql'));
const client = await connect(databaseUrl());
let failed = 0;
try {
  console.log('\nCampusConnect audit queries (each must return 0 rows)\n');
  for (const q of audits.values()) {
    const { rowCount } = await client.query(q.sql);
    const ok = rowCount === 0;
    if (!ok) failed++;
    console.log(`  ${ok ? '✓' : '✖'} ${q.name.padEnd(36)} ${rowCount} row(s)   ${q.comment.split('\n')[0]}`);
  }
  console.log(failed ? `\n✖ ${failed} audit(s) failed\n` : '\nAll audits passed.\n');
} finally {
  await client.end();
}
process.exitCode = failed ? 1 : 0;
