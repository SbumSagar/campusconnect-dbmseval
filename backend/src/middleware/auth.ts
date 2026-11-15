import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export type Role = 'student' | 'admin';

export interface SessionUser {
  /** student_id for students, admin_id (as string) for admins */
  sub: string;
  role: Role;
  name: string;
  email: string;
  adminId?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const SESSION_COOKIE = 'cc_session';

export function signSession(user: SessionUser): string {
  return jwt.sign(user, env.JWT_SECRET, {
    expiresIn: env.SESSION_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'campusconnect',
    audience: 'campusconnect-web',
  });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
  };
}

/** Reads and verifies the session JWT from the httpOnly cookie (or Bearer header). */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = req.cookies?.[SESSION_COOKIE] ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'campusconnect', audience: 'campusconnect-web' }) as SessionUser;
    req.user = { sub: payload.sub, role: payload.role, name: payload.name, email: payload.email, adminId: payload.adminId };
    next();
  } catch (err) {
    next(unauthorized((err as Error).name === 'TokenExpiredError' ? 'Your session has expired - please sign in again' : 'Invalid session'));
  }
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden('This area is restricted to ' + roles.join(' / ') + ' accounts'));
  next();
};

/** authenticate + (optional) role check composed into a single middleware. */
const guard = (...roles: Role[]): RequestHandler => (req, res, next) =>
  authenticate(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!roles.length) return next();
    return requireRole(...roles)(req, res, next);
  });

export const requireStudent = guard('student');
export const requireAdmin = guard('admin');
export const requireAny = guard();

/** Helper: the authenticated student's id (throws if the caller is not a student). */
export function studentId(req: Request): string {
  if (req.user?.role !== 'student') throw forbidden();
  return req.user.sub;
}

export function adminId(req: Request): number {
  if (req.user?.role !== 'admin' || !req.user.adminId) throw forbidden();
  return req.user.adminId;
}
