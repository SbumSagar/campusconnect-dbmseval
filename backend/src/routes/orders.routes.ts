import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAny, requireStudent, studentId } from '../middleware/auth.js';
import * as orders from '../services/orders.service.js';
import { paginationSchema, zDate, zId, zSearch } from '../utils/validate.js';

const router = Router();

const STATUSES = ['PLACED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'] as const;

const placeSchema = z.object({
  store_name: z.string().trim().min(1).max(100),
  items: z.array(z.object({
    item_name: z.string().trim().min(1).max(100),
    // quantity > 0 is the database's CHECK; only the type is validated here
    quantity: z.coerce.number().int(),
  })).min(1, 'Your cart is empty').max(50),
});

/** Student places an order (one transaction via sp_place_order). */
router.post('/', requireStudent, async (req, res) => {
  const body = placeSchema.parse(req.body);
  res.status(201).json(await orders.placeOrder(studentId(req), body.store_name, body.items));
});

const listSchema = paginationSchema.extend({
  status: z.enum(STATUSES).optional(),
  store: z.string().max(100).optional(),
  q: zSearch(),
  from: zDate.optional(),
  to: zDate.optional(),
});

/** Students see only their own orders; admins see all (with filters). */
router.get('/', requireAny, async (req, res) => {
  const f = listSchema.parse(req.query);
  const student = req.user!.role === 'student' ? req.user!.sub : undefined;
  res.json(await orders.listOrders({ ...f, student, q: student ? undefined : f.q }));
});

router.get('/:id', requireAny, async (req, res) => {
  res.json(await orders.getOrder(zId.parse(req.params.id), req.user));
});

router.post('/:id/cancel', requireStudent, async (req, res) => {
  const id = zId.parse(req.params.id);
  const result = await orders.cancelOrder(id, studentId(req));
  res.json({ ...result, order: await orders.getOrder(id) });
});

router.patch('/:id/status', requireAdmin, async (req, res) => {
  const { status } = z.object({ status: z.enum(STATUSES) }).parse(req.body);
  res.json(await orders.setOrderStatus(zId.parse(req.params.id), status));
});

export default router;
