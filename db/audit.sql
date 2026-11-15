-- =====================================================================
-- CampusConnect - audit queries.  EVERY query must return ZERO rows.
-- The first three are the audit queries of the mid-sem schema; the rest
-- check the remaining business rules.  Run with `npm run db:audit` or
-- from the Integrity Lab (admin UI).
-- =====================================================================


-- @name: order_total_matches_items
-- ORDERS.total_amount must equal Σ quantity × unit_price of its items (trg_item).
SELECT o.order_id, o.total_amount, COALESCE(SUM(i.quantity * i.unit_price), 0) AS items_sum
  FROM orders o
  LEFT JOIN order_item i USING (order_id)
 GROUP BY o.order_id
HAVING o.total_amount <> COALESCE(SUM(i.quantity * i.unit_price), 0);


-- @name: student_spend_matches_orders
-- STUDENT.total_deductions_amount must equal Σ total of non-cancelled orders (trg_order).
SELECT s.student_id, s.total_deductions_amount, COALESCE(SUM(o.total_amount), 0) AS orders_sum
  FROM student s
  LEFT JOIN orders o ON o.student_id = s.student_id AND o.status <> 'CANCELLED'
 GROUP BY s.student_id
HAVING s.total_deductions_amount <> COALESCE(SUM(o.total_amount), 0);


-- @name: room_occupancy_matches_allocations
-- ROOM.occupancy must equal the number of ACTIVE allocations (trg_alloc_occupancy).
SELECT r.hostel_name, r.room_no, r.occupancy
  FROM room r
 WHERE r.occupancy <> (SELECT COUNT(*) FROM room_allocation a
                        WHERE a.hostel_name = r.hostel_name AND a.room_no = r.room_no
                          AND a.status = 'ACTIVE');


-- @name: orders_without_items
-- Every committed order has at least one item (ctrg_order_has_items).
SELECT o.order_id
  FROM orders o
 WHERE NOT EXISTS (SELECT 1 FROM order_item i WHERE i.order_id = o.order_id);


-- @name: multiple_active_allocations
-- At most one ACTIVE allocation per student (uq_one_active_allocation).
SELECT student_id, COUNT(*) AS active_allocations
  FROM room_allocation
 WHERE status = 'ACTIVE'
 GROUP BY student_id
HAVING COUNT(*) > 1;


-- @name: cross_gender_allocations
-- Application rule: no ACTIVE allocation to a hostel of the other gender.
SELECT a.student_id, s.gender AS student_gender, a.hostel_name, h.gender AS hostel_gender
  FROM room_allocation a
  JOIN student s ON s.student_id  = a.student_id
  JOIN hostel  h ON h.hostel_name = a.hostel_name
 WHERE a.status = 'ACTIVE'
   AND h.gender <> 'COED'
   AND s.gender IS NOT NULL
   AND s.gender <> h.gender;


-- @name: items_from_other_store
-- Every order item belongs to the store that received the order (composite FKs).
SELECT i.order_id, i.item_name, i.store_name AS item_store, o.store_name AS order_store
  FROM order_item i
  JOIN orders o ON o.order_id = i.order_id
 WHERE i.store_name <> o.store_name;
