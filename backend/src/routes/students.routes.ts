import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAdmin, requireStudent, studentId } from '../middleware/auth.js';
import { resolveFile } from '../services/documents.service.js';
import * as hostels from '../services/hostels.service.js';
import * as orders from '../services/orders.service.js';
import * as students from '../services/students.service.js';
import { paginationSchema, zOptText, zSearch, zStudentId } from '../utils/validate.js';

const router = Router();

// ---------------------------------------------------------------- student self-service
router.get('/me', requireStudent, async (req, res) => {
  res.json(await students.getStudent(studentId(req)));
});

router.get('/me/dashboard', requireStudent, async (req, res) => {
  res.json(await students.studentDashboard(studentId(req)));
});

router.get('/me/allocations', requireStudent, async (req, res) => {
  const sid = studentId(req);
  const [current, history, roommates] = await Promise.all([
    students.getStudent(sid), hostels.allocationHistory(sid), hostels.roommates(sid),
  ]);
  res.json({ current, history, roommates });
});

router.get('/me/spend', requireStudent, async (req, res) => {
  res.json(await orders.studentSpendSummary(studentId(req), req.user!));
});

const selfUpdate = z.object({
  phone: z.string().trim().max(20).regex(/^[0-9+\-() ]*$/, 'Phone may contain digits, spaces, + - ( )')
    .optional().nullable().transform((v) => (v ? v : null)),
});
router.patch('/me', requireStudent, async (req, res) => {
  const body = selfUpdate.parse(req.body);
  res.json(await students.updateStudent(studentId(req), { phone: body.phone }));
});

// ---------------------------------------------------------------- admin management
const listSchema = paginationSchema.extend({
  q: zSearch(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  hostel: z.string().max(100).optional(),
  allocated: z.enum(['yes', 'no']).optional(),
  sort: z.string().max(30).optional(),
});

router.get('/', requireAdmin, async (req, res) => {
  res.json(await students.listStudents(listSchema.parse(req.query)));
});

const studentSchema = z.object({
  student_id: zStudentId,
  full_name: z.string().trim().min(1, 'Name is required').max(150),
  email: z.string().trim().toLowerCase().email('Invalid e-mail').max(255),
  phone: zOptText(20),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional().transform((v) => v ?? null),
  program: zOptText(100),
});

router.post('/', requireAdmin, async (req, res) => {
  res.status(201).json(await students.createStudent(studentSchema.parse(req.body)));
});

router.get('/:id', requireAdmin, async (req, res) => {
  res.json(await students.studentDetail(zStudentId.parse(req.params.id)));
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const body = studentSchema.omit({ student_id: true }).partial().parse(req.body);
  res.json(await students.updateStudent(zStudentId.parse(req.params.id), body));
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = zStudentId.parse(req.params.id);
  const docs = await query<{ file_path: string }>('SELECT file_path FROM document WHERE student_id = $1', [id]);
  await students.deleteStudent(id); // documents cascade in the DB; remove their files afterwards
  for (const d of docs.rows) fs.rm(resolveFile(d.file_path), { force: true }, () => undefined);
  res.status(204).end();
});

export default router;
