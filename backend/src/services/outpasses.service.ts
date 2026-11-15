import { query, withTransaction } from '../db/pool.js';
import type { SessionUser } from '../middleware/auth.js';
import { conflict, notFound, ruleViolation } from '../utils/errors.js';
import { page } from '../utils/validate.js';

const SELECT = `
  SELECT o.*, s.full_name AS student_name, a.full_name AS reviewer_name, a.role AS reviewer_role,
         (o.status = 'APPROVED' AND o.returned_at IS NULL AND o.return_by < now()) AS is_overdue,
         (o.returned_at IS NOT NULL AND o.returned_at > o.return_by)               AS returned_late
    FROM outpass_request o
    JOIN student s     ON s.student_id = o.student_id
    LEFT JOIN admin a  ON a.admin_id   = o.reviewed_by`;

export async function getOutpass(id: number, user?: SessionUser) {
  const { rows } = await query(`${SELECT} WHERE o.request_id = $1`, [id]);
  if (!rows.length || (user?.role === 'student' && rows[0].student_id !== user.sub)) throw notFound('Outpass request');
  return rows[0];
}

/**
 * Validity (return_by > out_at) is enforced by CHECK chk_outpass_window;
 * the error is passed back to the user with the constraint name.
 */
export async function createOutpass(studentId: string, o: { reason: string; out_at: string; return_by: string }) {
  // Application rule (not in the schema): an outpass is requested before leaving.
  // 15 minutes of grace for "leaving now". return_by > out_at stays with CHECK chk_outpass_window.
  const past = await query<{ past: boolean }>(`SELECT $1::timestamptz < now() - interval '15 minutes' AS past`, [o.out_at]);
  if (past.rows[0].past) throw ruleViolation('The departure time is in the past - an outpass must be requested before leaving campus.');
  const { rows } = await query(
    `INSERT INTO outpass_request (student_id, reason, out_at, return_by)
     VALUES ($1, $2, $3, $4) RETURNING request_id`, [studentId, o.reason, o.out_at, o.return_by]);
  return getOutpass(rows[0].request_id);
}

export interface OutpassFilters {
  student?: string; q?: string; status?: string; from?: string; to?: string; overdue?: boolean; page: number; pageSize: number;
}

export async function listOutpasses(f: OutpassFilters) {
  const { rows } = await query(
    `SELECT x.*, COUNT(*) OVER () AS total_count FROM (${SELECT}) x
      WHERE ($1::text IS NULL OR x.student_id = $1)
        AND ($2::text IS NULL OR x.student_id ILIKE '%' || $2 || '%' OR x.student_name ILIKE '%' || $2 || '%'
             OR x.reason ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR x.status = $3)
        AND ($4::date IS NULL OR x.out_at >= $4::date)
        AND ($5::date IS NULL OR x.out_at < $5::date + 1)
        AND (NOT $6::boolean OR x.is_overdue)
      ORDER BY CASE x.status WHEN 'PENDING' THEN 0 ELSE 1 END, x.out_at DESC
      LIMIT $7 OFFSET $8`,
    [f.student || null, f.q || null, f.status || null, f.from || null, f.to || null, !!f.overdue,
      f.pageSize, (f.page - 1) * f.pageSize]);
  return page(rows, f);
}

export async function statusCounts(studentId?: string) {
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int   AS pending,
            COUNT(*) FILTER (WHERE status = 'APPROVED')::int  AS approved,
            COUNT(*) FILTER (WHERE status = 'REJECTED')::int  AS rejected,
            COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
            COUNT(*) FILTER (WHERE status = 'APPROVED' AND returned_at IS NULL AND return_by < now())::int AS overdue,
            COUNT(*) FILTER (WHERE status = 'APPROVED' AND returned_at IS NULL AND out_at <= now() AND return_by >= now())::int AS out_now,
            COUNT(*)::int AS total
       FROM outpass_request WHERE ($1::text IS NULL OR student_id = $1)`, [studentId || null]);
  return rows[0];
}

/**
 * Workflow 2 - admin review, in one transaction.  The row is locked
 * (FOR UPDATE) so two wardens cannot review the same request at once.
 * reviewed_by and reviewed_at are written together (chk_outpass_reviewed).
 */
export async function reviewOutpass(id: number, adminId: number, decision: 'APPROVED' | 'REJECTED') {
  await withTransaction(async (db) => {
    const cur = await db.query('SELECT status FROM outpass_request WHERE request_id = $1 FOR UPDATE', [id]);
    if (!cur.rows.length) throw notFound('Outpass request');
    if (cur.rows[0].status !== 'PENDING') throw conflict(`This request is already ${cur.rows[0].status}.`);
    if (decision === 'APPROVED') {
      const exp = await db.query('SELECT return_by < now() AS expired FROM outpass_request WHERE request_id = $1', [id]);
      if (exp.rows[0].expired) throw ruleViolation('This request has already expired (its return time is in the past) - it can only be rejected.');
    }
    await db.query(
      `UPDATE outpass_request SET status = $2, reviewed_by = $3, reviewed_at = now() WHERE request_id = $1`,
      [id, decision, adminId]);
  });
  return getOutpass(id);
}

/** Record the return.  chk_outpass_returned rejects a return before departure. */
export async function recordReturn(id: number, user: SessionUser, returnedAt?: string) {
  const cur = await getOutpass(id, user);
  if (cur.status !== 'APPROVED') throw conflict('Only an APPROVED outpass can be closed with a return.');
  if (cur.returned_at) throw conflict('The return has already been recorded.');
  await query(`UPDATE outpass_request SET returned_at = COALESCE($2::timestamptz, now()) WHERE request_id = $1`,
    [id, returnedAt ?? null]);
  return getOutpass(id);
}

export async function cancelOutpass(id: number, studentId: string) {
  const cur = await getOutpass(id, { sub: studentId, role: 'student', name: '', email: '' });
  const notYetLeft = new Date(cur.out_at).getTime() > Date.now();
  if (!(cur.status === 'PENDING' || (cur.status === 'APPROVED' && notYetLeft && !cur.returned_at))) {
    throw conflict(`An outpass that is ${cur.status}${cur.status === 'APPROVED' ? ' and already in use' : ''} cannot be cancelled.`);
  }
  await query(`UPDATE outpass_request SET status = 'CANCELLED' WHERE request_id = $1`, [id]);
  return getOutpass(id);
}

export async function overdue() {
  const { rows } = await query('SELECT * FROM v_overdue_outpass ORDER BY return_by');
  return rows;
}
