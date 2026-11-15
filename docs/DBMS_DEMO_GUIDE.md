# CampusConnect: DBMS Demo Guide

A 15-minute script for the in-lab demonstration and viva. Each step lists **where to click**, **what to say**
and the **SQL to show** in a second window (`npm run db:sql`).

### Before you start (5 minutes before)

```bash
npm run db:local          # terminal 1: PostgreSQL (skip if you use your own server or Docker)
npm run dev               # terminal 2: API :4000 + web :5173
npm run db:audit          # terminal 3: all 7 audits must show 0 rows
npm run db:sql            # terminal 3: SQL console for the live checks below
```

Open two browser windows. **Student:** `DEMO2023A7PS001H` / `student@123`.
**Admin:** `admin@campusconnect.invalid` / `admin@123`.

Store hours are enforced. Check which stores show **Open now** before step 1. Late at night only Night
Canteen (20:00–03:00) is open, and that is fine to demonstrate.

---

## 1. Order placement transaction (workflow 1)

**Click:** Student → Campus Stores → pick an *Open now* store → add two items, one of them twice → Cart → **Place order**.

**Say:** "One transaction: `BEGIN; SELECT sp_place_order(student, store, items::jsonb); COMMIT`. The function
checks opening hours and availability, inserts ORDERS, then inserts each ORDER_ITEM with the current price
copied into `unit_price`. The app never calculates the total."

```sql
SELECT order_id, store_name, status, total_amount FROM orders ORDER BY order_id DESC LIMIT 1;
SELECT * FROM order_item WHERE order_id = (SELECT MAX(order_id) FROM orders);
```

Also show a **closed** store: its Add buttons are disabled. The database refuses the order on its own,
whatever the UI does:

```sql
SELECT sp_place_order('DEMO2023A7PS001H', 'Central Canteen',
       '[{"item_name":"Masala Dosa","quantity":1}]', '2026-11-16 23:30+05:30');
-- ERROR P0001: Central Canteen is closed at that time - it takes orders from 07:30 to 22:00
```

## 2. Trigger-maintained order totals

**Say:** "`trg_item` runs after every ORDER_ITEM insert, update or delete and recomputes
`orders.total_amount`. The confirmation dialog reads the total back from the database after COMMIT."

```sql
-- the audit: must return 0 rows
SELECT o.order_id FROM orders o LEFT JOIN order_item i USING (order_id)
 GROUP BY o.order_id HAVING o.total_amount <> COALESCE(SUM(i.quantity * i.unit_price), 0);
```

Price snapshot: Admin → Menu Management → change that item's price. Re-open the student's order: it keeps
the old `unit_price` and shows "now ₹…" next to it.

## 3. Student spending (`trg_order`)

**Click:** Student → My Orders. The *Database consistency check* card compares the stored spend
(`student.total_deductions_amount`, maintained by `trg_order`) with the value recomputed by `v_student_spend`.
Open the new order → **Cancel order**. The toast shows the spend before → after.

```sql
SELECT student_id, order_count, computed_spend, stored_spend, is_consistent
  FROM v_student_spend WHERE student_id = 'DEMO2023A7PS001H';
```

**Say:** "Cancelling keeps the order's own total, but `trg_order` subtracts it from the spend by a delta
update. `trg_item_frozen` now blocks any change to its items. Reinstating it (Admin → Campus Stores → Orders)
adds it back."

## 4. Hostel occupancy

**Click:** Admin → Hostels & Rooms (six hostels, gender badges, rooms in use) → Krishna → room list.

```sql
SELECT * FROM v_hostel_occupancy;
-- occupancy is a counter maintained by trg_alloc_occupancy - audit, must return 0 rows:
SELECT r.hostel_name, r.room_no FROM room r
 WHERE r.occupancy <> (SELECT COUNT(*) FROM room_allocation a WHERE a.hostel_name = r.hostel_name
                         AND a.room_no = r.room_no AND a.status = 'ACTIVE');
```

## 5. Room transfer (workflow 3, atomic)

**Click:** Admin → Room Allocation → search `Aarav` → **Transfer to another room** → pick an empty room → **Confirm transfer**.

The green **Transaction committed** panel shows both statements and the occupancy of **both** rooms before
and after.

**Say:** "`UPDATE … SET status='ENDED', end_date=…` and `INSERT … 'ACTIVE'` run in one transaction. If the
INSERT fails, the UPDATE is rolled back too. `uq_one_active_allocation` (a partial unique index) guarantees
one active room."

Then try a female hostel (Meera) for this male student: the room list offers no rooms there, and the API
refuses with an `APP_RULE` message.

