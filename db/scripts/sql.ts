/**
 * npm run db:sql                      interactive SQL console (end statements with ;)
 * npm run db:sql -- "SELECT ..."      run one statement and print the result
 *
 * A minimal psql substitute for the live demo (the embedded PostgreSQL
 * package ships the server, not the psql client). Uses DATABASE_URL.
 */
import readline from 'node:readline';
import { databaseUrl, maskUrl } from '../lib/env.js';
import { connect } from '../lib/db.js';

const client = await connect(databaseUrl());

async function run(sql: string) {
  const t0 = performance.now();
  try {
    const results = await client.query(sql);
    for (const r of Array.isArray(results) ? results : [results]) {
      if (r.rows?.length) console.table(r.rows.length > 200 ? r.rows.slice(0, 200) : r.rows);
      console.log(`${r.command ?? ''} ${r.rowCount ?? 0}${r.rows?.length > 200 ? ' (first 200 shown)' : ''}  (${(performance.now() - t0).toFixed(1)} ms)\n`);
    }
  } catch (err) {
    const e = err as Error & { code?: string; constraint?: string; detail?: string };
    console.log(`ERROR ${e.code ?? ''}: ${e.message}`);
    if (e.constraint) console.log(`  constraint: ${e.constraint}`);
    if (e.detail) console.log(`  detail: ${e.detail}`);
    console.log('');
  }
}

const arg = process.argv.slice(2).join(' ').trim();
if (arg) {
  await run(arg);
  await client.end();
} else {
  console.log(`CampusConnect SQL console → ${maskUrl(databaseUrl())}`);
  console.log('End each statement with ;  ·  BEGIN/ROLLBACK work as usual  ·  \\q to quit\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'campusconnect=> ' });
  let buffer = '';
  let pending = Promise.resolve(); // statements run strictly one after another
  let closed = false;
  rl.prompt();
  rl.on('line', (line) => {
    if (!buffer && line.trim() === '\\q') return rl.close();
    buffer += line + '\n';
    if (buffer.trim().endsWith(';')) {
      const sql = buffer;
      buffer = '';
      pending = pending.then(() => run(sql)).then(() => { if (!closed) rl.prompt(); });
    } else {
      rl.setPrompt('campusconnect-> ');
      rl.prompt();
    }
    rl.setPrompt('campusconnect=> ');
  });
  rl.on('close', async () => {
    closed = true;
    await pending;
    await client.end();
    process.exit(0);
  });
}
