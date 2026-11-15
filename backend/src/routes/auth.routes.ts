import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { SESSION_COOKIE, authenticate, sessionCookieOptions, signSession } from '../middleware/auth.js';
import * as auth from '../services/auth.service.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.NODE_ENV === 'production' ? 20 : 200,
  skipSuccessfulRequests: true, // only failed attempts count - a lab full of examiners can sign in
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many sign-in attempts. Try again in a few minutes.' } },
});

const loginSchema = z.object({
  role: z.enum(['student', 'admin']),
  identifier: z.string().trim().min(1, 'Enter your ID or e-mail').max(255),
  password: z.string().min(1, 'Enter your password').max(200),
});

router.post('/login', loginLimiter, async (req, res) => {
  const { role, identifier, password } = loginSchema.parse(req.body);
  const user = await auth.login(role, identifier, password);
  res.cookie(SESSION_COOKIE, signSession(user), sessionCookieOptions());
  res.json({ user });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

/** Public: which demo identities exist (no passwords) - used by the login page helper. */
router.get('/demo-accounts', async (_req, res) => {
  res.json(await auth.demoAccounts());
});

export default router;
