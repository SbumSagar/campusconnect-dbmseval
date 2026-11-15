-- =====================================================================
-- CampusConnect - SQL reports
--
-- Each report starts with a "-- @name: <key>" marker.  The backend
-- (backend/src/services/reports.service.ts) loads this file at startup
-- and runs the named query with positional parameters ($1, $2, ...).
-- Optional parameters are passed as NULL, so every report can also be
-- pasted into psql (replace $n with NULL or a value).
-- =====================================================================


-- @name: student_spending
-- Report 1 - Student-wise total spending.
-- Concepts: multi-table JOIN, GROUP BY, aggregate FILTER, HAVING.
-- $1 = minimum spend (NULL = 0), $2 = search text (NULL = all), $3 = row limit
SELECT s.student_id,
       s.full_name,
       a.hostel_name,
       COUNT(o.order_id) FILTER (WHERE o.status <> 'CANCELLED')                    AS orders_placed,
       COUNT(o.order_id) FILTER (WHERE o.status =  'CANCELLED')                    AS orders_cancelled,
       COALESCE(SUM(o.total_amount) FILTER (WHERE o.status <> 'CANCELLED'), 0)     AS total_spend,
       ROUND(AVG(o.total_amount) FILTER (WHERE o.status <> 'CANCELLED'), 2)        AS avg_order_value,
       s.total_deductions_amount                                                   AS trigger_maintained_spend,
       MAX(o.ordered_at)                                                           AS last_order_at
  FROM student s
  JOIN orders o                ON o.student_id = s.student_id
  LEFT JOIN room_allocation a  ON a.student_id = s.student_id AND a.status = 'ACTIVE'
 WHERE ($2::TEXT IS NULL
        OR s.student_id ILIKE '%' || $2::TEXT || '%'
        OR s.full_name  ILIKE '%' || $2::TEXT || '%')
 GROUP BY s.student_id, s.full_name, a.hostel_name, s.total_deductions_amount
HAVING COALESCE(SUM(o.total_amount) FILTER (WHERE o.status <> 'CANCELLED'), 0)
       >= COALESCE($1::NUMERIC, 0)
 ORDER BY total_spend DESC, s.student_id
 LIMIT COALESCE($3::INTEGER, 100);


-- @name: store_sales
-- Report 2 - Store-wise sales, revenue share and the highest-selling store.
-- Concepts: CTE, LEFT JOIN, GROUP BY, AVG/COUNT DISTINCT, RANK() and SUM() OVER ().
-- $1 = from date (NULL = no lower bound), $2 = to date inclusive (NULL = no upper bound)
WITH sales AS (
    SELECT cs.store_name,
           cs.store_type,
           COUNT(o.order_id) FILTER (WHERE o.status <> 'CANCELLED')                AS total_orders,
           COUNT(o.order_id) FILTER (WHERE o.status =  'CANCELLED')                AS cancelled_orders,
           COALESCE(SUM(o.total_amount) FILTER (WHERE o.status <> 'CANCELLED'), 0) AS revenue,
           ROUND(AVG(o.total_amount) FILTER (WHERE o.status <> 'CANCELLED'), 2)    AS avg_order_value,
           COUNT(DISTINCT o.student_id)                                            AS unique_customers
      FROM campus_store cs
      LEFT JOIN orders o
             ON o.store_name = cs.store_name
            AND ($1::DATE IS NULL OR o.ordered_at >= $1::DATE)
            AND ($2::DATE IS NULL OR o.ordered_at <  $2::DATE + 1)
     GROUP BY cs.store_name, cs.store_type
)
SELECT store_name,
       store_type,
       total_orders,
       cancelled_orders,
       revenue,
       avg_order_value,
       unique_customers,
       RANK() OVER (ORDER BY revenue DESC)                                 AS revenue_rank,
       ROUND(100.0 * revenue / NULLIF(SUM(revenue) OVER (), 0), 1)         AS revenue_share_pct,
       RANK() OVER (ORDER BY revenue DESC) = 1 AND revenue > 0             AS is_top_store
  FROM sales
 ORDER BY revenue DESC, store_name;


