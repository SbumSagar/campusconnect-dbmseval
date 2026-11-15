-- =====================================================================
-- CampusConnect: Student Welfare Management System
-- PostgreSQL 13+ schema (tables, constraints, indexes, triggers)
-- Run with:  psql -d campusconnect -f campusconnect_schema.sql
-- =====================================================================

-- ---------- Clean slate (safe to re-run) ----------
DROP TABLE IF EXISTS order_item, orders, menu_item, campus_store,
                     room_allocation, room, hostel,
                     document, outpass_request, admin, calendar, student CASCADE;
DROP FUNCTION IF EXISTS fn_item_changed(), fn_order_changed(),
                        fn_order_min_one_item(), fn_item_frozen(),
                        fn_alloc_occupancy() CASCADE;

-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- HOSTEL -------------------------------------------------------------
CREATE TABLE hostel (
    hostel_name  VARCHAR(100) PRIMARY KEY,
    hostel_type  VARCHAR(50)  NOT NULL,
    warden_name  VARCHAR(100),
    gender       VARCHAR(10)  NOT NULL
                 CHECK (gender IN ('MALE', 'FEMALE', 'COED'))
);

-- ROOM (weak entity of HOSTEL via HAS) -------------------------------
CREATE TABLE room (
    hostel_name  VARCHAR(100) NOT NULL
                 REFERENCES hostel (hostel_name) ON DELETE CASCADE,
    room_no      VARCHAR(10)  NOT NULL,
    floor_no     INTEGER      NOT NULL CHECK (floor_no >= 0),
    occupancy    INTEGER      NOT NULL DEFAULT 0 CHECK (occupancy >= 0),
    PRIMARY KEY (hostel_name, room_no)
);

-- STUDENT ------------------------------------------------------------
CREATE TABLE student (
    student_id               VARCHAR(20)  PRIMARY KEY,
    full_name                VARCHAR(150) NOT NULL,
    email                    VARCHAR(255) NOT NULL UNIQUE,
    phone                    VARCHAR(20),
    gender                   VARCHAR(10)
                             CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    program                  VARCHAR(100),
    -- trigger-maintained: SUM(total_amount) of non-cancelled orders
    total_deductions_amount  NUMERIC(12,2) NOT NULL DEFAULT 0
                             CHECK (total_deductions_amount >= 0)
);

-- ROOM_ALLOCATION (from M:N ASSIGNED) --------------------------------
CREATE TABLE room_allocation (
    student_id   VARCHAR(20)  NOT NULL REFERENCES student (student_id),
    hostel_name  VARCHAR(100) NOT NULL,
    room_no      VARCHAR(10)  NOT NULL,
    start_date   DATE         NOT NULL,
    end_date     DATE,
    status       VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE', 'ENDED')),
    PRIMARY KEY (student_id, hostel_name, room_no, start_date),
    FOREIGN KEY (hostel_name, room_no) REFERENCES room (hostel_name, room_no),
    CONSTRAINT chk_alloc_dates  CHECK (end_date IS NULL OR end_date >= start_date),
    -- status is ACTIVE if and only if end_date IS NULL
    CONSTRAINT chk_alloc_status CHECK ((status = 'ACTIVE') = (end_date IS NULL))
);

-- One ACTIVE allocation per student
CREATE UNIQUE INDEX uq_one_active_allocation
    ON room_allocation (student_id) WHERE status = 'ACTIVE';

-- CAMPUS_STORE -------------------------------------------------------
CREATE TABLE campus_store (
    store_name  VARCHAR(100) PRIMARY KEY,
    store_type  VARCHAR(50),
    location    VARCHAR(150),
    opens_at    TIME,
    closes_at   TIME
);

-- MENU_ITEM (weak entity of CAMPUS_STORE via OFFERS) -----------------
CREATE TABLE menu_item (
    store_name    VARCHAR(100) NOT NULL
                  REFERENCES campus_store (store_name) ON DELETE CASCADE,
    item_name     VARCHAR(100) NOT NULL,
    category      VARCHAR(50),
    price         NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    is_available  BOOLEAN       NOT NULL DEFAULT TRUE,
    PRIMARY KEY (store_name, item_name)
);

-- ORDERS -------------------------------------------------------------
CREATE TABLE orders (
    order_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id    VARCHAR(20)  NOT NULL REFERENCES student (student_id),   -- PLACES
    store_name    VARCHAR(100) NOT NULL REFERENCES campus_store (store_name), -- RECEIVES
    ordered_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status        VARCHAR(15)  NOT NULL DEFAULT 'PLACED'
                  CHECK (status IN ('PLACED', 'PREPARING', 'READY',
                                    'COMPLETED', 'CANCELLED')),
    -- trigger-maintained: SUM(quantity * unit_price) of the order's items
    total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    -- target of the composite FK from ORDER_ITEM
    CONSTRAINT uq_order_store UNIQUE (order_id, store_name)
);

