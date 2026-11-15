import { query } from '../db/pool.js';
import { notFound } from '../utils/errors.js';
import { orderBy, page } from '../utils/validate.js';

export async function listStores() {
  const { rows } = await query(
    `SELECT cs.store_name, cs.store_type, cs.location,
            to_char(cs.opens_at, 'HH24:MI') AS opens_at, to_char(cs.closes_at, 'HH24:MI') AS closes_at,
            fn_store_is_open(cs.opens_at, cs.closes_at)          AS is_open_now,
            COUNT(m.item_name)::int                              AS item_count,
            COUNT(m.item_name) FILTER (WHERE m.is_available)::int AS available_count,
            MIN(m.price) FILTER (WHERE m.is_available)           AS min_price,
            COALESCE(array_agg(DISTINCT m.category) FILTER (WHERE m.category IS NOT NULL), '{}') AS categories
       FROM campus_store cs
       LEFT JOIN menu_item m ON m.store_name = cs.store_name
      GROUP BY cs.store_name
      ORDER BY cs.store_name`);
  return rows;
}

export async function getStore(name: string) {
  const { rows } = await query(
    `SELECT store_name, store_type, location, to_char(opens_at, 'HH24:MI') AS opens_at,
            to_char(closes_at, 'HH24:MI') AS closes_at, fn_store_is_open(opens_at, closes_at) AS is_open_now
       FROM campus_store WHERE store_name = $1`, [name]);
  if (!rows.length) throw notFound('Store');
  return rows[0];
}

export interface StoreInput {
  store_name: string; store_type: string | null; location: string | null; opens_at: string | null; closes_at: string | null;
}

export async function createStore(s: StoreInput) {
  const { rows } = await query(
    `INSERT INTO campus_store (store_name, store_type, location, opens_at, closes_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING store_name`,
    [s.store_name, s.store_type, s.location, s.opens_at, s.closes_at]);
  return getStore(rows[0].store_name);
}

export async function updateStore(name: string, s: Omit<StoreInput, 'store_name'>) {
  const { rowCount } = await query(
    `UPDATE campus_store SET store_type = $2, location = $3, opens_at = $4, closes_at = $5 WHERE store_name = $1`,
    [name, s.store_type, s.location, s.opens_at, s.closes_at]);
  if (!rowCount) throw notFound('Store');
  return getStore(name);
}

export async function deleteStore(name: string) {
  // Menu items cascade (weak entity), but ORDERS / ORDER_ITEM reference the
  // store restrictively, so a store with order history cannot be deleted.
  const { rowCount } = await query('DELETE FROM campus_store WHERE store_name = $1', [name]);
  if (!rowCount) throw notFound('Store');
}

// ---------------------------------------------------------------- menu
export interface MenuFilters {
  store?: string; q?: string; category?: string; available?: 'yes' | 'no'; sort?: string; page: number; pageSize: number;
}

const MENU_SORTS = {
  default: 'm.store_name ASC, m.category ASC, m.item_name ASC',
  item_name: 'm.item_name', price: 'm.price', category: 'm.category', store_name: 'm.store_name', sold: 'sold',
};

export async function listMenu(f: MenuFilters) {
  const { rows } = await query(
    `SELECT m.*,
            (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_item oi JOIN orders o ON o.order_id = oi.order_id
              WHERE oi.store_name = m.store_name AND oi.item_name = m.item_name AND o.status <> 'CANCELLED')::int AS sold,
            COUNT(*) OVER () AS total_count
       FROM menu_item m
      WHERE ($1::text IS NULL OR m.store_name = $1)
        AND ($2::text IS NULL OR m.item_name ILIKE '%' || $2 || '%' OR m.category ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR m.category = $3)
        AND ($4::text IS NULL OR m.is_available = ($4 = 'yes'))
      ORDER BY ${orderBy(f.sort, MENU_SORTS, 'default')}, m.item_name
      LIMIT $5 OFFSET $6`,
    [f.store || null, f.q || null, f.category || null, f.available || null, f.pageSize, (f.page - 1) * f.pageSize]);
  return page(rows, f);
}

export async function menuCategories(store?: string) {
  const { rows } = await query(
    `SELECT DISTINCT category FROM menu_item WHERE category IS NOT NULL AND ($1::text IS NULL OR store_name = $1)
      ORDER BY category`, [store || null]);
  return rows.map((r) => r.category as string);
}

export interface MenuInput { item_name: string; category: string | null; price: number; is_available: boolean }

export async function createMenuItem(store: string, m: MenuInput) {
  const { rows } = await query(
    `INSERT INTO menu_item (store_name, item_name, category, price, is_available)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`, [store, m.item_name, m.category, m.price, m.is_available]);
  return rows[0];
}

/**
 * Price changes never touch past orders: ORDER_ITEM keeps its own unit_price
 * snapshot.  Renaming an item that appears in orders is refused by the FK.
 */
export async function updateMenuItem(store: string, item: string, m: Partial<MenuInput>) {
  const { rows } = await query(
    `UPDATE menu_item SET
        item_name    = COALESCE($3, item_name),
        category     = CASE WHEN $4::boolean THEN $5 ELSE category END,
        price        = COALESCE($6, price),
        is_available = COALESCE($7, is_available)
      WHERE store_name = $1 AND item_name = $2 RETURNING *`,
    [store, item, m.item_name ?? null, m.category !== undefined, m.category ?? null, m.price ?? null, m.is_available ?? null]);
  if (!rows.length) throw notFound('Menu item');
  return rows[0];
}

export async function deleteMenuItem(store: string, item: string) {
  const { rowCount } = await query('DELETE FROM menu_item WHERE store_name = $1 AND item_name = $2', [store, item]);
  if (!rowCount) throw notFound('Menu item');
}
