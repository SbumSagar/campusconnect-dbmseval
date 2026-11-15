import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { DB_SQL_DIR, env } from '../config/env.js';

// NUMERIC / BIGINT → JS number (amounts are NUMERIC(12,2), ids are BIGINT identity).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));
// DATE → plain 'YYYY-MM-DD' string (no timezone shifting).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => console.error('[pg] idle client error:', err.message));

export type Queryable = pg.Pool | pg.PoolClient;

/** Parameterised query helper - the ONLY way the app talks to PostgreSQL. */
export async function query<T extends pg.QueryResultRow = any>(
  text: string, params: unknown[] = [], db: Queryable = pool,
): Promise<pg.QueryResult<T>> {
  return db.query<T>(text, params);
}

/**
 * Runs `fn` inside BEGIN ... COMMIT on one pooled connection.
 * Any error → ROLLBACK and re-throw. Deferred constraint triggers
 * (e.g. ctrg_order_has_items) are evaluated at the COMMIT.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- named SQL files
export interface NamedQuery { name: string; comment: string; sql: string }

export function loadNamedQueries(file: string): Map<string, NamedQuery> {
  const text = fs.readFileSync(path.join(DB_SQL_DIR, file), 'utf8');
  const out = new Map<string, NamedQuery>();
  for (const part of text.split(/^--\s*@name:\s*/m).slice(1)) {
    const nl = part.indexOf('\n');
    const name = part.slice(0, nl).trim();
    const lines = part.slice(nl + 1).split(/\r?\n/);
    let i = 0;
    const comment: string[] = [];
    while (i < lines.length && /^\s*--/.test(lines[i])) comment.push(lines[i++].replace(/^\s*--\s?/, ''));
    out.set(name, { name, comment: comment.join('\n').trim(), sql: lines.slice(i).join('\n').trim().replace(/;\s*$/, '') });
  }
  return out;
}

/** Verifies connectivity and that the 12 relations exist (startup check). */
export async function checkDatabase(): Promise<{ ok: boolean; message: string }> {
  try {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [['hostel', 'room', 'student', 'room_allocation', 'campus_store', 'menu_item', 'orders',
        'order_item', 'document', 'admin', 'outpass_request', 'calendar']]);
    if (rows[0].n < 12) return { ok: false, message: `Only ${rows[0].n}/12 tables found - run "npm run db:migrate".` };
    const fn = await pool.query(`SELECT to_regprocedure('sp_place_order(varchar,varchar,jsonb,timestamptz)') AS f`);
    if (!fn.rows[0].f) return { ok: false, message: 'sp_place_order missing - run "npm run db:migrate".' };
    return { ok: true, message: 'connected' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
