/**
 * Browser end-to-end check of the main workflows through the real UI.
 *
 *   1. start PostgreSQL, the API and the web app (npm run dev)
 *   2. npm run test:e2e --workspace frontend
 *
 * Uses playwright-core with an installed Chrome / Edge (no browser download).
 * NOTE: it runs against the DEVELOPMENT database and creates real rows for the
 * synthetic DEMO accounts (one order, one outpass, one document, one transfer).
 * Set E2E_BASE_URL / CHROME_PATH / E2E_STUDENT_PW / E2E_ADMIN_PW to override.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const STUDENT = { id: 'DEMO2024A3PS003H', pw: process.env.E2E_STUDENT_PW ?? 'student@123' };
const ADMIN = { id: 'admin@campusconnect.invalid', pw: process.env.E2E_ADMIN_PW ?? 'admin@123' };
const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No Chrome/Edge found - set CHROME_PATH.');
  process.exit(1);
}

const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`  ✖ ${name}\n      ${String(e.message).split('\n')[0]}`);
  }
}

const browser = await chromium.launch({ executablePath });
const errors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(10_000);
  return page;
}
async function signIn(page, role, who) {
  await page.goto(`${BASE}/login`);
  if (role === 'admin') await page.getByRole('tab', { name: /Administrator/ }).click();
  await page.fill('#identifier', who.id);
  await page.fill('#password', who.pw);
  await page.getByRole('button', { name: /Sign in as/ }).click();
  await page.waitForURL(`**/${role}`);
}

const tag = `E2E ${Date.now()}`;
console.log(`\nCampusConnect end-to-end workflows → ${BASE}\n`);

// ------------------------------------------------------------------ student
const s = await newPage();
await step('student signs in and sees the dashboard', async () => {
  await signIn(s, 'student', STUDENT);
  await s.getByText('Rohan Verma').first().waitFor();
  await s.getByText('Orders placed').waitFor();
});

let orderId;
let openStore = null;
await step('closed stores cannot take orders (UI and database)', async () => {
  await s.goto(`${BASE}/student/stores`);
  const cards = s.locator('button.snap-start');
  await cards.first().waitFor();
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    const c = cards.nth(i);
    const name = (await c.locator('p').first().textContent()).trim();
    if (await c.getByText('Open now').count()) openStore ??= name;
    else {
      await c.click();
      await s.getByText(/is closed right now/).waitFor();
      if (await s.getByRole('button', { name: 'Add', exact: true }).count()) throw new Error(`${name}: Add enabled while closed`);
    }
  }
});

await step('student places an order at an open store (one transaction)', async () => {
  if (!openStore) { console.log('      (no store is open at this hour - order steps skipped)'); return; }
  await s.goto(`${BASE}/student/stores?store=${encodeURIComponent(openStore)}`);
  const add = s.getByRole('button', { name: 'Add', exact: true });
  await add.first().click();
  await add.first().click();
  await s.getByRole('button', { name: /View cart/ }).click();
  await s.getByRole('button', { name: /Place order ·/ }).click();
  const dlg = s.getByRole('dialog');
  await dlg.getByText('Order placed').waitFor();
  orderId = (await dlg.locator('p.font-mono').textContent()).replace('#', '').trim();
  await dlg.getByRole('button', { name: 'Keep browsing' }).click();
  // regression: the page must scroll again after the confirmation closes
  if (await s.evaluate(() => document.body.style.overflow) === 'hidden') throw new Error('page scroll still locked');
});

await step('the order appears in the order history with its items', async () => {
  if (!orderId) return;
  await s.goto(`${BASE}/student/orders/${orderId}`);
  await s.getByRole('heading', { name: new RegExp(`Order #${orderId}`) }).waitFor();
  await s.getByText('Order total').waitFor();
});

await step('student cancels the order; trigger adjusts the spend', async () => {
  if (!orderId) return;
  await s.getByRole('button', { name: 'Cancel order' }).click();
  await s.getByRole('dialog').getByRole('button', { name: 'Cancel order' }).click();
  await s.getByText(/Your total spend changed/).waitFor();
  await s.getByText('Cancelled', { exact: true }).first().waitFor();
});

