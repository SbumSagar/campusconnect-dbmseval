import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAny } from '../middleware/auth.js';
import * as stores from '../services/stores.service.js';
import { paginationSchema, zOptText, zSearch, zTime } from '../utils/validate.js';

const storeName = z.string().trim().min(1, 'Store name is required').max(100);
const itemName = z.string().trim().min(1, 'Item name is required').max(100);
const optTime = zTime.nullable().optional().or(z.literal('')).transform((v) => (v ? v : null));

const storeBody = z.object({
  store_type: zOptText(50),
  location: zOptText(150),
  opens_at: optTime,
  closes_at: optTime,
});

const menuBody = z.object({
  item_name: itemName,
  category: zOptText(50),
  // No minimum here on purpose: CHECK (price >= 0) in PostgreSQL is the rule.
  price: z.coerce.number().finite().max(99_999_999),
  is_available: z.boolean().default(true),
});

// ---------------------------------------------------------------- /api/stores
export const storesRouter = Router();

storesRouter.get('/', requireAny, async (_req, res) => {
  res.json(await stores.listStores());
});

storesRouter.get('/:store', requireAny, async (req, res) => {
  res.json(await stores.getStore(storeName.parse(req.params.store)));
});

storesRouter.post('/', requireAdmin, async (req, res) => {
  const body = storeBody.extend({ store_name: storeName }).parse(req.body);
  res.status(201).json(await stores.createStore(body));
});

storesRouter.put('/:store', requireAdmin, async (req, res) => {
  res.json(await stores.updateStore(storeName.parse(req.params.store), storeBody.parse(req.body)));
});

storesRouter.delete('/:store', requireAdmin, async (req, res) => {
  await stores.deleteStore(storeName.parse(req.params.store));
  res.status(204).end();
});

// ---------------------------------------------------------------- /api/menu
export const menuRouter = Router();

menuRouter.get('/', requireAny, async (req, res) => {
  const f = paginationSchema.extend({
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    store: storeName.optional(),
    q: zSearch(),
    category: z.string().max(50).optional(),
    available: z.enum(['yes', 'no']).optional(),
    sort: z.string().max(30).optional(),
  }).parse(req.query);
  // students only ever see what is on sale plus availability flags - no admin-only data here
  res.json(await stores.listMenu(f));
});

menuRouter.get('/categories', requireAny, async (req, res) => {
  res.json(await stores.menuCategories(typeof req.query.store === 'string' ? req.query.store : undefined));
});

menuRouter.post('/:store', requireAdmin, async (req, res) => {
  res.status(201).json(await stores.createMenuItem(storeName.parse(req.params.store), menuBody.parse(req.body)));
});

menuRouter.patch('/:store/:item', requireAdmin, async (req, res) => {
  const body = menuBody.partial().extend({ is_available: z.boolean().optional() }).parse(req.body);
  res.json(await stores.updateMenuItem(storeName.parse(req.params.store), itemName.parse(req.params.item), body));
});

menuRouter.delete('/:store/:item', requireAdmin, async (req, res) => {
  await stores.deleteMenuItem(storeName.parse(req.params.store), itemName.parse(req.params.item));
  res.status(204).end();
});
