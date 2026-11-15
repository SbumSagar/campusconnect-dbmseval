import type pg from 'pg';
import { query, withTransaction } from '../db/pool.js';
import { badRequest, conflict, notFound, ruleViolation } from '../utils/errors.js';
import { page } from '../utils/validate.js';

// ---------------------------------------------------------------- hostels
export async function listHostels() {
  const { rows } = await query(`SELECT * FROM v_hostel_occupancy ORDER BY gender DESC, hostel_name`);
  return rows;
}

export async function getHostel(name: string) {
  const { rows } = await query(`SELECT * FROM v_hostel_occupancy WHERE hostel_name = $1`, [name]);
  if (!rows.length) throw notFound('Hostel');
  const floors = await query(
    `SELECT floor_no, COUNT(*)::int AS rooms, SUM(occupancy)::int AS residents,
            COUNT(*) FILTER (WHERE occupancy = 0)::int AS empty_rooms
       FROM room WHERE hostel_name = $1 GROUP BY floor_no ORDER BY floor_no`, [name]);
  return { ...rows[0], floors: floors.rows };
}

export async function updateHostel(name: string, h: { hostel_type?: string; warden_name?: string | null }) {
  const { rows } = await query(
    `UPDATE hostel SET hostel_type = COALESCE($2, hostel_type),
                       warden_name = CASE WHEN $3::boolean THEN $4 ELSE warden_name END
      WHERE hostel_name = $1 RETURNING *`,
    [name, h.hostel_type ?? null, h.warden_name !== undefined, h.warden_name ?? null]);
  if (!rows.length) throw notFound('Hostel');
  return rows[0];
}

// ---------------------------------------------------------------- rooms
export interface RoomFilters {
  hostel: string; floor?: number; q?: string; occupancy?: 'empty' | 'occupied'; page: number; pageSize: number;
}

export async function listRooms(f: RoomFilters) {
  const { rows } = await query(
    `SELECT r.hostel_name, r.room_no, r.floor_no, r.occupancy,
            COALESCE(json_agg(json_build_object('student_id', s.student_id, 'full_name', s.full_name,
                                                'start_date', a.start_date)
                              ORDER BY s.full_name) FILTER (WHERE s.student_id IS NOT NULL), '[]') AS residents,
            COUNT(*) OVER () AS total_count
       FROM room r
       LEFT JOIN room_allocation a ON a.hostel_name = r.hostel_name AND a.room_no = r.room_no AND a.status = 'ACTIVE'
       LEFT JOIN student s ON s.student_id = a.student_id
      WHERE r.hostel_name = $1
        AND ($2::int IS NULL OR r.floor_no = $2)
        AND ($3::text IS NULL OR r.room_no ILIKE '%' || $3 || '%'
             OR EXISTS (SELECT 1 FROM room_allocation a2 JOIN student s2 ON s2.student_id = a2.student_id
                         WHERE a2.hostel_name = r.hostel_name AND a2.room_no = r.room_no AND a2.status = 'ACTIVE'
                           AND (s2.full_name ILIKE '%' || $3 || '%' OR s2.student_id ILIKE '%' || $3 || '%')))
        AND ($4::text IS NULL OR ($4 = 'empty') = (r.occupancy = 0))
      GROUP BY r.hostel_name, r.room_no, r.floor_no, r.occupancy
      ORDER BY r.floor_no, r.room_no
      LIMIT $5 OFFSET $6`,
    [f.hostel, f.floor ?? null, f.q || null, f.occupancy || null, f.pageSize, (f.page - 1) * f.pageSize]);
  return page(rows, f);
}

export async function getRoom(hostel: string, roomNo: string) {
  const { rows } = await query('SELECT * FROM room WHERE hostel_name = $1 AND room_no = $2', [hostel, roomNo]);
  if (!rows.length) throw notFound('Room');
  const allocations = await query(
    `SELECT a.*, s.full_name, s.gender FROM room_allocation a JOIN student s USING (student_id)
      WHERE a.hostel_name = $1 AND a.room_no = $2 ORDER BY a.status, a.start_date DESC`, [hostel, roomNo]);
  return { ...rows[0], allocations: allocations.rows };
}

