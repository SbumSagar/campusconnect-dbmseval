import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAny } from '../middleware/auth.js';
import * as calendar from '../services/calendar.service.js';
import { adminDashboard } from '../services/dashboard.service.js';
import * as integrity from '../services/integrity.service.js';
import * as reports from '../services/reports.service.js';
import { zDateTime, zSearch } from '../utils/validate.js';

// ---------------------------------------------------------------- /api/calendar
export const calendarRouter = Router();

const TYPES = ['HOLIDAY', 'EVENT', 'EXAM'] as const;
const entrySchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  event_type: z.enum(TYPES),
  description: z.string().trim().max(2000).nullable().optional().transform((v) => v || null),
  start_datetime: zDateTime,
  // end >= start is CHECK chk_calendar_dates in the database
  end_datetime: zDateTime.nullable().optional().or(z.literal('')).transform((v) => v || null),
});
const keySchema = z.object({ title: z.string().min(1).max(200), start: zDateTime });

calendarRouter.get('/', requireAny, async (req, res) => {
  const f = z.object({
    from: zDateTime.optional(), to: zDateTime.optional(), type: z.enum(TYPES).optional(),
    q: zSearch(), limit: z.coerce.number().int().min(1).max(1000).optional(),
  }).parse(req.query);
  res.json(await calendar.listCalendar(f));
});

calendarRouter.post('/', requireAdmin, async (req, res) => {
  res.status(201).json(await calendar.createEntry(entrySchema.parse(req.body)));
});

/** The composite key (title, start_datetime) is passed as query parameters. */
calendarRouter.put('/entry', requireAdmin, async (req, res) => {
  res.json(await calendar.updateEntry(keySchema.parse(req.query), entrySchema.parse(req.body)));
});

calendarRouter.delete('/entry', requireAdmin, async (req, res) => {
  await calendar.deleteEntry(keySchema.parse(req.query));
  res.status(204).end();
});

// ---------------------------------------------------------------- /api/admin
export const adminRouter = Router();
adminRouter.get('/dashboard', requireAdmin, async (_req, res) => {
  res.json(await adminDashboard());
});

// ---------------------------------------------------------------- /api/reports
export const reportsRouter = Router();
reportsRouter.get('/', requireAdmin, (_req, res) => {
  res.json(reports.listReports());
});
reportsRouter.get('/:key', requireAdmin, async (req, res) => {
  res.json(await reports.runReport(String(req.params.key), req.query as Record<string, unknown>));
});

// ---------------------------------------------------------------- /api/integrity
export const integrityRouter = Router();
integrityRouter.get('/tests', requireAdmin, (_req, res) => {
  res.json(integrity.listTests());
});
integrityRouter.post('/tests/run-all', requireAdmin, async (_req, res) => {
  res.json(await integrity.runAll());
});
integrityRouter.post('/tests/:key/run', requireAdmin, async (req, res) => {
  res.json(await integrity.runTest(String(req.params.key)));
});
integrityRouter.get('/audits', requireAdmin, async (_req, res) => {
  res.json(await integrity.runAudits());
});
integrityRouter.get('/catalog', requireAdmin, async (_req, res) => {
  res.json(await integrity.catalog());
});
