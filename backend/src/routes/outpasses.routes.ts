import { Router } from 'express';
import { z } from 'zod';
import { adminId, requireAdmin, requireAny, requireStudent, studentId } from '../middleware/auth.js';
import * as outpasses from '../services/outpasses.service.js';
import { paginationSchema, zDate, zDateTime, zId, zSearch } from '../utils/validate.js';

const router = Router();

const createSchema = z.object({
  reason: z.string().trim().min(3, 'Please give a reason').max(500),
  out_at: zDateTime,
  return_by: zDateTime,
  // NOTE: return_by > out_at is NOT checked here - CHECK chk_outpass_window does it.
});

router.post('/', requireStudent, async (req, res) => {
  res.status(201).json(await outpasses.createOutpass(studentId(req), createSchema.parse(req.body)));
});

const listSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  q: zSearch(),
  from: zDate.optional(),
  to: zDate.optional(),
  overdue: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

router.get('/', requireAny, async (req, res) => {
  const f = listSchema.parse(req.query);
  const student = req.user!.role === 'student' ? req.user!.sub : undefined;
  res.json(await outpasses.listOutpasses({ ...f, student, q: student ? undefined : f.q }));
});

router.get('/summary', requireAny, async (req, res) => {
  res.json(await outpasses.statusCounts(req.user!.role === 'student' ? req.user!.sub : undefined));
});

router.get('/overdue', requireAdmin, async (_req, res) => {
  res.json(await outpasses.overdue());
});

router.get('/:id', requireAny, async (req, res) => {
  res.json(await outpasses.getOutpass(zId.parse(req.params.id), req.user));
});

router.post('/:id/review', requireAdmin, async (req, res) => {
  const { decision } = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) }).parse(req.body);
  res.json(await outpasses.reviewOutpass(zId.parse(req.params.id), adminId(req), decision));
});

router.post('/:id/return', requireAny, async (req, res) => {
  const { returned_at } = z.object({ returned_at: zDateTime.optional() }).parse(req.body ?? {});
  res.json(await outpasses.recordReturn(zId.parse(req.params.id), req.user!, returned_at));
});

router.post('/:id/cancel', requireStudent, async (req, res) => {
  res.json(await outpasses.cancelOutpass(zId.parse(req.params.id), studentId(req)));
});

export default router;
