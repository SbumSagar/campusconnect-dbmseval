/**
 * npm run db:migrate
 * Creates the database if needed and applies pending migrations.
 * Non-destructive: never drops tables or data.
 */
import { databaseUrl, maskUrl } from '../lib/env.js';
import { connect, ensureDatabase } from '../lib/db.js';
import { migrate } from '../lib/migrations.js';

const url = databaseUrl();
console.log(`\nCampusConnect migrations → ${maskUrl(url)}`);

try {
  if (await ensureDatabase(url)) console.log('  + database created');
} catch (err) {
  console.warn(`  (could not check/create the database automatically: ${(err as Error).message})`);
}

const client = await connect(url);
try {
  await migrate(client);
  console.log('Done.\n');
} catch (err) {
  console.error(`\n✖ ${(err as Error).message}\n`);
  process.exitCode = 1;
} finally {
  await client.end();
}
