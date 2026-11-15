/**
 * REST API integration tests: Express app + real PostgreSQL test database.
 *   npm run test:backend
 */
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { UPLOAD_ROOT } from '../src/config/env.js';
import { pool, query } from '../src/db/pool.js';

const app = createApp();
const STUDENT = 'DEMO2023A7PS001H';
const OTHER_STUDENT = 'DEMO2023B3PS002H';
let studentCookie: string[];
let otherCookie: string[];
let adminCookie: string[];

async function login(role: 'student' | 'admin', identifier: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ role, identifier, password });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.headers['set-cookie'] as unknown as string[];
}

const spendOf = async (id: string) =>
  Number((await query('SELECT total_deductions_amount AS s FROM student WHERE student_id = $1', [id])).rows[0].s);

beforeAll(async () => {
  studentCookie = await login('student', STUDENT, 'student-test-pw');
  otherCookie = await login('student', OTHER_STUDENT, 'student-test-pw');
  adminCookie = await login('admin', 'admin@campusconnect.invalid', 'admin-test-pw');
});
afterAll(async () => {
  await pool.end();
  fs.rmSync(UPLOAD_ROOT, { recursive: true, force: true });
});

// ------------------------------------------------------------------ auth
describe('authentication', () => {
  it('reports health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ role: 'student', identifier: STUDENT, password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('does not give logins to real roster students', async () => {
    const res = await request(app).post('/api/auth/login').send({ role: 'student', identifier: '2020A3PS2116H', password: 'student-test-pw' });
    expect(res.status).toBe(401);
  });

  it('sets an httpOnly session cookie and returns the user', async () => {
    const res = await request(app).post('/api/auth/login').send({ role: 'admin', identifier: 'ADMIN@campusconnect.invalid', password: 'admin-test-pw' });
    expect(res.headers['set-cookie'][0]).toMatch(/cc_session=.*HttpOnly/);
    expect(res.body.user).toMatchObject({ role: 'admin', adminId: 1 });
  });

  it('validates the login body', async () => {
    const res = await request(app).post('/api/auth/login').send({ role: 'root', identifier: '', password: '' });
    expect(res.status).toBe(400);
  });

  it('requires a session for protected routes', async () => {
    expect((await request(app).get('/api/students/me')).status).toBe(401);
    expect((await request(app).get('/api/orders').set('Cookie', ['cc_session=forged.token.value'])).status).toBe(401);
  });

  it('logs out by clearing the cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.headers['set-cookie'][0]).toMatch(/cc_session=;/);
  });
});

// ------------------------------------------------------------------ authorization
describe('authorization', () => {
  it.each([
    ['GET', '/api/students'], ['GET', '/api/admin/dashboard'], ['GET', '/api/reports'],
    ['POST', '/api/integrity/tests/run-all'], ['POST', '/api/allocations/transfer'], ['PATCH', '/api/orders/1/status'],
  ])('student gets 403 on %s %s', async (method, url) => {
    const res = await (request(app) as any)[method.toLowerCase()](url).set('Cookie', studentCookie).send({});
    expect(res.status).toBe(403);
  });

  it('admin gets 403 on student-only actions', async () => {
    const res = await request(app).post('/api/orders').set('Cookie', adminCookie)
      .send({ store_name: 'Central Canteen', items: [{ item_name: 'Masala Dosa', quantity: 1 }] });
    expect(res.status).toBe(403);
  });

  it('a student cannot read another student\'s order, outpass or document', async () => {
    const o = (await query('SELECT order_id FROM orders WHERE student_id = $1 LIMIT 1', [OTHER_STUDENT])).rows[0];
    const p = (await query('SELECT request_id FROM outpass_request WHERE student_id = $1 LIMIT 1', [OTHER_STUDENT])).rows[0];
    const d = (await query('SELECT document_id FROM document WHERE student_id = $1 LIMIT 1', [OTHER_STUDENT])).rows[0];
    expect((await request(app).get(`/api/orders/${o.order_id}`).set('Cookie', studentCookie)).status).toBe(404);
    expect((await request(app).get(`/api/outpasses/${p.request_id}`).set('Cookie', studentCookie)).status).toBe(404);
    expect((await request(app).get(`/api/documents/${d.document_id}/file`).set('Cookie', studentCookie)).status).toBe(404);
  });

  it('student list endpoints only return the caller\'s own rows', async () => {
    for (const url of ['/api/orders?pageSize=100', '/api/outpasses?pageSize=100', '/api/documents?pageSize=100']) {
      const res = await request(app).get(url).set('Cookie', studentCookie);
      expect(res.status).toBe(200);
      expect(res.body.rows.length).toBeGreaterThan(0);
      expect(res.body.rows.every((r: { student_id: string }) => r.student_id === STUDENT)).toBe(true);
    }
  });
});