export async function createRoom(r: { hostel_name: string; room_no: string; floor_no: number }) {
  // occupancy is NOT supplied: it defaults to 0 and is maintained by trg_alloc_occupancy
  const { rows } = await query(
    'INSERT INTO room (hostel_name, room_no, floor_no) VALUES ($1,$2,$3) RETURNING *',
    [r.hostel_name, r.room_no, r.floor_no]);
  return rows[0];
}

export async function updateRoom(hostel: string, roomNo: string, r: { room_no?: string; floor_no?: number }) {
  // Renaming a room that has allocation history is refused by the restrictive FK.
  const { rows } = await query(
    `UPDATE room SET room_no = COALESCE($3, room_no), floor_no = COALESCE($4, floor_no)
      WHERE hostel_name = $1 AND room_no = $2 RETURNING *`,
    [hostel, roomNo, r.room_no ?? null, r.floor_no ?? null]);
  if (!rows.length) throw notFound('Room');
  return rows[0];
}

export async function deleteRoom(hostel: string, roomNo: string) {
  const { rowCount } = await query('DELETE FROM room WHERE hostel_name = $1 AND room_no = $2', [hostel, roomNo]);
  if (!rowCount) throw notFound('Room');
}

/** Rooms a student can be placed in (same-gender hostels), least occupied first. */
export async function availableRooms(studentId: string, hostel?: string, q?: string) {
  const { rows } = await query(
    `SELECT r.hostel_name, r.room_no, r.floor_no, r.occupancy, h.gender
       FROM room r
       JOIN hostel h  ON h.hostel_name = r.hostel_name
       JOIN student s ON s.student_id = $1
      WHERE (h.gender = 'COED' OR s.gender IS NULL OR h.gender = s.gender)
        AND ($2::text IS NULL OR r.hostel_name = $2)
        AND ($3::text IS NULL OR r.room_no ILIKE '%' || $3 || '%')
      ORDER BY r.occupancy, r.hostel_name, r.room_no
      LIMIT 60`, [studentId, hostel || null, q || null]);
  return rows;
}

// ---------------------------------------------------------------- allocations

/**
 * Application-level business rule (the schema deliberately does not force
 * HOSTEL.gender = STUDENT.gender - see assumption 3 of the design document).
 */
export async function assertGenderRule(db: pg.PoolClient, studentId: string, hostel: string) {
  const { rows } = await db.query<{ sg: string | null; hg: string; name: string }>(
    `SELECT s.gender AS sg, h.gender AS hg, s.full_name AS name
       FROM student s, hostel h WHERE s.student_id = $1 AND h.hostel_name = $2`, [studentId, hostel]);
  if (!rows.length) throw notFound('Student or hostel');
  const { sg, hg, name } = rows[0];
  if (hg !== 'COED' && sg && sg !== hg) {
    throw ruleViolation(`${name} (${sg}) cannot be allocated to ${hostel}, a ${hg} hostel.`);
  }
}

const roomSnapshot = (db: pg.PoolClient, hostel: string, room: string) =>
  db.query('SELECT hostel_name, room_no, occupancy FROM room WHERE hostel_name = $1 AND room_no = $2', [hostel, room])
    .then((r) => r.rows[0] ?? null);

export async function allocate(studentId: string, hostel: string, roomNo: string, startDate?: string) {
  return withTransaction(async (db) => {
    await assertGenderRule(db, studentId, hostel);
    // uq_one_active_allocation (partial unique index) rejects a 2nd ACTIVE room
    const { rows } = await db.query(
      `INSERT INTO room_allocation (student_id, hostel_name, room_no, start_date, status)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), 'ACTIVE') RETURNING *`,
      [studentId, hostel, roomNo, startDate ?? null]);
    return { allocation: rows[0], room: await roomSnapshot(db, hostel, roomNo) };
  });
}

