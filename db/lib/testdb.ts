import path from 'node:path';
import pg from 'pg';
import { DB_DIR } from './env.js';
import { migrate } from './migrations.js';
import { insertRoster, parseRoster } from './roster.js';
import { runSeed } from './seed.js';

/**
 * Drops and rebuilds the TEST database: migrations → roster import → seed.
 * Refuses to touch any database whose name does not end in "_test".
 */
export async function rebuildTestDatabase(url: string, uploadDir: string): Promise<void> {
  const u = new URL(url);
  const name = decodeURIComponent(u.pathname.slice(1));
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to rebuild "${name}": test database names must end with "_test" (set TEST_DATABASE_URL).`);
  }
  u.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: u.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(name)} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(name)} ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
  } finally {
    await admin.end();
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await migrate(client, () => undefined);
    const roster = await parseRoster(path.join(DB_DIR, 'seed', 'data', 'on_campus_list.xlsx'));
    await client.query('BEGIN');
    await insertRoster(client, roster.valid);
    await runSeed(client, { uploadDir, log: () => undefined });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');
  return url;
}