-- @name: popular_items
-- Report 3 - Most popular menu items, ranked within each store.
-- Concepts: 3-way JOIN on composite keys, GROUP BY, RANK() OVER (PARTITION BY), DENSE_RANK().
-- $1 = store name (NULL = all stores), $2 = top-N per store (NULL = 5)
WITH item_sales AS (
    SELECT oi.store_name,
           oi.item_name,
           m.category,
           m.price                              AS current_price,
           SUM(oi.quantity)                     AS quantity_sold,
           SUM(oi.quantity * oi.unit_price)     AS revenue,
           COUNT(DISTINCT oi.order_id)          AS times_ordered
      FROM order_item oi
      JOIN orders o     ON o.order_id = oi.order_id
      JOIN menu_item m  ON m.store_name = oi.store_name AND m.item_name = oi.item_name
     WHERE o.status <> 'CANCELLED'
       AND ($1::VARCHAR IS NULL OR oi.store_name = $1::VARCHAR)
     GROUP BY oi.store_name, oi.item_name, m.category, m.price
), ranked AS (
    SELECT item_sales.*,
           RANK()       OVER (PARTITION BY store_name ORDER BY quantity_sold DESC) AS rank_in_store,
           DENSE_RANK() OVER (ORDER BY quantity_sold DESC)                          AS overall_rank
      FROM item_sales
)
SELECT store_name, rank_in_store, item_name, category, quantity_sold,
       times_ordered, revenue, current_price, overall_rank
  FROM ranked
 WHERE rank_in_store <= COALESCE($2::INTEGER, 5)
 ORDER BY store_name, rank_in_store, item_name;


-- @name: hostel_occupancy
-- Report 4 - Hostel occupancy and distribution of residents per room.
-- Concepts: two chained CTEs, correlated subquery (cross-checks the
-- trigger-maintained ROOM.occupancy), FILTER, window SUM() OVER (PARTITION BY).
WITH room_stats AS (
    SELECT r.hostel_name,
           r.room_no,
           r.floor_no,
           r.occupancy,
           (SELECT COUNT(*)
              FROM room_allocation a
             WHERE a.hostel_name = r.hostel_name
               AND a.room_no     = r.room_no
               AND a.status      = 'ACTIVE')            AS active_allocations
      FROM room r
), hostel_stats AS (
    SELECT h.hostel_name,
           h.gender,
           h.hostel_type,
           COUNT(rs.room_no)                                   AS total_rooms,
           COUNT(DISTINCT rs.floor_no)                         AS floors,
           COALESCE(SUM(rs.active_allocations), 0)::INTEGER    AS active_allocations,
           COALESCE(SUM(rs.occupancy), 0)::INTEGER             AS occupancy_counter,
           COUNT(rs.room_no) FILTER (WHERE rs.occupancy = 0)   AS empty_rooms,
           COUNT(rs.room_no) FILTER (WHERE rs.occupancy = 1)   AS single_rooms,
           COUNT(rs.room_no) FILTER (WHERE rs.occupancy = 2)   AS double_rooms,
           COUNT(rs.room_no) FILTER (WHERE rs.occupancy >= 3)  AS three_plus_rooms
      FROM hostel h
      LEFT JOIN room_stats rs ON rs.hostel_name = h.hostel_name
     GROUP BY h.hostel_name, h.gender, h.hostel_type
)
SELECT hostel_name, gender, hostel_type, floors, total_rooms, active_allocations,
       occupancy_counter, empty_rooms, single_rooms, double_rooms, three_plus_rooms,
       ROUND(100.0 * (total_rooms - empty_rooms) / NULLIF(total_rooms, 0), 1) AS rooms_in_use_pct,
       ROUND(active_allocations::NUMERIC / NULLIF(total_rooms, 0), 2)        AS residents_per_room,
       ROUND(100.0 * active_allocations
             / NULLIF(SUM(active_allocations) OVER (PARTITION BY gender), 0), 1) AS share_of_gender_pct
  FROM hostel_stats
 ORDER BY gender DESC, hostel_name;


