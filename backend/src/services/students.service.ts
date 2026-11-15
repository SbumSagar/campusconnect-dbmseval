import { query } from '../db/pool.js';
import { notFound } from '../utils/errors.js';
import { orderBy, page } from '../utils/validate.js';

export interface StudentFilters {
  q?: string; gender?: string; hostel?: string; allocated?: 'yes' | 'no'; sort?: string; page: number; pageSize: number;
}

const SORTS = {
  default: 's.student_id ASC',
  student_id: 's.student_id',
  full_name: 's.full_name',
  gender: 's.gender',
  hostel: 'a.hostel_name',
  spend: 's.total_deductions_amount',
};

export async function listStudents(f: StudentFilters) {
  const { rows } = await query(
    `SELECT s.student_id, s.full_name, s.email, s.phone, s.gender, s.program, s.total_deductions_amount,
            a.hostel_name, a.room_no, a.start_date AS allocated_since,
            COUNT(*) OVER () AS total_count
       FROM student s
       LEFT JOIN room_allocation a ON a.student_id = s.student_id AND a.status = 'ACTIVE'
      WHERE ($1::text IS NULL OR s.student_id ILIKE '%' || $1 || '%' OR s.full_name ILIKE '%' || $1 || '%'
             OR s.email ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR s.gender = $2)
        AND ($3::text IS NULL OR a.hostel_name = $3)
        AND ($4::text IS NULL OR ($4 = 'yes') = (a.student_id IS NOT NULL))
      ORDER BY ${orderBy(f.sort, SORTS, 'default')}, s.student_id
      LIMIT $5 OFFSET $6`,
    [f.q || null, f.gender || null, f.hostel || null, f.allocated || null, f.pageSize, (f.page - 1) * f.pageSize]);
  return page(rows, f);
}

export async function getStudent(studentId: string) {
  const { rows } = await query(
    `SELECT s.*, a.hostel_name, a.room_no, a.start_date AS allocated_since, r.floor_no,
            h.hostel_type, h.warden_name
       FROM student s
       LEFT JOIN room_allocation a ON a.student_id = s.student_id AND a.status = 'ACTIVE'
       LEFT JOIN room r   ON r.hostel_name = a.hostel_name AND r.room_no = a.room_no
       LEFT JOIN hostel h ON h.hostel_name = a.hostel_name
      WHERE s.student_id = $1`, [studentId]);
  if (!rows.length) throw notFound('Student');
  return rows[0];
}

/** Full record for the admin student page: profile + every related relation. */
export async function studentDetail(studentId: string) {
  const profile = await getStudent(studentId);
  const [allocations, orders, outpasses, documents] = await Promise.all([
    query(`SELECT a.*, r.floor_no FROM room_allocation a
             JOIN room r ON r.hostel_name = a.hostel_name AND r.room_no = a.room_no
            WHERE a.student_id = $1 ORDER BY a.start_date DESC`, [studentId]),
    query(`SELECT order_id, store_name, ordered_at, status, total_amount FROM orders
            WHERE student_id = $1 ORDER BY ordered_at DESC LIMIT 25`, [studentId]),
    query(`SELECT o.*, a.full_name AS reviewer_name FROM outpass_request o
             LEFT JOIN admin a ON a.admin_id = o.reviewed_by
            WHERE o.student_id = $1 ORDER BY o.out_at DESC`, [studentId]),
    query(`SELECT * FROM document WHERE student_id = $1 ORDER BY uploaded_at DESC`, [studentId]),
  ]);
  return { profile, allocations: allocations.rows, orders: orders.rows, outpasses: outpasses.rows, documents: documents.rows };
}

/** Student dashboard: everything on one screen, all values from PostgreSQL. */
export async function studentDashboard(studentId: string) {
  const profile = await getStudent(studentId);
  const [stats, upcoming, recentOrders, activeOutpass] = await Promise.all([
    query(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE student_id = $1)                                   AS orders_total,
         (SELECT COUNT(*) FROM orders WHERE student_id = $1 AND status <> 'CANCELLED')         AS orders_active,
         (SELECT COUNT(*) FROM orders WHERE student_id = $1 AND status IN ('PLACED','PREPARING','READY')) AS orders_open,
         (SELECT COUNT(*) FROM outpass_request WHERE student_id = $1 AND status = 'PENDING')   AS outpass_pending,
         (SELECT COUNT(*) FROM outpass_request WHERE student_id = $1 AND status = 'APPROVED' AND returned_at IS NULL) AS outpass_open,
         (SELECT COUNT(*) FROM document WHERE student_id = $1 AND verify_status = 'PENDING')   AS docs_pending,
         (SELECT COUNT(*) FROM document WHERE student_id = $1 AND verify_status = 'VERIFIED')  AS docs_verified,
         (SELECT COUNT(*) FROM document WHERE student_id = $1 AND verify_status = 'REJECTED')  AS docs_rejected,
         (SELECT COALESCE(SUM(total_amount), 0) FROM orders
           WHERE student_id = $1 AND status <> 'CANCELLED'
             AND ordered_at >= date_trunc('month', now()))                                     AS spend_this_month`,
      [studentId]),
    query(`SELECT title, event_type, description, start_datetime, end_datetime FROM calendar
            WHERE COALESCE(end_datetime, start_datetime) >= now()
            ORDER BY start_datetime LIMIT 6`),
    query(`SELECT order_id, store_name, ordered_at, status, total_amount FROM orders
            WHERE student_id = $1 ORDER BY ordered_at DESC LIMIT 5`, [studentId]),
    query(`SELECT o.*, (o.status = 'APPROVED' AND o.return_by < now()) AS is_overdue
             FROM outpass_request o
            WHERE o.student_id = $1 AND o.status IN ('PENDING','APPROVED') AND o.returned_at IS NULL
            ORDER BY o.out_at LIMIT 3`, [studentId]),
  ]);
  return { profile, stats: stats.rows[0], upcoming: upcoming.rows, recentOrders: recentOrders.rows, activeOutpasses: activeOutpass.rows };
}

export interface StudentInput {
  student_id: string; full_name: string; email: string; phone: string | null; gender: string | null; program: string | null;
}

export async function createStudent(s: StudentInput) {
  const { rows } = await query(
    `INSERT INTO student (student_id, full_name, email, phone, gender, program)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [s.student_id, s.full_name, s.email, s.phone, s.gender, s.program]);
  return rows[0];
}

export async function updateStudent(studentId: string, s: Partial<Omit<StudentInput, 'student_id'>>) {
  const { rows } = await query(
    `UPDATE student SET
        full_name = COALESCE($2, full_name),
        email     = COALESCE($3, email),
        phone     = CASE WHEN $4::boolean THEN $5 ELSE phone END,
        gender    = CASE WHEN $6::boolean THEN $7 ELSE gender END,
        program   = CASE WHEN $8::boolean THEN $9 ELSE program END
      WHERE student_id = $1 RETURNING *`,
    [studentId, s.full_name ?? null, s.email ?? null,
      s.phone !== undefined, s.phone ?? null, s.gender !== undefined, s.gender ?? null,
      s.program !== undefined, s.program ?? null]);
  if (!rows.length) throw notFound('Student');
  return rows[0];
}

export async function deleteStudent(studentId: string) {
  // Restrictive FKs (orders, outpasses, allocations) make PostgreSQL refuse
  // the delete when history exists; documents cascade by design.
  const { rowCount } = await query('DELETE FROM student WHERE student_id = $1', [studentId]);
  if (!rowCount) throw notFound('Student');
}