-- ORDER_ITEM (from M:N CONTAINS) -------------------------------------
CREATE TABLE order_item (
    order_id    BIGINT        NOT NULL,
    store_name  VARCHAR(100)  NOT NULL,
    item_name   VARCHAR(100)  NOT NULL,
    quantity    INTEGER       NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),  -- price snapshot
    PRIMARY KEY (order_id, item_name),
    -- forces the order and its items to belong to the same store
    FOREIGN KEY (order_id, store_name)
        REFERENCES orders (order_id, store_name) ON DELETE CASCADE,
    FOREIGN KEY (store_name, item_name)
        REFERENCES menu_item (store_name, item_name)
);

-- DOCUMENT -----------------------------------------------------------
CREATE TABLE document (
    document_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id     VARCHAR(20)  NOT NULL
                   REFERENCES student (student_id) ON DELETE CASCADE,  -- UPLOADS
    doc_type       VARCHAR(50)  NOT NULL,
    file_path      VARCHAR(500) NOT NULL,
    uploaded_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    verify_status  VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
                   CHECK (verify_status IN ('PENDING', 'VERIFIED', 'REJECTED'))
);

-- ADMIN --------------------------------------------------------------
CREATE TABLE admin (
    admin_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name  VARCHAR(150) NOT NULL,
    email      VARCHAR(255) NOT NULL UNIQUE,
    role       VARCHAR(50)
);

-- OUTPASS_REQUEST ----------------------------------------------------
CREATE TABLE outpass_request (
    request_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id   VARCHAR(20) NOT NULL REFERENCES student (student_id),       -- REQUESTS
    reviewed_by  BIGINT      REFERENCES admin (admin_id) ON DELETE SET NULL, -- REVIEWS
    reason       TEXT        NOT NULL,
    out_at       TIMESTAMPTZ NOT NULL,
    return_by    TIMESTAMPTZ NOT NULL,
    returned_at  TIMESTAMPTZ,
    status       VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    reviewed_at  TIMESTAMPTZ,
    CONSTRAINT chk_outpass_window   CHECK (return_by > out_at),
    CONSTRAINT chk_outpass_returned CHECK (returned_at IS NULL OR returned_at >= out_at),
    CONSTRAINT chk_outpass_reviewed CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL))
);

-- CALENDAR (independent entity) --------------------------------------
CREATE TABLE calendar (
    title           VARCHAR(200) NOT NULL,
    event_type      VARCHAR(10)  NOT NULL
                    CHECK (event_type IN ('HOLIDAY', 'EVENT', 'EXAM')),
    description     TEXT,
    start_datetime  TIMESTAMPTZ  NOT NULL,
    end_datetime    TIMESTAMPTZ,
    PRIMARY KEY (title, start_datetime),
    CONSTRAINT chk_calendar_dates
        CHECK (end_datetime IS NULL OR end_datetime >= start_datetime)
);

-- =====================================================================
-- 2. INDEXES (on FK columns not already covered by a key)
-- =====================================================================
CREATE INDEX idx_alloc_room       ON room_allocation (hostel_name, room_no);
CREATE INDEX idx_orders_student   ON orders (student_id);
CREATE INDEX idx_orders_store     ON orders (store_name);
CREATE INDEX idx_item_menu        ON order_item (store_name, item_name);
CREATE INDEX idx_document_student ON document (student_id);
CREATE INDEX idx_outpass_student  ON outpass_request (student_id);
CREATE INDEX idx_outpass_reviewer ON outpass_request (reviewed_by);
CREATE INDEX idx_outpass_status   ON outpass_request (status);
CREATE INDEX idx_calendar_start   ON calendar (start_datetime);

-- =====================================================================
-- 3. TRIGGERS
-- =====================================================================

-- (1) ORDER_ITEM change -> recompute that order's total ---------------
CREATE FUNCTION fn_item_changed() RETURNS trigger AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE orders
           SET total_amount = (SELECT COALESCE(SUM(quantity * unit_price), 0)
                                 FROM order_item WHERE order_id = OLD.order_id)
         WHERE order_id = OLD.order_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE orders
           SET total_amount = (SELECT COALESCE(SUM(quantity * unit_price), 0)
                                 FROM order_item WHERE order_id = NEW.order_id)
         WHERE order_id = NEW.order_id;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_item
    AFTER INSERT OR UPDATE OR DELETE ON order_item
    FOR EACH ROW EXECUTE FUNCTION fn_item_changed();

