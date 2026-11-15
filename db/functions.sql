-- =====================================================================
-- CampusConnect - stored functions (repeatable: CREATE OR REPLACE)
-- =====================================================================

-- ---------------------------------------------------------------------
-- fn_store_is_open(opens_at, closes_at [, at])
-- Is a store open at the given instant?  Hours are campus local time
-- (Asia/Kolkata).  Handles stores that close after midnight
-- (e.g. 20:00 - 03:00).  NULL hours or opens = closes mean "always open".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_store_is_open(
    p_opens   TIME,
    p_closes  TIME,
    p_at      TIMESTAMPTZ DEFAULT now()
) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT CASE
             WHEN p_opens IS NULL OR p_closes IS NULL OR p_opens = p_closes THEN TRUE
             WHEN p_opens < p_closes THEN
                  (p_at AT TIME ZONE 'Asia/Kolkata')::TIME >= p_opens
              AND (p_at AT TIME ZONE 'Asia/Kolkata')::TIME <  p_closes
             ELSE (p_at AT TIME ZONE 'Asia/Kolkata')::TIME >= p_opens
               OR (p_at AT TIME ZONE 'Asia/Kolkata')::TIME <  p_closes
           END
$$;

COMMENT ON FUNCTION fn_store_is_open(TIME, TIME, TIMESTAMPTZ) IS
  'TRUE when a store with these opening hours is open at the instant (campus time, overnight hours supported).';

-- ---------------------------------------------------------------------
-- sp_place_order(student_id, store_name, items JSONB [, ordered_at])
--
-- Places a multi-item order in ONE call:
--   0. refuses the order when the store is closed at ordered_at
--      (fn_store_is_open, campus time);
--   1. validates that every requested item is offered by the store and
--      is currently available (the schema does not model availability
--      as a constraint, so this is the function's rule);
--   2. inserts the ORDERS row;
--   3. inserts every ORDER_ITEM row with unit_price = current menu price
--      (the price SNAPSHOT - later menu changes never alter the order).
--
-- It does NOT compute totals: trg_item maintains ORDERS.total_amount and
-- trg_order maintains STUDENT.total_deductions_amount.  The deferred
-- constraint trigger ctrg_order_has_items is checked when the caller's
-- transaction COMMITs, so call it inside BEGIN ... COMMIT.
--
-- p_items example: [{"item_name": "Masala Dosa", "quantity": 2},
--                   {"item_name": "Filter Coffee", "quantity": 1}]
-- Duplicate item names are merged (quantities summed) so the
-- (order_id, item_name) primary key is respected.
-- Quantities <= 0 are rejected by CHECK (quantity > 0) on ORDER_ITEM.
-- p_ordered_at is used only by the seed script to back-date history.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_place_order(
    p_student_id  VARCHAR,
    p_store_name  VARCHAR,
    p_items       JSONB,
    p_ordered_at  TIMESTAMPTZ DEFAULT now()
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_order_id  BIGINT;
    v_bad       TEXT;
    v_opens     TIME;
    v_closes    TIME;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'An order must contain at least one item'
              USING HINT = 'Pass a non-empty JSON array of {item_name, quantity}';
    END IF;

    -- Opening hours (FOR SHARE: hours cannot change under a running order)
    SELECT opens_at, closes_at INTO v_opens, v_closes
      FROM campus_store WHERE store_name = p_store_name
       FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store "%" does not exist', p_store_name;
    END IF;
    IF NOT fn_store_is_open(v_opens, v_closes, COALESCE(p_ordered_at, now())) THEN
        RAISE EXCEPTION '% is closed at that time - it takes orders from % to % (campus time)',
              p_store_name, to_char(v_opens, 'HH24:MI'), to_char(v_closes, 'HH24:MI')
              USING HINT = 'Orders are accepted only during the store''s opening hours';
    END IF;

    -- Lock the referenced menu rows so a concurrent price change cannot
    -- slip in between validation and the price snapshot.
    PERFORM 1
       FROM menu_item m
      WHERE m.store_name = p_store_name
        AND m.item_name IN (SELECT r.item_name
                              FROM jsonb_to_recordset(p_items) AS r(item_name VARCHAR))
        FOR SHARE;

    SELECT string_agg(DISTINCT r.item_name, ', ')
      INTO v_bad
      FROM jsonb_to_recordset(p_items) AS r(item_name VARCHAR, quantity INTEGER)
      LEFT JOIN menu_item m
             ON m.store_name = p_store_name AND m.item_name = r.item_name
     WHERE m.item_name IS NULL OR NOT m.is_available;

    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'Not available at %: %', p_store_name, v_bad
              USING HINT = 'Every item must be offered by the store that receives the order and be available';
    END IF;

    INSERT INTO orders (student_id, store_name, ordered_at)
    VALUES (p_student_id, p_store_name, COALESCE(p_ordered_at, now()))
    RETURNING order_id INTO v_order_id;

    INSERT INTO order_item (order_id, store_name, item_name, quantity, unit_price)
    SELECT v_order_id, p_store_name, r.item_name, SUM(r.quantity), m.price
      FROM jsonb_to_recordset(p_items) AS r(item_name VARCHAR, quantity INTEGER)
      JOIN menu_item m
        ON m.store_name = p_store_name AND m.item_name = r.item_name
     GROUP BY r.item_name, m.price;

    RETURN v_order_id;
END $$;

COMMENT ON FUNCTION sp_place_order(VARCHAR, VARCHAR, JSONB, TIMESTAMPTZ) IS
  'Inserts an order and its items (JSONB) in one call; totals are trigger-maintained; ≥1 item checked at COMMIT.';
