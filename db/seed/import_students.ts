/**
 * npm run db:import
 *
 * Imports the on-campus roster (db/seed/data/on_campus_list.xlsx) into
 * STUDENT.  Mapping:  Campus ID → student_id, Name → full_name,
 * Sex M/F → gender MALE/FEMALE.  phone and program stay NULL (not supplied);
 * e-mail is a generated, undeliverable address on the reserved .invalid TLD.
 *
 * The spreadsheet's first "ID" column has no column in the approved schema,
 * so it is preserved in db/seed/output/student_import_audit.csv together
 * with every skipped row and the reason it was skipped.
 *
 * Idempotent: re-running inserts nothing new (ON CONFLICT DO NOTHING).
 * Usage: npm run db:import [-- path/to/file.xlsx]
 */
import fs from 'node:fs';
import path from 'node:path';
import { DB_DIR, databaseUrl } from '../lib/env.js';
import { connect, withTransaction } from '../lib/db.js';
import { auditCsv, insertRoster, parseRoster } from '../lib/roster.js';

const file = path.resolve(process.argv[2] ?? path.join(DB_DIR, 'seed', 'data', 'on_campus_list.xlsx'));
if (!fs.existsSync(file)) {
  console.error(`✖ Roster file not found: ${file}`);
  process.exit(1);
}

console.log(`\nReading ${path.basename(file)} ...`);
const parsed = await parseRoster(file);
const reasons = parsed.skipped.reduce<Record<string, number>>((acc, s) => {
  const key = s.reason.replace(/\(.*\)/, '').trim();
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});
const male = parsed.valid.filter((s) => s.gender === 'MALE').length;

console.log(`  sheet "${parsed.sheet}", ${parsed.totalRows} rows`);
console.log(`  valid records : ${parsed.valid.length}  (male ${male}, female ${parsed.valid.length - male})`);
console.log(`  skipped rows  : ${parsed.skipped.length}  ${JSON.stringify(reasons)}`);

const outDir = path.join(DB_DIR, 'seed', 'output');
fs.mkdirSync(outDir, { recursive: true });
const auditFile = path.join(outDir, 'student_import_audit.csv');
fs.writeFileSync(auditFile, auditCsv(parsed));
console.log(`  audit / ID mapping written to ${path.relative(process.cwd(), auditFile)}`);

const client = await connect(databaseUrl());
try {
  const inserted = await withTransaction(client, () => insertRoster(client, parsed.valid));
  const { rows } = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM student');
  console.log(`  inserted ${inserted} new students (${parsed.valid.length - inserted} already present)`);
  console.log(`  STUDENT now holds ${rows[0].n} rows\nDone.\n`);
} catch (err) {
  console.error(`\n✖ Import failed and was rolled back: ${(err as Error).message}\n`);
  process.exitCode = 1;
} finally {
  await client.end();
}
