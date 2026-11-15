import { z } from 'zod';

/** Common zod building blocks for request validation. */
export const zId = z.coerce.number().int().positive();
export const zStudentId = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,20}$/, 'Invalid student ID');
export const zOptText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
/** Free-text search: trimmed, and LIKE wildcards (% _ \) escaped so they match literally. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);
export const zSearch = (max = 100) => z.string().trim().max(max).transform(escapeLike).optional();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const zDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date/time');
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:MM');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export function page<T>(rows: (T & { total_count?: number })[], p: { page: number; pageSize: number }): Page<T> {
  const total = rows.length ? Number(rows[0].total_count ?? 0) : 0;
  return {
    rows: rows.map(({ total_count: _t, ...r }) => r as T),
    total,
    page: p.page,
    pageSize: p.pageSize,
    pages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

/** Returns the SQL ORDER BY fragment for a whitelisted sort key (never user text). */
export function orderBy(sort: string | undefined, allowed: Record<string, string>, fallback: string): string {
  if (!sort) return allowed[fallback];
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const col = allowed[key];
  if (!col) return allowed[fallback];
  return `${col} ${desc ? 'DESC' : 'ASC'} NULLS LAST`;
}
