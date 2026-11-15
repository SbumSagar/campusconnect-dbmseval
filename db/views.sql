-- =====================================================================
-- CampusConnect - reporting views (repeatable: CREATE OR REPLACE)
-- Applied by the migration runner after schema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- v_student_spend
-- One row per student: number of non-cancelled orders, the spend
-- recomputed from ORDERS, and the trigger-maintained stored value.
-- `is_consistent` must be TRUE for every row (audit).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_student_spend AS
SELECT s.student_id,
       s.full_name,
       s.gender,
       COUNT(o.order_id)                       AS order_count,
       COALESCE(SUM(o.total_amount), 0)::NUMERIC(12,2) AS computed_spend,
       s.total_deductions_amount               AS stored_spend,
       s.total_deductions_amount = COALESCE(SUM(o.total_amount), 0) AS is_consistent
  FROM student s
  LEFT JOIN orders o
         ON o.student_id = s.student_id
        AND o.status <> 'CANCELLED'
 GROUP BY s.student_id, s.full_name, s.gender, s.total_deductions_amount;

-- ---------------------------------------------------------------------
-- v_hostel_occupancy
-- Per hostel: rooms, rooms in use, empty rooms, residents (sum of the
-- trigger-maintained ROOM.occupancy) and average residents per room.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_hostel_occupancy AS
SELECT h.hostel_name,
       h.hostel_type,
       h.gender,
       h.warden_name,
       COUNT(r.room_no)                                   AS total_rooms,
       COUNT(r.room_no) FILTER (WHERE r.occupancy > 0)    AS occupied_rooms,
       COUNT(r.room_no) FILTER (WHERE r.occupancy = 0)    AS empty_rooms,
       COALESCE(SUM(r.occupancy), 0)::INTEGER             AS residents,
       COALESCE(MAX(r.occupancy), 0)                      AS max_room_occupancy,
       ROUND(COALESCE(AVG(r.occupancy), 0), 2)            AS avg_per_room
  FROM hostel h
  LEFT JOIN room r ON r.hostel_name = h.hostel_name
 GROUP BY h.hostel_name, h.hostel_type, h.gender, h.warden_name;

-- ---------------------------------------------------------------------
-- v_overdue_outpass
-- APPROVED outpasses whose student has not returned and whose
-- return_by deadline has passed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_overdue_outpass AS
SELECT o.request_id,
       o.student_id,
       s.full_name,
       o.reason,
       o.out_at,
       o.return_by,
       o.reviewed_by,
       a.full_name                                     AS reviewed_by_name,
       now() - o.return_by                             AS overdue_by,
       ROUND(EXTRACT(EPOCH FROM (now() - o.return_by)) / 3600.0, 1) AS hours_overdue
  FROM outpass_request o
  JOIN student s     ON s.student_id = o.student_id
  LEFT JOIN admin a  ON a.admin_id   = o.reviewed_by
 WHERE o.status = 'APPROVED'
   AND o.returned_at IS NULL
   AND o.return_by < now();