await step('student submits an outpass request', async () => {
  await s.goto(`${BASE}/student/outpass`);
  await s.getByRole('button', { name: 'New outpass' }).first().click();
  await s.getByPlaceholder('e.g. Going home for the weekend').fill(tag);
  await s.getByRole('button', { name: 'Submit request' }).click();
  await s.getByText('Outpass requested').waitFor();
  await s.getByText(tag).waitFor();
});

await step('student uploads a document (file on disk, metadata in DOCUMENT)', async () => {
  // Use a valid sample PDF produced by the seed script (falls back to a minimal one).
  const file = path.join(os.tmpdir(), 'cc-e2e-fee-receipt.pdf');
  const uploads = path.resolve(fileURLToPath(new URL('../../uploads', import.meta.url)));
  const seeded = fs.existsSync(uploads)
    && fs.readdirSync(uploads, { recursive: true }).map(String).find((f) => /seed-.*\.pdf$/.test(f));
  if (seeded) fs.copyFileSync(path.join(uploads, seeded), file);
  else fs.writeFileSync(file, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  await s.goto(`${BASE}/student/documents`);
  await s.locator('input[type=file]').setInputFiles(file);
  await s.getByRole('combobox').selectOption('Fee Receipt');
  await s.getByRole('button', { name: 'Upload document' }).click();
  await s.getByText('Document uploaded').waitFor();
  await s.getByText('cc_e2e_fee_receipt.pdf').first().waitFor();
});

// ------------------------------------------------------------------ admin
const a = await newPage();
await step('admin signs in; dashboard shows live totals', async () => {
  await signIn(a, 'admin', ADMIN);
  await a.getByText('Registered students').waitFor();
  await a.getByText('4,663').first().waitFor();
});

await step('admin approves the new outpass (review transaction)', async () => {
  await a.goto(`${BASE}/admin/outpasses`);
  await a.getByPlaceholder(/Search student ID, name or reason/).fill(tag);
  await a.getByText(tag).first().click();
  await a.getByRole('button', { name: 'Approve', exact: true }).first().click();
  await a.getByRole('dialog').last().getByRole('button', { name: 'Approve', exact: true }).click();
  await a.getByText('Approved', { exact: true }).first().waitFor();
});

await step('admin transfers a student; both occupancies update', async () => {
  await a.goto(`${BASE}/admin/allocations?student=${STUDENT.id}`);
  await a.getByRole('button', { name: 'Transfer to another room' }).click();
  // a random empty room: moving back into a room left earlier the same day would repeat the
  // primary key (student, hostel, room, start_date) and is correctly refused by PostgreSQL
  const empty = a.locator('button.rounded-xl', { hasText: 'empty' });
  await empty.first().waitFor();
  await empty.nth(Math.floor(Math.random() * Math.min(20, await empty.count()))).click();
  await a.getByRole('button', { name: 'Confirm transfer' }).click();
  await a.getByText('Transaction committed').waitFor();
});

await step('Integrity Lab: every scenario passes', async () => {
  await a.goto(`${BASE}/admin/integrity`);
  const done = a.waitForResponse((r) => r.url().includes('/api/integrity/tests/run-all'), { timeout: 30_000 });
  await a.getByRole('button', { name: /Run all tests/ }).click();
  const body = await (await done).json();
  if (body.passed !== body.total) throw new Error(`${body.passed}/${body.total} scenarios passed`);
});

await step('reports run live and render a chart', async () => {
  await a.goto(`${BASE}/admin/reports?r=store_sales`);
  await a.getByText(/executed live on PostgreSQL/).first().waitFor();
  await a.locator('.recharts-bar-rectangle').first().waitFor();
});

await browser.close();
const failed = results.filter((r) => !r.ok).length;
if (errors.length) console.log(`\n  page errors:\n    ${errors.join('\n    ')}`);
console.log(`\n${results.length - failed}/${results.length} workflow checks passed${errors.length ? `, ${errors.length} page error(s)` : ''}.\n`);
process.exit(failed || errors.length ? 1 : 0);