```sql
SELECT * FROM room_allocation WHERE student_id = 'DEMO2023A7PS001H' ORDER BY start_date DESC;
```

## 6. Outpass approval (workflow 2)

**Click:** Student → Outpass → **New outpass**. First set the return before the departure and submit:
PostgreSQL rejects it, and the toast names `chk_outpass_window`. Fix the times and submit again.
Admin → Outpass Management → click the request → **Approve**.

**Say:** "The review is a transaction with `SELECT … FOR UPDATE`, so two wardens cannot review the same
request at once. `reviewed_by` and `reviewed_at` are written together, as `chk_outpass_reviewed` requires.
The *Overdue now* card reads the view `v_overdue_outpass`."

```sql
SELECT request_id, status, reviewed_by, reviewed_at FROM outpass_request ORDER BY request_id DESC LIMIT 3;
SELECT * FROM v_overdue_outpass;
```

## 7. SQL reports

**Click:** Admin → Reports & Analytics. Each report shows its concept tags, runs live, and offers **View SQL**.

| Show | Concept to point at |
|------|---------------------|
| Student-wise spending, with min spend 10000 | JOIN + GROUP BY + **HAVING** |
| Store-wise sales, with a date range | **CTE**, **RANK()**, SUM() OVER () share |
| Most popular menu items | **RANK() OVER (PARTITION BY store)** |
| Hostel occupancy | chained CTEs + **correlated subquery** |
| Outpass analytics | conditional aggregation, approval % |
| Customers of every store | **double NOT EXISTS** (relational division) |
| Document verification by type | **GROUP BY ROLLUP** |

All report SQL is in `db/reports.sql`. The API loads it from that file, so the code and the SQL shown in
the UI cannot drift apart.

## 8. Integrity Lab

**Click:** Admin → Integrity Lab → **Run all tests**. All 17 should show PASS.

**Say:** "Each scenario sends real SQL on its own connection inside `BEGIN … ROLLBACK`. The SQLSTATE,
constraint and message are exactly what PostgreSQL returned. The 'order with no items' scenario actually
reaches COMMIT, where the deferred constraint trigger fires and PostgreSQL rolls back by itself."

Open a few cards to show the attempted SQL. The **cross-gender** card shows the honest design point: the raw
row is *accepted* by the database (no such constraint, by assumption 3), so the rule lives in the application.

Scroll down: **Audit queries** (all 0 rows) and **Database objects**, which lists triggers, indexes and
constraints read live from `pg_catalog`.

## 9. Database constraints, live in SQL

```sql
BEGIN;
INSERT INTO room_allocation (student_id, hostel_name, room_no, start_date)
VALUES ('DEMO2023A7PS001H', 'Krishna', 'A-001', CURRENT_DATE);        -- 23505 uq_one_active_allocation
ROLLBACK;

BEGIN;
INSERT INTO orders (student_id, store_name) VALUES ('DEMO2023A7PS001H', 'Night Canteen');
COMMIT;                                                                 -- P0001 at COMMIT (deferred trigger)

INSERT INTO order_item                                                  -- 23503 composite FK (store mismatch)
SELECT order_id, 'Campus Café', 'Cappuccino', 1, 90 FROM orders
 WHERE store_name <> 'Campus Café' AND status <> 'CANCELLED' LIMIT 1;
DELETE FROM campus_store WHERE store_name = 'Central Canteen';          -- 23503: history is never cascaded away
UPDATE menu_item SET price = -1 WHERE item_name = 'Masala Dosa';        -- 23514 menu_item_price_check
```

---

### Likely viva questions

* **Why is ROOM a weak entity?** A room number such as `C-315` exists in several hostels, so it is only
  unique within its hostel. The PK is (`hostel_name`, `room_no`), and it cascades from HOSTEL.
* **Why `store_name` in ORDER_ITEM?** It is controlled redundancy. Two composite FKs force every item to
  belong to the store that received the order, declaratively and without a trigger.
* **Why deferred triggers?** The order row must exist before its items can reference it, so "at least one
  item" can only be checked once the whole transaction is done, at COMMIT.
* **Why delta updates in `trg_order`?** `total = total + x` takes a row lock, so concurrent orders serialise
  and no update is lost.
* **What is not in the database?** Authentication (an application-layer assumption), file bytes (stored on
  disk, path in DOCUMENT) and the gender-of-hostel rule (an application rule, demonstrated in the Lab).
* **A design observation we found while testing:** `reviewed_by … ON DELETE SET NULL` combined with
  `chk_outpass_reviewed` means an admin who has reviewed requests cannot be deleted (the CHECK fails).
  Changing it would mean either dropping the CHECK or making the FK restrictive. We kept the approved schema
  and documented the behaviour.