// ------------------------------------------------------------------ students, stores, menu
describe('students, stores and menu', () => {
  it('student sees own profile and dashboard', async () => {
    const res = await request(app).get('/api/students/me/dashboard').set('Cookie', studentCookie);
    expect(res.body.profile.student_id).toBe(STUDENT);
    expect(res.body.profile.hostel_name).toBeTruthy();
    expect(res.body.stats.orders_total).toBeGreaterThan(0);
  });

  it('admin can search and paginate the 4,663 students', async () => {
    const all = await request(app).get('/api/students?pageSize=10').set('Cookie', adminCookie);
    expect(all.body.total).toBe(4663);
    expect(all.body.rows).toHaveLength(10);
    const female = await request(app).get('/api/students?gender=FEMALE&hostel=Meera&pageSize=5').set('Cookie', adminCookie);
    expect(female.body.rows.every((s: { gender: string; hostel_name: string }) => s.gender === 'FEMALE' && s.hostel_name === 'Meera')).toBe(true);
    const search = await request(app).get('/api/students?q=aarav').set('Cookie', adminCookie);
    expect(search.body.rows.some((s: { student_id: string }) => s.student_id === STUDENT)).toBe(true);
  });

  it('treats LIKE wildcards in searches literally', async () => {
    const underscore = await request(app).get('/api/students?q=_').set('Cookie', adminCookie);
    expect(underscore.body.total).toBe(0);
    const percent = await request(app).get('/api/students?q=%25').set('Cookie', adminCookie);
    expect(percent.body.total).toBe(0);
  });

  it('lists stores and menu items with filters', async () => {
    const stores = await request(app).get('/api/stores').set('Cookie', studentCookie);
    expect(stores.body).toHaveLength(8);
    const menu = await request(app).get('/api/menu?store=Central%20Canteen&category=Beverages').set('Cookie', studentCookie);
    expect(menu.body.rows.map((m: { item_name: string }) => m.item_name).sort()).toEqual(['Filter Coffee', 'Masala Chai']);
  });

  it('admin create student: duplicate e-mail is rejected by the database (23505)', async () => {
    const res = await request(app).post('/api/students').set('Cookie', adminCookie)
      .send({ student_id: 'TEST0001', full_name: 'Test', email: `${STUDENT.toLowerCase()}@demo.campusconnect.invalid` });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({ sqlstate: '23505', constraint: 'student_email_key' });
  });

  it('admin price change keeps historical unit prices', async () => {
    const item = (await query(`SELECT order_id, store_name, item_name, unit_price FROM order_item LIMIT 1`)).rows[0];
    const res = await request(app).patch(`/api/menu/${encodeURIComponent(item.store_name)}/${encodeURIComponent(item.item_name)}`)
      .set('Cookie', adminCookie).send({ price: Number(item.unit_price) + 25 });
    expect(res.status).toBe(200);
    const after = (await query('SELECT unit_price FROM order_item WHERE order_id = $1 AND item_name = $2', [item.order_id, item.item_name])).rows[0];
    expect(Number(after.unit_price)).toBe(Number(item.unit_price));
    await request(app).patch(`/api/menu/${encodeURIComponent(item.store_name)}/${encodeURIComponent(item.item_name)}`)
      .set('Cookie', adminCookie).send({ price: Number(item.unit_price) });
  });

  it('negative prices are rejected by the CHECK constraint (23514)', async () => {
    const res = await request(app).patch('/api/menu/Central%20Canteen/Masala%20Dosa').set('Cookie', adminCookie).send({ price: -5 });
    expect(res.status).toBe(422);
    expect(res.body.error.details.constraint).toBe('menu_item_price_check');
  });

  it('a store with orders cannot be deleted (restrictive FK)', async () => {
    const res = await request(app).delete('/api/stores/Central%20Canteen').set('Cookie', adminCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.details.sqlstate).toBe('23503');
  });
});

