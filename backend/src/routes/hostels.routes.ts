import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAny } from '../middleware/auth.js';
import * as hostels from '../services/hostels.service.js';
import { paginationSchema, zDate, zSearch, zStudentId } from '../utils/validate.js';

const name = z.string().trim().min(1).max(100);
const roomNo = z.string().trim().min(1, 'Room number is required').max(10);

// ---------------------------------------------------------------- /api/hostels
export const hostelsRouter = Router();

hostelsRouter.get('/', requireAny, async (_req, res) => {
  res.json(await hostels.listHostels());
});

hostelsRouter.get('/:name', requireAdmin, async (req, res) => {
  res.json(await hostels.getHostel(name.parse(req.params.name)));
});

hostelsRouter.patch('/:name', requireAdmin, async (req, res) => {
  const body = z.object({
    hostel_type: z.string().trim().min(1).max(50).optional(),
    warden_name: z.string().trim().max(100).nullable().optional().transform((v) => (v === undefined ? undefined : v || null)),
  }).parse(req.body);
  res.json(await hostels.updateHostel(name.parse(req.params.name), body));
});

// ---------------------------------------------------------------- /api/rooms
export const roomsRouter = Router();

roomsRouter.get('/', requireAdmin, async (req, res) => {
  const f = paginationSchema.extend({
    hostel: name,
    floor: z.coerce.number().int().min(0).optional(),
    q: zSearch(50),
    occupancy: z.enum(['empty', 'occupied']).optional(),
  }).parse(req.query);
  res.json(await hostels.listRooms(f));
});

roomsRouter.get('/available', requireAdmin, async (req, res) => {
  const f = z.object({ student: zStudentId, hostel: name.optional(), q: zSearch(10) }).parse(req.query);
  res.json(await hostels.availableRooms(f.student, f.hostel, f.q));
});

roomsRouter.get('/:hostel/:room', requireAdmin, async (req, res) => {
  res.json(await hostels.getRoom(name.parse(req.params.hostel), roomNo.parse(req.params.room)));
});

roomsRouter.post('/', requireAdmin, async (req, res) => {
  const body = z.object({ hostel_name: name, room_no: roomNo, floor_no: z.coerce.number().int() }).parse(req.body);
  res.status(201).json(await hostels.createRoom(body));
});

roomsRouter.patch('/:hostel/:room', requireAdmin, async (req, res) => {
  const body = z.object({ room_no: roomNo.optional(), floor_no: z.coerce.number().int().optional() }).parse(req.body);
  res.json(await hostels.updateRoom(name.parse(req.params.hostel), roomNo.parse(req.params.room), body));
});

roomsRouter.delete('/:hostel/:room', requireAdmin, async (req, res) => {
  await hostels.deleteRoom(name.parse(req.params.hostel), roomNo.parse(req.params.room));
  res.status(204).end();
});

// ---------------------------------------------------------------- /api/allocations
export const allocationsRouter = Router();

const target = z.object({
  student_id: zStudentId,
  hostel_name: name,
  room_no: roomNo,
  date: zDate.optional(),
});

allocationsRouter.get('/recent', requireAdmin, async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(100).default(25).parse(req.query.limit);
  res.json(await hostels.recentAllocationEvents(limit));
});

allocationsRouter.get('/student/:id', requireAdmin, async (req, res) => {
  res.json(await hostels.allocationHistory(zStudentId.parse(req.params.id)));
});

allocationsRouter.post('/', requireAdmin, async (req, res) => {
  const b = target.parse(req.body);
  res.status(201).json(await hostels.allocate(b.student_id, b.hostel_name, b.room_no, b.date));
});

allocationsRouter.post('/transfer', requireAdmin, async (req, res) => {
  const b = target.parse(req.body);
  res.json(await hostels.transfer(b.student_id, b.hostel_name, b.room_no, b.date));
});

allocationsRouter.post('/vacate', requireAdmin, async (req, res) => {
  const b = z.object({ student_id: zStudentId, date: zDate.optional() }).parse(req.body);
  res.json(await hostels.vacate(b.student_id, b.date));
});
