/**
 * npm run db:local
 *
 * Starts a REAL PostgreSQL server for machines that do not have one
 * installed.  The `embedded-postgres` package ships official PostgreSQL
 * binaries; data is kept in <project>/.pgdata so it survives restarts.
 * Host, port, user and password are taken from DATABASE_URL.
 * Leave this terminal open; press Ctrl+C to stop the server.
 */
import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { databaseUrl, ROOT_DIR } from '../lib/env.js';
import { ensureDatabase } from '../lib/db.js';

const url = new URL(databaseUrl());
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  console.error(`DATABASE_URL points at ${url.hostname}; db:local only runs a server on localhost.`);
  process.exit(1);
}

const port = Number(url.port || 5432);
const user = decodeURIComponent(url.username || 'postgres');
const password = decodeURIComponent(url.password || 'postgres');
const dataDir = path.join(ROOT_DIR, '.pgdata');

const pgServer = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => undefined,
  onError: (msg: unknown) => console.error(String(msg)),
});

// Already running (e.g. a previous terminal was closed without Ctrl+C)?
try {
  const probe = new pg.Client({ host: 'localhost', port, user, password, database: 'postgres', connectionTimeoutMillis: 1500 });
  await probe.connect();
  await probe.end();
  console.log(`✓ A PostgreSQL server is already running on localhost:${port} - nothing to do.`);
  console.log(`  To stop it: node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl stop -D .pgdata`);
  process.exit(0);
} catch {
  /* not running - start it below */
}

if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
  console.log(`Initialising a new PostgreSQL cluster in ${dataDir} ...`);
  await pgServer.initialise();
}

await pgServer.start();
console.log(`\n✓ PostgreSQL is running on localhost:${port} (user "${user}")`);

for (const name of [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL]) {
  if (!name) continue;
  try {
    const created = await ensureDatabase(name);
    const db = new URL(name).pathname.slice(1);
    console.log(`  database "${db}" ${created ? 'created' : 'exists'}`);
  } catch (err) {
    console.error(`  could not create database: ${(err as Error).message}`);
  }
}
console.log('\nLeave this window open. Press Ctrl+C to stop PostgreSQL.\n');

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping PostgreSQL ...');
  await pgServer.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// keep the process alive
setInterval(() => undefined, 1 << 30);
