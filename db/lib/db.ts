import pg from 'pg';

// Return NUMERIC and BIGINT as JS numbers / strings consistently.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    const e = err as Error & { code?: string };
    console.error(`\n✖ Could not connect to PostgreSQL: ${e.message}`);
    if (e.code === '3D000') {
      console.error('  The database does not exist. Create it (createdb campusconnect) or run `npm run db:local`.');
    } else {
      console.error('  Is PostgreSQL running? Start one with `npm run db:local` or check DATABASE_URL in .env.');
    }
    process.exit(1);
  }
  return client;
}

/** Run `fn` inside BEGIN/COMMIT; ROLLBACK on any error and re-throw. */
export async function withTransaction<T>(client: pg.Client, fn: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

/** Create the database named in `url` if it does not exist (connects to `postgres`). */
export async function ensureDatabase(url: string): Promise<boolean> {
  const u = new URL(url);
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ''));
  u.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: u.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rowCount) return false;
    await admin.query(
      `CREATE DATABASE ${pg.escapeIdentifier(dbName)} ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
    return true;
  } finally {
    await admin.end();
  }
}
