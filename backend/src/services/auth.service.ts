/**
 * Demonstration authentication (NOT production-grade).
 *
 * The approved database design leaves authentication to the application
 * layer, so no credential tables are added to the domain schema:
 *   - students sign in with their student_id; only synthetic accounts whose
 *     id starts with a DEMO_STUDENT_PREFIXES prefix may sign in;
 *   - admins sign in with the e-mail of a row in the ADMIN table;
 *   - each role shares one password configured in .env, kept in memory only
 *     as a bcrypt hash and compared with bcrypt (constant-time).
 */
import bcrypt from 'bcryptjs';
import { demoPrefixes, env } from '../config/env.js';
import { query } from '../db/pool.js';
import type { SessionUser } from '../middleware/auth.js';
import { unauthorized } from '../utils/errors.js';

const hashes = {
  student: env.DEMO_STUDENT_PASSWORD_HASH || bcrypt.hashSync(env.DEMO_STUDENT_PASSWORD!, 10),
  admin: env.DEMO_ADMIN_PASSWORD_HASH || bcrypt.hashSync(env.DEMO_ADMIN_PASSWORD!, 10),
};
// Used to spend the same time when the account does not exist (no user enumeration).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function login(role: 'student' | 'admin', identifier: string, password: string): Promise<SessionUser> {
  const fail = unauthorized('Incorrect ID / e-mail or password');
  if (role === 'student') {
    const id = identifier.trim().toUpperCase();
    const allowed = demoPrefixes.some((p) => id.startsWith(p));
    const { rows } = await query<{ student_id: string; full_name: string; email: string }>(
      'SELECT student_id, full_name, email FROM student WHERE student_id = $1', [id]);
    const ok = await bcrypt.compare(password, rows.length && allowed ? hashes.student : DUMMY_HASH);
    if (!ok || !rows.length || !allowed) throw fail;
    return { sub: rows[0].student_id, role: 'student', name: rows[0].full_name, email: rows[0].email };
  }
  const { rows } = await query<{ admin_id: number; full_name: string; email: string; role: string | null }>(
    'SELECT admin_id, full_name, email, role FROM admin WHERE lower(email) = lower($1)', [identifier.trim()]);
  const ok = await bcrypt.compare(password, rows.length ? hashes.admin : DUMMY_HASH);
  if (!ok || !rows.length) throw fail;
  const a = rows[0];
  return { sub: String(a.admin_id), role: 'admin', name: a.full_name, email: a.email, adminId: a.admin_id };
}

/** Lists the accounts a demonstrator can use (ids only - passwords stay in .env). */
export async function demoAccounts() {
  const students = await query<{ student_id: string; full_name: string; gender: string }>(
    `SELECT student_id, full_name, gender FROM student
      WHERE student_id LIKE ANY ($1) ORDER BY student_id LIMIT 20`, [demoPrefixes.map((p) => `${p}%`)]);
  const admins = await query<{ email: string; full_name: string; role: string }>(
    'SELECT email, full_name, role FROM admin ORDER BY admin_id LIMIT 20');
  return { students: students.rows, admins: admins.rows };
}
