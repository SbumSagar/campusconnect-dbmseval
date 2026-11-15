import { query } from '../db/pool.js';

/** Every number on the admin dashboard comes from these SQL queries. */
export async function adminDashboard() {
  const [totals, hostels, ordersDaily, stores, outpassStatus, upcoming, recentOrders, pendingOutpasses] = await Promise.all([
    query(`
      SELECT
        (SELECT COUNT(*) FROM student)                                         AS students,
        (SELECT COUNT(*) FROM student WHERE gender = 'MALE')                   AS male_students,
        (SELECT COUNT(*) FROM student WHERE gender = 'FEMALE')                 AS female_students,
        (SELECT COUNT(*) FROM hostel)                                          AS hostels,
        (SELECT COUNT(*) FROM room)                                            AS rooms,
        (SELECT COUNT(*) FROM room WHERE occupancy > 0)                        AS occupied_rooms,
        (SELECT COUNT(*) FROM room_allocation WHERE status = 'ACTIVE')         AS active_allocations,
        (SELECT COUNT(*) FROM student s WHERE NOT EXISTS
            (SELECT 1 FROM room_allocation a WHERE a.student_id = s.student_id AND a.status = 'ACTIVE')) AS unallocated_students,
        (SELECT COUNT(*) FROM orders)                                          AS orders,
        (SELECT COUNT(*) FROM orders WHERE status IN ('PLACED','PREPARING','READY')) AS open_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status <> 'CANCELLED') AS sales,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders
          WHERE status <> 'CANCELLED' AND ordered_at >= now() - interval '7 days') AS sales_7d,
        (SELECT COUNT(*) FROM outpass_request WHERE status = 'PENDING')        AS outpass_pending,
        (SELECT COUNT(*) FROM outpass_request WHERE status = 'APPROVED')       AS outpass_approved,
        (SELECT COUNT(*) FROM outpass_request WHERE status = 'REJECTED')       AS outpass_rejected,
        (SELECT COUNT(*) FROM v_overdue_outpass)                               AS outpass_overdue,
        (SELECT COUNT(*) FROM document WHERE verify_status = 'PENDING')        AS documents_pending,
        (SELECT COUNT(*) FROM document)                                        AS documents,
        (SELECT COUNT(*) FROM calendar WHERE start_datetime >= now())          AS upcoming_events`),
    query(`SELECT hostel_name, gender, total_rooms, occupied_rooms, empty_rooms, residents, avg_per_room
             FROM v_hostel_occupancy ORDER BY gender DESC, hostel_name`),
    query(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
                  COUNT(o.order_id) FILTER (WHERE o.status <> 'CANCELLED')::int AS orders,
                  COALESCE(SUM(o.total_amount) FILTER (WHERE o.status <> 'CANCELLED'), 0) AS revenue
             FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') AS d
             LEFT JOIN orders o ON o.ordered_at >= d AND o.ordered_at < d + interval '1 day'
            GROUP BY d ORDER BY d`),
    query(`SELECT cs.store_name,
                  COALESCE(SUM(o.total_amount) FILTER (WHERE o.status <> 'CANCELLED'), 0) AS revenue,
                  COUNT(o.order_id) FILTER (WHERE o.status <> 'CANCELLED')::int AS orders
             FROM campus_store cs LEFT JOIN orders o ON o.store_name = cs.store_name
            GROUP BY cs.store_name ORDER BY revenue DESC`),
    query(`SELECT status, COUNT(*)::int AS count FROM outpass_request GROUP BY status ORDER BY status`),
    query(`SELECT title, event_type, description, start_datetime, end_datetime FROM calendar
            WHERE COALESCE(end_datetime, start_datetime) >= now() ORDER BY start_datetime LIMIT 6`),
    query(`SELECT o.order_id, o.student_id, s.full_name AS student_name, o.store_name, o.ordered_at, o.status, o.total_amount
             FROM orders o JOIN student s USING (student_id) ORDER BY o.ordered_at DESC LIMIT 6`),
    query(`SELECT o.request_id, o.student_id, s.full_name AS student_name, o.reason, o.out_at, o.return_by
             FROM outpass_request o JOIN student s USING (student_id)
            WHERE o.status = 'PENDING' ORDER BY o.out_at LIMIT 5`),
  ]);
  return {
    totals: totals.rows[0],
    hostels: hostels.rows,
    ordersDaily: ordersDaily.rows,
    stores: stores.rows,
    outpassStatus: outpassStatus.rows,
    upcoming: upcoming.rows,
    recentOrders: recentOrders.rows,
    pendingOutpasses: pendingOutpasses.rows,
  };
}