/**
 * Atomic transfer: end the ACTIVE stay and insert the new one in ONE
 * transaction.  If either statement fails both are rolled back.
 * trg_alloc_occupancy updates BOTH rooms' occupancy.
 */
export async function transfer(studentId: string, hostel: string, roomNo: string, date?: string) {
  return withTransaction(async (db) => {
    const cur = await db.query(
      `SELECT * FROM room_allocation WHERE student_id = $1 AND status = 'ACTIVE' FOR UPDATE`, [studentId]);
    if (!cur.rows.length) throw conflict('This student has no ACTIVE allocation to transfer from. Use "Allocate" instead.');
    const old = cur.rows[0];
    if (old.hostel_name === hostel && old.room_no === roomNo) throw badRequest('The student is already in that room.');
    await assertGenderRule(db, studentId, hostel);

    const before = { from: await roomSnapshot(db, old.hostel_name, old.room_no), to: await roomSnapshot(db, hostel, roomNo) };
    const ended = await db.query(
      `UPDATE room_allocation SET status = 'ENDED', end_date = COALESCE($2::date, CURRENT_DATE)
        WHERE student_id = $1 AND hostel_name = $3 AND room_no = $4 AND start_date = $5 RETURNING *`,
      [studentId, date ?? null, old.hostel_name, old.room_no, old.start_date]);
    const created = await db.query(
      `INSERT INTO room_allocation (student_id, hostel_name, room_no, start_date, status)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), 'ACTIVE') RETURNING *`,
      [studentId, hostel, roomNo, date ?? null]);
    const after = { from: await roomSnapshot(db, old.hostel_name, old.room_no), to: await roomSnapshot(db, hostel, roomNo) };
    return { ended: ended.rows[0], created: created.rows[0], before, after };
  });
}

export async function vacate(studentId: string, date?: string) {
  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `UPDATE room_allocation SET status = 'ENDED', end_date = COALESCE($2::date, CURRENT_DATE)
        WHERE student_id = $1 AND status = 'ACTIVE' RETURNING *`, [studentId, date ?? null]);
    if (!rows.length) throw conflict('This student has no ACTIVE allocation.');
    return { ended: rows[0], room: await roomSnapshot(db, rows[0].hostel_name, rows[0].room_no) };
  });
}

export async function allocationHistory(studentId: string) {
  const { rows } = await query(
    `SELECT a.*, r.floor_no, h.hostel_type, h.warden_name,
            COALESCE(a.end_date, CURRENT_DATE) - a.start_date AS days
       FROM room_allocation a
       JOIN room r   ON r.hostel_name = a.hostel_name AND r.room_no = a.room_no
       JOIN hostel h ON h.hostel_name = a.hostel_name
      WHERE a.student_id = $1
      ORDER BY a.start_date DESC`, [studentId]);
  return rows;
}

/** Room-mates of the student's active room. */
export async function roommates(studentId: string) {
  const { rows } = await query(
    `SELECT s.student_id, s.full_name FROM room_allocation me
       JOIN room_allocation a ON a.hostel_name = me.hostel_name AND a.room_no = me.room_no
                             AND a.status = 'ACTIVE' AND a.student_id <> me.student_id
       JOIN student s ON s.student_id = a.student_id
      WHERE me.student_id = $1 AND me.status = 'ACTIVE'`, [studentId]);
  return rows;
}

export async function recentAllocationEvents(limit = 25) {
  const { rows } = await query(
    `SELECT a.student_id, s.full_name, s.gender, a.hostel_name, a.room_no, a.start_date, a.end_date, a.status,
            GREATEST(a.start_date, COALESCE(a.end_date, a.start_date)) AS event_date
       FROM room_allocation a JOIN student s USING (student_id)
      ORDER BY event_date DESC, a.status, a.student_id
      LIMIT $1`, [limit]);
  return rows;
}