-- @name: outpass_analytics
-- Report 5 - Outpass analytics: totals per status, approval rate, overdue.
-- Concepts: CTE, conditional aggregation (FILTER), date arithmetic, NULLIF.
-- $1 = from date, $2 = to date inclusive (filter on out_at; NULL = unbounded)
WITH base AS (
    SELECT *
      FROM outpass_request
     WHERE ($1::DATE IS NULL OR out_at >= $1::DATE)
       AND ($2::DATE IS NULL OR out_at <  $2::DATE + 1)
)
SELECT COUNT(*)                                              AS total_requests,
       COUNT(*) FILTER (WHERE status = 'APPROVED')           AS approved,
       COUNT(*) FILTER (WHERE status = 'REJECTED')           AS rejected,
       COUNT(*) FILTER (WHERE status = 'PENDING')            AS pending,
       COUNT(*) FILTER (WHERE status = 'CANCELLED')          AS cancelled,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'APPROVED')
             / NULLIF(COUNT(*) FILTER (WHERE status IN ('APPROVED', 'REJECTED')), 0), 1)
                                                             AS approval_rate_pct,
       COUNT(*) FILTER (WHERE status = 'APPROVED' AND returned_at IS NULL
                          AND return_by < now())             AS overdue_now,
       COUNT(*) FILTER (WHERE returned_at > return_by)       AS returned_late,
       COUNT(*) FILTER (WHERE returned_at IS NOT NULL
                          AND returned_at <= return_by)      AS returned_on_time,
       ROUND(AVG(EXTRACT(EPOCH FROM (return_by - out_at)) / 3600.0), 1)
                                                             AS avg_requested_hours
  FROM base;


-- @name: outpass_monthly
-- Report 5b - Outpass requests per month with a running total.
-- Concepts: date_trunc, GROUP BY, FILTER, window SUM() OVER (ORDER BY).
SELECT to_char(date_trunc('month', out_at), 'YYYY-MM')                AS month,
       COUNT(*)                                                       AS requests,
       COUNT(*) FILTER (WHERE status = 'APPROVED')                    AS approved,
       COUNT(*) FILTER (WHERE status = 'REJECTED')                    AS rejected,
       COUNT(*) FILTER (WHERE status IN ('PENDING', 'CANCELLED'))     AS other,
       SUM(COUNT(*)) OVER (ORDER BY date_trunc('month', out_at))      AS running_total
  FROM outpass_request
 GROUP BY date_trunc('month', out_at)
 ORDER BY date_trunc('month', out_at);


-- @name: monthly_revenue
-- Extra - Monthly revenue with running total and month-over-month change.
-- Concepts: CTE, date_trunc, window SUM() OVER (ORDER BY), LAG().
WITH monthly AS (
    SELECT date_trunc('month', ordered_at)  AS m,
           COUNT(*)                         AS orders,
           SUM(total_amount)                AS revenue
      FROM orders
     WHERE status <> 'CANCELLED'
     GROUP BY date_trunc('month', ordered_at)
)
SELECT to_char(m, 'YYYY-MM')                              AS month,
       orders,
       revenue,
       SUM(revenue) OVER (ORDER BY m)                     AS running_revenue,
       revenue - LAG(revenue) OVER (ORDER BY m)           AS change_vs_prev_month
  FROM monthly
 ORDER BY m;


-- @name: above_hostel_average
-- Extra - Students who spend more than the average spender of their own hostel.
-- Concepts: CORRELATED SUBQUERY (inner query re-evaluated per outer hostel).
SELECT s.student_id,
       s.full_name,
       a.hostel_name,
       s.total_deductions_amount                               AS spend,
       (SELECT ROUND(AVG(s2.total_deductions_amount), 2)
          FROM student s2
          JOIN room_allocation a2
            ON a2.student_id = s2.student_id AND a2.status = 'ACTIVE'
         WHERE a2.hostel_name = a.hostel_name
           AND s2.total_deductions_amount > 0)                AS hostel_avg_spend
  FROM student s
  JOIN room_allocation a
    ON a.student_id = s.student_id AND a.status = 'ACTIVE'
 WHERE s.total_deductions_amount > 0          -- cheap filter first: only spenders are compared
   AND s.total_deductions_amount >
       (SELECT AVG(s2.total_deductions_amount)
          FROM student s2
          JOIN room_allocation a2
            ON a2.student_id = s2.student_id AND a2.status = 'ACTIVE'
         WHERE a2.hostel_name = a.hostel_name
           AND s2.total_deductions_amount > 0)
 ORDER BY a.hostel_name, spend DESC;


