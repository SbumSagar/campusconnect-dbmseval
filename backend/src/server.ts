import { env } from './config/env.js';
import { createApp } from './app.js';
import { checkDatabase, pool } from './db/pool.js';

const db = await checkDatabase();
if (!db.ok) {
  console.error(`\n✖ PostgreSQL is not ready: ${db.message}`);
  console.error('  Start PostgreSQL (npm run db:local), then run: npm run db:setup\n');
  process.exit(1);
}

const server = createApp().listen(env.PORT, () => {
  console.log(`\n✓ CampusConnect API listening on http://localhost:${env.PORT}  (database ${db.message})\n`);
});

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
