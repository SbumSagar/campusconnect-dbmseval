import { query } from '../db/pool.js';
import { notFound } from '../utils/errors.js';

export interface CalendarFilters { from?: string; to?: string; type?: string; q?: string; limit?: number }

/** Entries overlapping [from, to]; the key of an entry is (title, start_datetime). */
export async function listCalendar(f: CalendarFilters) {
  const { rows } = await query(
    `SELECT title, event_type, description, start_datetime, end_datetime
       FROM calendar
      WHERE ($1::timestamptz IS NULL OR COALESCE(end_datetime, start_datetime) >= $1::timestamptz)
        AND ($2::timestamptz IS NULL OR start_datetime <= $2::timestamptz)
        AND ($3::text IS NULL OR event_type = $3)
        AND ($4::text IS NULL OR title ILIKE '%' || $4 || '%' OR description ILIKE '%' || $4 || '%')
      ORDER BY start_datetime, title
      LIMIT $5`,
    [f.from || null, f.to || null, f.type || null, f.q || null, f.limit ?? 500]);
  return rows;
}

export interface CalendarInput {
  title: string; event_type: string; description: string | null; start_datetime: string; end_datetime: string | null;
}

export async function createEntry(c: CalendarInput) {
  const { rows } = await query(
    `INSERT INTO calendar (title, event_type, description, start_datetime, end_datetime)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [c.title, c.event_type, c.description, c.start_datetime, c.end_datetime]);
  return rows[0];
}

/** Updates an entry identified by its composite primary key (title, start_datetime). */
export async function updateEntry(key: { title: string; start: string }, c: CalendarInput) {
  const { rows } = await query(
    `UPDATE calendar SET title = $3, event_type = $4, description = $5, start_datetime = $6, end_datetime = $7
      WHERE title = $1 AND start_datetime = $2::timestamptz RETURNING *`,
    [key.title, key.start, c.title, c.event_type, c.description, c.start_datetime, c.end_datetime]);
  if (!rows.length) throw notFound('Calendar entry');
  return rows[0];
}

export async function deleteEntry(key: { title: string; start: string }) {
  const { rowCount } = await query(
    'DELETE FROM calendar WHERE title = $1 AND start_datetime = $2::timestamptz', [key.title, key.start]);
  if (!rowCount) throw notFound('Calendar entry');
}