-- @name: all_store_customers
-- Extra - Students who have ordered from EVERY campus store (relational division).
-- Concepts: DOUBLE NOT EXISTS ("there is no store from which this student has not ordered").
SELECT s.student_id,
       s.full_name,
       (SELECT COUNT(*) FROM orders o
         WHERE o.student_id = s.student_id AND o.status <> 'CANCELLED') AS orders_placed
  FROM student s
 WHERE EXISTS (SELECT 1 FROM orders o WHERE o.student_id = s.student_id)
   AND NOT EXISTS (
         SELECT 1
           FROM campus_store cs
          WHERE NOT EXISTS (
                SELECT 1
                  FROM orders o
                 WHERE o.student_id = s.student_id
                   AND o.store_name = cs.store_name
                   AND o.status <> 'CANCELLED'))
 ORDER BY orders_placed DESC, s.student_id;


-- @name: unsold_items
-- Extra - Menu items that have never been sold (in a non-cancelled order).
-- Concepts: NESTED query with NOT IN over a composite (row-value) key.
SELECT m.store_name,
       m.item_name,
       m.category,
       m.price,
       m.is_available
  FROM menu_item m
 WHERE (m.store_name, m.item_name) NOT IN (
         SELECT oi.store_name, oi.item_name
           FROM order_item oi
           JOIN orders o ON o.order_id = oi.order_id
          WHERE o.status <> 'CANCELLED')
 ORDER BY m.store_name, m.item_name;


-- @name: premium_items
-- Extra - Items priced above their store's average price.
-- Concepts: NESTED derived table in FROM, JOIN on aggregate, ROUND.
SELECT m.store_name,
       m.item_name,
       m.category,
       m.price,
       avg_t.avg_price                                  AS store_avg_price,
       ROUND(100.0 * (m.price - avg_t.avg_price) / avg_t.avg_price, 1) AS pct_above_avg
  FROM menu_item m
  JOIN (SELECT store_name, ROUND(AVG(price), 2) AS avg_price
          FROM menu_item
         GROUP BY store_name) AS avg_t
    ON avg_t.store_name = m.store_name
 WHERE m.price > avg_t.avg_price
 ORDER BY pct_above_avg DESC;


-- @name: frequent_outpass
-- Extra - Students with many outpass requests.
-- Concepts: JOIN, GROUP BY ... HAVING COUNT(*) >= n, FILTER.
-- $1 = minimum number of requests (NULL = 3)
SELECT s.student_id,
       s.full_name,
       COUNT(*)                                        AS requests,
       COUNT(*) FILTER (WHERE o.status = 'APPROVED')   AS approved,
       COUNT(*) FILTER (WHERE o.status = 'REJECTED')   AS rejected,
       COUNT(*) FILTER (WHERE o.returned_at > o.return_by) AS late_returns,
       MAX(o.out_at)                                   AS last_out_at
  FROM outpass_request o
  JOIN student s ON s.student_id = o.student_id
 GROUP BY s.student_id, s.full_name
HAVING COUNT(*) >= COALESCE($1::INTEGER, 3)
 ORDER BY requests DESC, s.student_id;


-- @name: document_status
-- Extra - Document verification status per document type, with grand total.
-- Concepts: GROUP BY ROLLUP, conditional aggregation (FILTER), COALESCE.
SELECT COALESCE(doc_type, 'ALL TYPES')                     AS doc_type,
       COUNT(*)                                            AS total,
       COUNT(*) FILTER (WHERE verify_status = 'PENDING')   AS pending,
       COUNT(*) FILTER (WHERE verify_status = 'VERIFIED')  AS verified,
       COUNT(*) FILTER (WHERE verify_status = 'REJECTED')  AS rejected,
       ROUND(100.0 * COUNT(*) FILTER (WHERE verify_status = 'VERIFIED') / NULLIF(COUNT(*), 0), 1)
                                                           AS verified_pct
  FROM document
 GROUP BY ROLLUP (doc_type)
 ORDER BY GROUPING(doc_type), total DESC;
