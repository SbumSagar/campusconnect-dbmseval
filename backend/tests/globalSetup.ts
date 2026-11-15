import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { rebuildTestDatabase, testDatabaseUrl } from '../../db/lib/testdb.js';

/** Rebuilds the test database once before the API test suite. */
export default async function setup() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  await rebuildTestDatabase(testDatabaseUrl(), path.join(root, 'backend', 'test-uploads'));
  // Tests place orders "now": keep the stores they use open around the clock.
  // Opening-hours enforcement is tested explicitly in api.test.ts ('closed store').
  const c = new pg.Client({ connectionString: testDatabaseUrl() });
  await c.connect();
  await c.query(`UPDATE campus_store SET opens_at = NULL, closes_at = NULL WHERE store_name IN ('Central Canteen', 'Night Canteen')`);
  await c.end();
}