-- (2) ORDERS change -> apply the difference to the student's total ----
CREATE FUNCTION fn_order_changed() RETURNS trigger AS $$
DECLARE
    old_c NUMERIC := 0;
    new_c NUMERIC := 0;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status <> 'CANCELLED' THEN
        old_c := OLD.total_amount;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status <> 'CANCELLED' THEN
        new_c := NEW.total_amount;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.student_id = NEW.student_id THEN
        UPDATE student
           SET total_deductions_amount = total_deductions_amount + (new_c - old_c)
         WHERE student_id = NEW.student_id;
    ELSE
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            UPDATE student
               SET total_deductions_amount = total_deductions_amount - old_c
             WHERE student_id = OLD.student_id;
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            UPDATE student
               SET total_deductions_amount = total_deductions_amount + new_c
             WHERE student_id = NEW.student_id;
        END IF;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order
    AFTER INSERT OR DELETE OR UPDATE OF total_amount, status, student_id ON orders
    FOR EACH ROW EXECUTE FUNCTION fn_order_changed();

-- (3) Items of a CANCELLED order are frozen ---------------------------
-- If the parent order no longer exists (ON DELETE CASCADE), the change is allowed.
CREATE FUNCTION fn_item_frozen() RETURNS trigger AS $$
DECLARE
    st VARCHAR;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT status INTO st FROM orders WHERE order_id = OLD.order_id;
        IF st = 'CANCELLED' THEN
            RAISE EXCEPTION 'Order % is cancelled; its items cannot be changed', OLD.order_id;
        END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT status INTO st FROM orders WHERE order_id = NEW.order_id;
        IF st = 'CANCELLED' THEN
            RAISE EXCEPTION 'Order % is cancelled; its items cannot be changed', NEW.order_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_item_frozen
    BEFORE INSERT OR UPDATE OR DELETE ON order_item
    FOR EACH ROW EXECUTE FUNCTION fn_item_frozen();

-- (4) An order must have at least one item (checked at COMMIT) --------
-- Insert the order and its items inside ONE transaction.
CREATE FUNCTION fn_order_min_one_item() RETURNS trigger AS $$
DECLARE
    oid BIGINT;
BEGIN
    IF TG_TABLE_NAME = 'orders' THEN
        oid := NEW.order_id;
    ELSE
        oid := OLD.order_id;
    END IF;

    -- order deleted in the same transaction: nothing to check
    IF NOT EXISTS (SELECT 1 FROM orders WHERE order_id = oid) THEN
        RETURN NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM order_item WHERE order_id = oid) THEN
        RAISE EXCEPTION 'Order % must contain at least one item', oid;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ctrg_order_has_items
    AFTER INSERT ON orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_order_min_one_item();

CREATE CONSTRAINT TRIGGER ctrg_item_delete_keeps_one
    AFTER DELETE OR UPDATE OF order_id ON order_item
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_order_min_one_item();

-- (5) Keep ROOM.occupancy = number of ACTIVE allocations -------------
CREATE FUNCTION fn_alloc_occupancy() RETURNS trigger AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE room
           SET occupancy = (SELECT COUNT(*) FROM room_allocation
                             WHERE hostel_name = OLD.hostel_name
                               AND room_no = OLD.room_no
                               AND status = 'ACTIVE')
         WHERE hostel_name = OLD.hostel_name AND room_no = OLD.room_no;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE room
           SET occupancy = (SELECT COUNT(*) FROM room_allocation
                             WHERE hostel_name = NEW.hostel_name
                               AND room_no = NEW.room_no
                               AND status = 'ACTIVE')
         WHERE hostel_name = NEW.hostel_name AND room_no = NEW.room_no;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_alloc_occupancy
    AFTER INSERT OR UPDATE OR DELETE ON room_allocation
    FOR EACH ROW EXECUTE FUNCTION fn_alloc_occupancy();

-- =====================================================================
-- 4. AUDIT QUERIES (both must return zero rows)
-- =====================================================================
-- SELECT o.order_id FROM orders o LEFT JOIN order_item i USING (order_id)
--  GROUP BY o.order_id
-- HAVING o.total_amount <> COALESCE(SUM(i.quantity * i.unit_price), 0);
--
-- SELECT s.student_id FROM student s
--   LEFT JOIN orders o ON o.student_id = s.student_id AND o.status <> 'CANCELLED'
--  GROUP BY s.student_id
-- HAVING s.total_deductions_amount <> COALESCE(SUM(o.total_amount), 0);
--
-- SELECT r.hostel_name, r.room_no FROM room r
--  WHERE r.occupancy <> (SELECT COUNT(*) FROM room_allocation a
--        WHERE a.hostel_name = r.hostel_name AND a.room_no = r.room_no
--          AND a.status = 'ACTIVE');

-- =====================================================================
-- 5. OPTIONAL: stop the app role from writing trigger-maintained columns
-- =====================================================================
-- CREATE ROLE app_user LOGIN PASSWORD 'change_me';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- REVOKE UPDATE (total_amount)             ON orders  FROM app_user;
-- REVOKE UPDATE (total_deductions_amount)  ON student FROM app_user;
-- REVOKE UPDATE (occupancy)                ON room    FROM app_user;
-- (Trigger functions then need SECURITY DEFINER, owned by the table owner.)