// ------------------------------------------------------------------ orders (workflow 1)
describe('order placement and cancellation', () => {
  let orderId: number;

  it('places an order in one transaction; triggers set the totals', async () => {
    const before = await spendOf(STUDENT);
    const res = await request(app).post('/api/orders').set('Cookie', studentCookie).send({
      store_name: 'Central Canteen',
      items: [{ item_name: 'Masala Dosa', quantity: 2 }, { item_name: 'Filter Coffee', quantity: 1 }],
    });
    expect(res.status).toBe(201);
    orderId = res.body.order.order_id;
    expect(res.body.order.total_amount).toBe(140);
    expect(res.body.order.items).toHaveLength(2);
    expect(res.body.spend).toEqual({ before, after: before + 140 });
    expect(await spendOf(STUDENT)).toBe(before + 140);
  });

  it('rejects an empty cart, an unavailable item and a zero quantity without leaving rows behind', async () => {
    const count = async () => Number((await query('SELECT COUNT(*) AS n FROM orders')).rows[0].n);
    const n0 = await count();
    const empty = await request(app).post('/api/orders').set('Cookie', studentCookie).send({ store_name: 'Central Canteen', items: [] });
    expect(empty.status).toBe(400);
    const unavailable = await request(app).post('/api/orders').set('Cookie', studentCookie)
      .send({ store_name: 'Night Canteen', items: [{ item_name: 'Chocolate Brownie', quantity: 1 }] });
    expect(unavailable.status).toBe(422);
    expect(unavailable.body.error.code).toBe('TRIGGER_EXCEPTION');
    const zero = await request(app).post('/api/orders').set('Cookie', studentCookie)
      .send({ store_name: 'Central Canteen', items: [{ item_name: 'Masala Dosa', quantity: 0 }] });
    expect(zero.body.error.details.constraint).toBe('order_item_quantity_check');
    const otherStore = await request(app).post('/api/orders').set('Cookie', studentCookie)
      .send({ store_name: 'Central Canteen', items: [{ item_name: 'Cappuccino', quantity: 1 }] });
    expect(otherStore.status).toBe(422);
    expect(await count()).toBe(n0); // every failed attempt was rolled back
  });

  it('refuses orders while the store is closed (sp_place_order opening hours)', async () => {
    // give Campus Café a window that never contains "now" (2-3 hours ahead, campus time)
    const ist = new Date(Date.now() + 5.5 * 3_600_000);
    const hhmm = (h: number) => `${String((ist.getUTCHours() + h) % 24).padStart(2, '0')}:00`;
    const upd = await request(app).put('/api/stores/Campus%20Caf%C3%A9').set('Cookie', adminCookie)
      .send({ store_type: 'Café', location: 'Academic Block A, Atrium', opens_at: hhmm(2), closes_at: hhmm(3) });
    expect(upd.status).toBe(200);
    expect(upd.body.is_open_now).toBe(false);
    const res = await request(app).post('/api/orders').set('Cookie', studentCookie)
      .send({ store_name: 'Campus Café', items: [{ item_name: 'Cappuccino', quantity: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/closed/);
    expect(res.body.error.details.sqlstate).toBe('P0001');
    const stores = await request(app).get('/api/stores').set('Cookie', studentCookie);
    expect(stores.body.find((s: { store_name: string }) => s.store_name === 'Campus Café').is_open_now).toBe(false);
  });

  it('shows the order detail to its owner', async () => {
    const res = await request(app).get(`/api/orders/${orderId}`).set('Cookie', studentCookie);
    expect(res.body.items.find((i: { item_name: string }) => i.item_name === 'Masala Dosa')).toMatchObject({ quantity: 2, unit_price: 60, line_total: 120 });
  });

  it('cancels the order and the trigger reduces the spend', async () => {
    const before = await spendOf(STUDENT);
    const res = await request(app).post(`/api/orders/${orderId}/cancel`).set('Cookie', studentCookie);
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('CANCELLED');
    expect(res.body.order.total_amount).toBe(140); // the order keeps its own total
    expect(await spendOf(STUDENT)).toBe(before - 140);
    const again = await request(app).post(`/api/orders/${orderId}/cancel`).set('Cookie', studentCookie);
    expect(again.status).toBe(409);
  });

  it('rejects impossible status jumps (e.g. COMPLETED -> PLACED)', async () => {
    const done = (await query(`SELECT order_id FROM orders WHERE status = 'COMPLETED' LIMIT 1`)).rows[0];
    const res = await request(app).patch(`/api/orders/${done.order_id}/status`).set('Cookie', adminCookie).send({ status: 'PLACED' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('APP_RULE');
  });

  it('admin can reinstate the order; the spend goes back up', async () => {
    const before = await spendOf(STUDENT);
    const res = await request(app).patch(`/api/orders/${orderId}/status`).set('Cookie', adminCookie).send({ status: 'PLACED' });
    expect(res.body.spend).toMatchObject({ before, after: before + 140 });
  });
});

// ------------------------------------------------------------------ outpasses (workflow 2)
describe('outpass lifecycle', () => {
  let id: number;
  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

  it('the database rejects a return before departure (chk_outpass_window)', async () => {
    const res = await request(app).post('/api/outpasses').set('Cookie', studentCookie)
      .send({ reason: 'Going home', out_at: inHours(30), return_by: inHours(20) });
    expect(res.status).toBe(422);
    expect(res.body.error.details.constraint).toBe('chk_outpass_window');
  });

  it('refuses a request whose departure is already in the past (application rule)', async () => {
    const res = await request(app).post('/api/outpasses').set('Cookie', studentCookie)
      .send({ reason: 'Already left', out_at: inHours(-48), return_by: inHours(-24) });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('APP_RULE');
  });

  it('student submits a request', async () => {
    const res = await request(app).post('/api/outpasses').set('Cookie', studentCookie)
      .send({ reason: 'Family function', out_at: inHours(-0.1), return_by: inHours(20) }); // leaving now (within grace)
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING', reviewed_by: null, reviewed_at: null });
    id = res.body.request_id;
  });

  it('admin approves it in a transaction (reviewer + time set together)', async () => {
    const res = await request(app).post(`/api/outpasses/${id}/review`).set('Cookie', adminCookie).send({ decision: 'APPROVED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.reviewed_by).toBe(1);
    expect(res.body.reviewed_at).toBeTruthy();
    const twice = await request(app).post(`/api/outpasses/${id}/review`).set('Cookie', adminCookie).send({ decision: 'REJECTED' });
    expect(twice.status).toBe(409);
  });

  it('a return before departure is rejected by chk_outpass_returned', async () => {
    const res = await request(app).post(`/api/outpasses/${id}/return`).set('Cookie', studentCookie).send({ returned_at: inHours(-5) });
    expect(res.status).toBe(422);
    expect(res.body.error.details.constraint).toBe('chk_outpass_returned');
  });

  it('student records the return', async () => {
    const res = await request(app).post(`/api/outpasses/${id}/return`).set('Cookie', studentCookie).send({});
    expect(res.status).toBe(200);
    expect(res.body.returned_at).toBeTruthy();
    expect(res.body.returned_late).toBe(false);
  });

  it('admin can reject another request and filter by status / overdue', async () => {
    const created = await request(app).post('/api/outpasses').set('Cookie', studentCookie)
      .send({ reason: 'Weekend trip', out_at: inHours(48), return_by: inHours(60) });
    const rej = await request(app).post(`/api/outpasses/${created.body.request_id}/review`).set('Cookie', adminCookie).send({ decision: 'REJECTED' });
    expect(rej.body.status).toBe('REJECTED');
    const overdue = await request(app).get('/api/outpasses?overdue=true&pageSize=100').set('Cookie', adminCookie);
    expect(overdue.body.rows.length).toBeGreaterThan(0);
    expect(overdue.body.rows.every((r: { is_overdue: boolean }) => r.is_overdue)).toBe(true);
    const view = await request(app).get('/api/outpasses/overdue').set('Cookie', adminCookie);
    expect(view.body.length).toBe(overdue.body.total);
  });
});

// ------------------------------------------------------------------ documents
describe('documents', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  let docId: number;

  it('uploads a file: metadata in PostgreSQL, bytes on disk', async () => {
    const res = await request(app).post('/api/documents').set('Cookie', studentCookie)
      .field('doc_type', 'Fee Receipt').attach('file', pdf, { filename: 'fee receipt.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ student_id: STUDENT, doc_type: 'Fee Receipt', verify_status: 'PENDING', file_name: 'fee_receipt.pdf' });
    expect(fs.existsSync(path.join(UPLOAD_ROOT, res.body.file_path))).toBe(true);
    docId = res.body.document_id;
  });

  it('rejects disguised and disallowed files', async () => {
    const fake = await request(app).post('/api/documents').set('Cookie', studentCookie)
      .field('doc_type', 'Other').attach('file', Buffer.from('MZ not a pdf'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(fake.status).toBe(400);
    const exe = await request(app).post('/api/documents').set('Cookie', studentCookie)
      .field('doc_type', 'Other').attach('file', Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/octet-stream' });
    expect(exe.status).toBe(400);
  });

  it('owner and admin can download; other students cannot', async () => {
    expect((await request(app).get(`/api/documents/${docId}/file`).set('Cookie', studentCookie)).status).toBe(200);
    expect((await request(app).get(`/api/documents/${docId}/file`).set('Cookie', adminCookie)).status).toBe(200);
    expect((await request(app).get(`/api/documents/${docId}/file`).set('Cookie', otherCookie)).status).toBe(404);
  });

  it('admin verifies the document; a verified document cannot be withdrawn', async () => {
    const res = await request(app).patch(`/api/documents/${docId}/status`).set('Cookie', adminCookie).send({ status: 'VERIFIED' });
    expect(res.body.verify_status).toBe('VERIFIED');
    expect((await request(app).delete(`/api/documents/${docId}`).set('Cookie', studentCookie)).status).toBe(409);
  });
});

// ------------------------------------------------------------------ rooms (workflow 3)
describe('room allocation and transfer', () => {
  const occ = async (h: string, r: string) =>
    Number((await query('SELECT occupancy FROM room WHERE hostel_name = $1 AND room_no = $2', [h, r])).rows[0].occupancy);

  it('transfers atomically and both occupancies follow (trg_alloc_occupancy)', async () => {
    const cur = (await query(`SELECT hostel_name, room_no FROM room_allocation WHERE student_id = $1 AND status = 'ACTIVE'`, [STUDENT])).rows[0];
    const target = (await query(`SELECT room_no FROM room WHERE hostel_name = 'Ram' AND occupancy = 0 LIMIT 1`)).rows[0];
    const fromBefore = await occ(cur.hostel_name, cur.room_no);
    const res = await request(app).post('/api/allocations/transfer').set('Cookie', adminCookie)
      .send({ student_id: STUDENT, hostel_name: 'Ram', room_no: target.room_no });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.ended.status).toBe('ENDED');
    expect(res.body.created.status).toBe('ACTIVE');
    expect(res.body.after.from.occupancy).toBe(fromBefore - 1);
    expect(res.body.after.to.occupancy).toBe(1);
    expect(await occ('Ram', target.room_no)).toBe(1);
    const active = await query(`SELECT COUNT(*)::int AS n FROM room_allocation WHERE student_id = $1 AND status = 'ACTIVE'`, [STUDENT]);
    expect(active.rows[0].n).toBe(1);
  });

  it('refuses a cross-gender transfer (application rule) and changes nothing', async () => {
    const before = (await query(`SELECT hostel_name, room_no FROM room_allocation WHERE student_id = $1 AND status = 'ACTIVE'`, [STUDENT])).rows[0];
    const res = await request(app).post('/api/allocations/transfer').set('Cookie', adminCookie)
      .send({ student_id: STUDENT, hostel_name: 'Meera', room_no: 'A-001' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('APP_RULE');
    const after = (await query(`SELECT hostel_name, room_no FROM room_allocation WHERE student_id = $1 AND status = 'ACTIVE'`, [STUDENT])).rows[0];
    expect(after).toEqual(before);
  });

  it('a failed transfer rolls back the ENDED update too', async () => {
    const before = (await query(`SELECT hostel_name, room_no FROM room_allocation WHERE student_id = $1 AND status = 'ACTIVE'`, [STUDENT])).rows[0];
    const res = await request(app).post('/api/allocations/transfer').set('Cookie', adminCookie)
      .send({ student_id: STUDENT, hostel_name: 'Krishna', room_no: 'NO-SUCH' });
    expect(res.status).toBe(409); // FK violation on the INSERT
    const after = (await query(`SELECT hostel_name, room_no FROM room_allocation WHERE student_id = $1 AND status = 'ACTIVE'`, [STUDENT])).rows[0];
    expect(after).toEqual(before);
  });

  it('allocating a student who already has a room hits uq_one_active_allocation', async () => {
    const res = await request(app).post('/api/allocations').set('Cookie', adminCookie)
      .send({ student_id: STUDENT, hostel_name: 'Krishna', room_no: 'A-001' });
    expect(res.status).toBe(409);
    expect(res.body.error.details.constraint).toBe('uq_one_active_allocation');
  });

  it('vacates and re-allocates', async () => {
    const v = await request(app).post('/api/allocations/vacate').set('Cookie', adminCookie).send({ student_id: STUDENT });
    expect(v.status).toBe(200);
    const room = v.body.ended;
    const a = await request(app).post('/api/allocations').set('Cookie', adminCookie)
      .send({ student_id: STUDENT, hostel_name: 'Valmiki', room_no: 'B-101', date: '2026-12-01' });
    expect(a.status).toBe(201);
    expect(room.status).toBe('ENDED');
  });
});

// ------------------------------------------------------------------ calendar
describe('calendar', () => {
  it('admin creates, edits (composite key) and deletes an entry', async () => {
    const body = { title: 'API Test Event', event_type: 'EVENT', description: 'x', start_datetime: '2027-01-10T10:00:00+05:30', end_datetime: null };
    expect((await request(app).post('/api/calendar').set('Cookie', adminCookie).send(body)).status).toBe(201);
    const dup = await request(app).post('/api/calendar').set('Cookie', adminCookie).send(body);
    expect(dup.body.error.details.constraint).toBe('calendar_pkey');
    const key = { title: body.title, start: '2027-01-10T04:30:00.000Z' };
    const upd = await request(app).put('/api/calendar/entry').query(key).set('Cookie', adminCookie).send({ ...body, title: 'API Test Event 2' });
    expect(upd.status).toBe(200);
    const bad = await request(app).put('/api/calendar/entry').query({ ...key, title: 'API Test Event 2' }).set('Cookie', adminCookie)
      .send({ ...body, title: 'API Test Event 2', end_datetime: '2027-01-01T00:00:00Z' });
    expect(bad.body.error.details.constraint).toBe('chk_calendar_dates');
    expect((await request(app).delete('/api/calendar/entry').query({ ...key, title: 'API Test Event 2' }).set('Cookie', adminCookie)).status).toBe(204);
  });

  it('filters by type and date range', async () => {
    const res = await request(app).get('/api/calendar?type=EXAM&from=2026-12-01T00:00:00Z&to=2026-12-31T00:00:00Z').set('Cookie', studentCookie);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((e: { event_type: string }) => e.event_type === 'EXAM')).toBe(true);
  });
});

// ------------------------------------------------------------------ reports, dashboard, integrity lab
describe('reports, dashboard and Integrity Lab', () => {
  it('lists at least 5 reports and runs every one of them', async () => {
    const list = await request(app).get('/api/reports').set('Cookie', adminCookie);
    expect(list.body.length).toBeGreaterThanOrEqual(5);
    for (const r of list.body) {
      const res = await request(app).get(`/api/reports/${r.key}`).set('Cookie', adminCookie);
      expect(res.status, r.key).toBe(200);
      expect(res.body.rows.length, r.key).toBeGreaterThan(0);
      expect(res.body.sql).toContain('SELECT');
    }
  });

  it('applies report parameters (HAVING min spend, date range)', async () => {
    const res = await request(app).get('/api/reports/student_spending?min_spend=10000').set('Cookie', adminCookie);
    expect(res.body.rows.every((r: { total_spend: number }) => r.total_spend >= 10000)).toBe(true);
    const bad = await request(app).get('/api/reports/store_sales?from=yesterday').set('Cookie', adminCookie);
    expect(bad.status).toBe(400);
  });

  it('dashboard figures come from the database', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Cookie', adminCookie);
    const n = Number((await query('SELECT COUNT(*) AS n FROM student')).rows[0].n);
    expect(res.body.totals.students).toBe(n);
    expect(res.body.hostels).toHaveLength(6);
  });

  it('Integrity Lab: every scenario passes and nothing persists', async () => {
    const counts = async () => (await query(`SELECT (SELECT COUNT(*) FROM orders) o, (SELECT COUNT(*) FROM room_allocation) a,
      (SELECT COUNT(*) FROM outpass_request) p, (SELECT COUNT(*) FROM student) s, (SELECT SUM(price) FROM menu_item) m`)).rows[0];
    const before = await counts();
    const res = await request(app).post('/api/integrity/tests/run-all').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const failed = res.body.results.filter((r: { passed: boolean }) => !r.passed).map((r: { key: string; actual: unknown }) => ({ key: r.key, actual: r.actual }));
    expect(failed).toEqual([]);
    expect(res.body.total).toBeGreaterThanOrEqual(8);
    expect(await counts()).toEqual(before);
  });

  it('all audit queries return zero rows after the whole suite', async () => {
    const res = await request(app).get('/api/integrity/audits').set('Cookie', adminCookie);
    expect(res.body.allPassed).toBe(true);
  });
});
