import { query, withTransaction } from '../db/pool.js';
import type { SessionUser } from '../middleware/auth.js';
import { conflict, forbidden, notFound, ruleViolation } from '../utils/errors.js';
import { page } from '../utils/validate.js';

export interface CartItem { item_name: string; quantity: number }

/**
 * Workflow 1 - place an order.
 * ONE transaction:  BEGIN → sp_place_order(...) → COMMIT
 *   - sp_place_order inserts ORDERS and every ORDER_ITEM (unit_price snapshot)
 *   - trg_item recomputes ORDERS.total_amount after every item insert
 *   - trg_order adds the total to STUDENT.total_deductions_amount
 *   - ctrg_order_has_items (DEFERRED) checks "≥ 1 item" at COMMIT
 * The application never computes or writes a total itself.
 */
export async function placeOrder(studentId: string, store: string, items: CartItem[]) {
  const result = await withTransaction(async (db) => {
    const before = await db.query('SELECT total_deductions_amount FROM student WHERE student_id = $1', [studentId]);
    if (!before.rows.length) throw notFound('Student');
    const { rows } = await db.query<{ order_id: number }>(
      'SELECT sp_place_order($1, $2, $3::jsonb) AS order_id', [studentId, store, JSON.stringify(items)]);
    return { orderId: rows[0].order_id, spendBefore: Number(before.rows[0].total_deductions_amount) };
  });
  const order = await getOrder(result.orderId);
  const after = await query('SELECT total_deductions_amount FROM student WHERE student_id = $1', [studentId]);
  return { order, spend: { before: result.spendBefore, after: Number(after.rows[0].total_deductions_amount) } };
}

export async function getOrder(orderId: number, user?: SessionUser) {
  const { rows } = await query(
    `SELECT o.*, s.full_name AS student_name, cs.location AS store_location, cs.store_type
       FROM orders o
       JOIN student s       ON s.student_id = o.student_id
       JOIN campus_store cs ON cs.store_name = o.store_name
      WHERE o.order_id = $1`, [orderId]);
  if (!rows.length) throw notFound('Order');
  if (user?.role === 'student' && rows[0].student_id !== user.sub) throw notFound('Order');
  const items = await query(
    `SELECT oi.item_name, oi.quantity, oi.unit_price, (oi.quantity * oi.unit_price) AS line_total,
            m.category, m.price AS current_price
       FROM order_item oi
       JOIN menu_item m ON m.store_name = oi.store_name AND m.item_name = oi.item_name
      WHERE oi.order_id = $1 ORDER BY oi.item_name`, [orderId]);
  return { ...rows[0], items: items.rows };
}

export interface OrderFilters {
  student?: string; store?: string; status?: string; q?: string; from?: string; to?: string; page: number; pageSize: number;
}

export async function listOrders(f: OrderFilters) {
  const { rows } = await query(
    `SELECT o.order_id, o.student_id, s.full_name AS student_name, o.store_name, o.ordered_at, o.status, o.total_amount,
            (SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.order_id)::int AS item_count,
            (SELECT string_agg(oi.quantity || ' × ' || oi.item_name, ', ' ORDER BY oi.item_name)
               FROM order_item oi WHERE oi.order_id = o.order_id) AS summary,
            COUNT(*) OVER () AS total_count
       FROM orders o JOIN student s ON s.student_id = o.student_id
      WHERE ($1::text IS NULL OR o.student_id = $1)
        AND ($2::text IS NULL OR o.store_name = $2)
        AND ($3::text IS NULL OR o.status = $3)
        AND ($4::text IS NULL OR o.student_id ILIKE '%' || $4 || '%' OR s.full_name ILIKE '%' || $4 || '%'
             OR o.order_id::text = $4)
        AND ($5::date IS NULL OR o.ordered_at >= $5::date)
        AND ($6::date IS NULL OR o.ordered_at < $6::date + 1)
      ORDER BY o.ordered_at DESC
      LIMIT $7 OFFSET $8`,
    [f.student || null, f.store || null, f.status || null, f.q || null, f.from || null, f.to || null,
      f.pageSize, (f.page - 1) * f.pageSize]);
  return page(rows, f);
}

/** Student cancellation: allowed while the order is PLACED or PREPARING. trg_order reverses the spend. */
export async function cancelOrder(orderId: number, studentId: string) {
  return withTransaction(async (db) => {
    const cur = await db.query('SELECT student_id, status FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (!cur.rows.length || cur.rows[0].student_id !== studentId) throw notFound('Order');
    if (!['PLACED', 'PREPARING'].includes(cur.rows[0].status)) {
      throw conflict(`An order that is ${cur.rows[0].status} can no longer be cancelled.`);
    }
    const before = await db.query('SELECT total_deductions_amount FROM student WHERE student_id = $1', [studentId]);
    await db.query(`UPDATE orders SET status = 'CANCELLED' WHERE order_id = $1`, [orderId]);
    const after = await db.query('SELECT total_deductions_amount FROM student WHERE student_id = $1', [studentId]);
    return { spend: { before: before.rows[0].total_deductions_amount, after: after.rows[0].total_deductions_amount } };
  });
}

/** Allowed status changes: forward through the kitchen flow, cancel before completion, reinstate a cancelled order. */
const TRANSITIONS: Record<string, string[]> = {
  PLACED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: ['PLACED'],
};

/** Admin status change (incl. cancel / reinstate). trg_order adjusts the student's spend. */
export async function setOrderStatus(orderId: number, status: string) {
  return withTransaction(async (db) => {
    const cur = await db.query('SELECT student_id, status FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (!cur.rows.length) throw notFound('Order');
    if (!TRANSITIONS[cur.rows[0].status]?.includes(status)) {
      throw ruleViolation(`An order cannot go from ${cur.rows[0].status} to ${status}.`);
    }
    const sid = cur.rows[0].student_id;
    const before = await db.query('SELECT total_deductions_amount FROM student WHERE student_id = $1', [sid]);
    const { rows } = await db.query('UPDATE orders SET status = $2 WHERE order_id = $1 RETURNING *', [orderId, status]);
    const after = await db.query('SELECT total_deductions_amount FROM student WHERE student_id = $1', [sid]);
    return {
      order: rows[0], previousStatus: cur.rows[0].status,
      spend: { student_id: sid, before: before.rows[0].total_deductions_amount, after: after.rows[0].total_deductions_amount },
    };
  });
}

export async function studentSpendSummary(studentId: string, user: SessionUser) {
  if (user.role === 'student' && user.sub !== studentId) throw forbidden();
  const { rows } = await query('SELECT * FROM v_student_spend WHERE student_id = $1', [studentId]);
  if (!rows.length) throw notFound('Student');
  const byStore = await query(
    `SELECT store_name, COUNT(*)::int AS orders, SUM(total_amount) AS spend FROM orders
      WHERE student_id = $1 AND status <> 'CANCELLED' GROUP BY store_name ORDER BY spend DESC`, [studentId]);
  return { ...rows[0], byStore: byStore.rows };
}
