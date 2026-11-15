import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_ROOT } from '../config/env.js';
import { query } from '../db/pool.js';
import type { SessionUser } from '../middleware/auth.js';
import { conflict, notFound } from '../utils/errors.js';
import { page } from '../utils/validate.js';

export const DOC_TYPES = ['ID Proof', 'Fee Receipt', 'Medical Certificate', 'Hostel Undertaking', 'Bonafide Request', 'Other'];

/** "DEMO1/1731_ab12__fee_receipt.pdf" → "fee_receipt.pdf" */
const displayName = (p: string) => path.posix.basename(p).replace(/^[^_]+(?:_[^_]+)?__/, '');

const decorate = <T extends { file_path: string }>(r: T) => ({ ...r, file_name: displayName(r.file_path) });

/**
 * Only metadata and the relative path go into DOCUMENT (design: files live
 * outside the database).  If the INSERT fails the stored file is removed.
 */
export async function createDocument(studentId: string, docType: string, relPath: string) {
  try {
    const { rows } = await query(
      `INSERT INTO document (student_id, doc_type, file_path) VALUES ($1, $2, $3) RETURNING *`,
      [studentId, docType, relPath]);
    return decorate(rows[0]);
  } catch (err) {
    fs.rm(resolveFile(relPath), { force: true }, () => undefined);
    throw err;
  }
}

export interface DocFilters {
  student?: string; q?: string; status?: string; type?: string; page: number; pageSize: number;
}

export async function listDocuments(f: DocFilters) {
  const { rows } = await query(
    `SELECT d.*, s.full_name AS student_name, COUNT(*) OVER () AS total_count
       FROM document d JOIN student s ON s.student_id = d.student_id
      WHERE ($1::text IS NULL OR d.student_id = $1)
        AND ($2::text IS NULL OR d.student_id ILIKE '%' || $2 || '%' OR s.full_name ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR d.verify_status = $3)
        AND ($4::text IS NULL OR d.doc_type = $4)
      ORDER BY CASE d.verify_status WHEN 'PENDING' THEN 0 ELSE 1 END, d.uploaded_at DESC
      LIMIT $5 OFFSET $6`,
    [f.student || null, f.q || null, f.status || null, f.type || null, f.pageSize, (f.page - 1) * f.pageSize]);
  const p = page(rows, f);
  return { ...p, rows: p.rows.map(decorate) };
}

export async function getDocument(id: number, user: SessionUser) {
  const { rows } = await query(
    `SELECT d.*, s.full_name AS student_name FROM document d JOIN student s USING (student_id)
      WHERE d.document_id = $1`, [id]);
  // A student asking for someone else's document gets 404 (no information leak).
  if (!rows.length || (user.role === 'student' && rows[0].student_id !== user.sub)) throw notFound('Document');
  return decorate(rows[0]);
}

export async function setVerifyStatus(id: number, status: 'PENDING' | 'VERIFIED' | 'REJECTED') {
  const { rows } = await query(
    `UPDATE document SET verify_status = $2 WHERE document_id = $1 RETURNING *`, [id, status]);
  if (!rows.length) throw notFound('Document');
  return decorate(rows[0]);
}

export async function deleteOwnDocument(id: number, user: SessionUser) {
  const doc = await getDocument(id, user);
  if (doc.verify_status !== 'PENDING') throw conflict('Only documents that are still PENDING can be withdrawn.');
  await query('DELETE FROM document WHERE document_id = $1', [id]);
  fs.rm(resolveFile(doc.file_path), { force: true }, () => undefined);
}

export async function documentCounts(studentId?: string) {
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE verify_status = 'PENDING')::int  AS pending,
            COUNT(*) FILTER (WHERE verify_status = 'VERIFIED')::int AS verified,
            COUNT(*) FILTER (WHERE verify_status = 'REJECTED')::int AS rejected,
            COUNT(*)::int AS total
       FROM document WHERE ($1::text IS NULL OR student_id = $1)`, [studentId || null]);
  return rows[0];
}

/** Resolves a stored relative path inside UPLOAD_ROOT; refuses path traversal. */
export function resolveFile(relPath: string): string {
  const abs = path.resolve(UPLOAD_ROOT, relPath);
  if (abs !== UPLOAD_ROOT && !abs.startsWith(UPLOAD_ROOT + path.sep)) throw notFound('File');
  return abs;
}
