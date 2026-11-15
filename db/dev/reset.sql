-- =====================================================================
-- DEVELOPMENT ONLY - DESTRUCTIVE.  Drops every CampusConnect object.
-- Executed only by `npm run db:reset:dev` with ALLOW_DB_RESET=yes.
-- Never run against a database that holds real data.
-- =====================================================================
DROP VIEW IF EXISTS v_student_spend, v_hostel_occupancy, v_overdue_outpass CASCADE;
DROP FUNCTION IF EXISTS sp_place_order(VARCHAR, VARCHAR, JSONB, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS fn_store_is_open(TIME, TIME, TIMESTAMPTZ) CASCADE;
-- ---------- Clean slate (safe to re-run) ----------
DROP TABLE IF EXISTS order_item, orders, menu_item, campus_store,
                     room_allocation, room, hostel,
                     document, outpass_request, admin, calendar, student CASCADE;
DROP FUNCTION IF EXISTS fn_item_changed(), fn_order_changed(),
                        fn_order_min_one_item(), fn_item_frozen(),
                        fn_alloc_occupancy() CASCADE;
DROP SCHEMA IF EXISTS app_meta CASCADE;
