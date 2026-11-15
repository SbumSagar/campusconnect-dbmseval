import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { HttpError, translatePgError, type PgError } from '../utils/errors.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

/**
 * Centralised error handler.  PostgreSQL errors are translated by SQLSTATE
 * (23505, 23503, 23514, P0001, ...) into readable messages, and the original
 * constraint name / SQLSTATE is returned so the UI can show what the DATABASE
 * rejected.  Failed operations are never silently swallowed.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let httpErr: HttpError;
  if (err instanceof HttpError) {
    httpErr = err;
  } else if (err instanceof ZodError) {
    httpErr = new HttpError(400, err.issues[0]?.message ?? 'Invalid input', 'VALIDATION',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  } else if (err instanceof multer.MulterError) {
    httpErr = new HttpError(400, err.code === 'LIMIT_FILE_SIZE'
      ? `File is too large (max ${env.MAX_UPLOAD_MB} MB)` : err.message, 'UPLOAD');
  } else if ((err as { type?: string }).type === 'entity.parse.failed') {
    httpErr = new HttpError(400, 'Malformed JSON body', 'BAD_JSON');
  } else {
    httpErr = translatePgError(err as PgError) ?? new HttpError(500, 'Unexpected server error', 'INTERNAL');
  }

  if (httpErr.status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  } else if (env.NODE_ENV === 'development') {
    console.warn(`[${req.method} ${req.originalUrl}] ${httpErr.status} ${httpErr.code}: ${httpErr.message}`);
  }
  res.status(httpErr.status).json({
    error: { code: httpErr.code, message: httpErr.message, details: httpErr.details ?? undefined },
  });
}
