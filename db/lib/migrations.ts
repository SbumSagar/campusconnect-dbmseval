import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { DB_DIR } from './env.js';

export interface Migration {
  id: string;
  file: string;
  /** Repeatable migrations (views, functions) are re-applied when their checksum changes. */
  repeatable: boolean;
}

export const DOMAIN_TABLES = [
  'hostel', 'room', 'student', 'room_allocation', 'campus_store', 'menu_item',
  'orders', 'order_item', 'document', 'admin', 'outpass_request', 'calendar',
] as const;

/**
 * Ordered migration list:
 *   V001  db/schema.sql            - the approved core schema (applied once)
 *   V0xx  db/migrations/V0xx__*.sql - future versioned, forward-only changes
 *   R     db/views.sql, db/functions.sql - repeatable (CREATE OR REPLACE)
 */
export function listMigrations(): Migration[] {
  const versioned: Migration[] = [{ id: 'V001__core_schema', file: path.join(DB_DIR, 'schema.sql'), repeatable: false }];
  const dir = path.join(DB_DIR, 'migrations');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((f) => /^V\d{3}__.+\.sql$/.test(f)).sort()) {
      if (f.startsWith('V001__')) continue;
      versioned.push({ id: f.replace(/\.sql$/, ''), file: path.join(dir, f), repeatable: false });
    }
  }
  return [
    ...versioned,
    { id: 'R__views', file: path.join(DB_DIR, 'views.sql'), repeatable: true },
    { id: 'R__functions', file: path.join(DB_DIR, 'functions.sql'), repeatable: true },
  ];
}

const checksum = (text: string) => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

/**
 * Non-destructive migration runner.  Tracks applied files in the
 * separate schema `app_meta` (kept out of the 12-relation domain schema).
 * Never drops anything; safe to run on every deployment.
 */
export async function migrate(client: pg.Client, log: (msg: string) => void = console.log): Promise<void> {
  await client.query('SELECT pg_advisory_lock(727001)');
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS app_meta');
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_meta.schema_migrations (
        id          TEXT PRIMARY KEY,
        checksum    TEXT        NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_meta.seed_log (
        section     TEXT PRIMARY KEY,
        details     JSONB,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    for (const m of listMigrations()) {
      const sql = fs.readFileSync(m.file, 'utf8');
      const sum = checksum(sql);
      const { rows } = await client.query<{ checksum: string }>(
        'SELECT checksum FROM app_meta.schema_migrations WHERE id = $1', [m.id]);
      const label = path.relative(path.dirname(DB_DIR), m.file).replace(/\\/g, '/');

      if (rows.length && rows[0].checksum === sum) {
        log(`  ✓ ${m.id.padEnd(22)} up to date   (${label})`);
        continue;
      }
      if (rows.length && !m.repeatable) {
        log(`  ! ${m.id.padEnd(22)} file changed after it was applied - NOT re-run.`);
        log(`    Put schema changes in a new versioned file db/migrations/V0xx__description.sql`);
        continue;
      }

      // Baseline: a database created earlier with the mid-sem schema script.
      if (!rows.length && m.id === 'V001__core_schema') {
        const { rows: ex } = await client.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = ANY($1)`, [DOMAIN_TABLES as unknown as string[]]);
        if (ex[0].n === DOMAIN_TABLES.length) {
          await client.query('INSERT INTO app_meta.schema_migrations (id, checksum) VALUES ($1, $2)', [m.id, sum]);
          log(`  ✓ ${m.id.padEnd(22)} existing schema detected - baselined without changes`);
          continue;
        }
        if (ex[0].n > 0) {
          throw new Error(`Found ${ex[0].n}/12 CampusConnect tables - partial schema. Inspect the database manually.`);
        }
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO app_meta.schema_migrations (id, checksum) VALUES ($1, $2)
           ON CONFLICT (id) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()`, [m.id, sum]);
        await client.query('COMMIT');
        log(`  + ${m.id.padEnd(22)} applied      (${label})`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${m.id} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)');
  }
}
