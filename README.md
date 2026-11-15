# CampusConnect – Student Welfare Management System

**Group 15 · DBMS Course Project (final submission)**

CampusConnect is a database-centred campus welfare portal modelled on the BITS Student Welfare Division
portal. Students view their hostel room, order from campus stores, request outpasses, upload documents and
follow the academic calendar. Wardens and SWD staff manage rooms, approve outpasses, verify documents, run
the stores and read SQL reports.

The core of the project is the relational design. Business rules are enforced by **PostgreSQL**: keys, `CHECK`
constraints, a partial unique index, composite foreign keys and triggers. The application only passes the
database's verdict (SQLSTATE and constraint name) back to the user.

```
React (Vite, TypeScript, Tailwind)  ⇄  Express REST API (TypeScript, node-postgres)  ⇄  PostgreSQL 13+
```

---

## Team

| Name | Student ID | Contribution |
|------|-----------|--------------|
| Shubham Sagar | 2024A3PS0394H | Requirements analysis, problem statement, assumptions and business rules |
| Jay Kimtani | 2024A3PS0392H | ER diagram (Chen notation) and ER-to-relational mapping |
| Sai Gautam Reddy | 2024A3PS0429H | Relational schema DDL: keys, data types, CHECK / UNIQUE constraints |
| Krishna Gupta | 2024A3PS0380H | Triggers, indexes and audit queries |
| Sreejith Gundla | 2024A3PS0427H | Normalization and design justification, application design, README, GitHub repo |

> Update the contribution column with each member's work on the final application before you submit.

---

## Contents

1. [Features](#features)
2. [Technology stack](#technology-stack)
3. [Database architecture](#database-architecture)
4. [Quick start (exact commands)](#quick-start)
5. [Environment configuration](#environment-configuration)
6. [Student data import](#student-data-import)
7. [Sample data generation](#sample-data-generation)
8. [Demo login credentials](#demo-login-credentials)
9. [Major workflows](#major-workflows)
10. [Database features](#database-features)
11. [SQL reports](#sql-reports)
12. [Integrity Lab](#integrity-lab)
13. [API reference](#api-reference)
14. [Testing](#testing)
15. [Repository layout](#repository-layout)
16. [Limitations](#limitations)
17. [Live demonstration](#live-demonstration)

---

## Features

**Student portal**: dashboard (room, spend, pending outpasses, document summary, upcoming events);
current room, room-mates and full stay history; campus store browsing with search, category filters and a
one-store cart; **opening hours enforced** (closed stores cannot take orders); order placement, detail and cancellation; spend summary with a live consistency check;
outpass request, tracking, cancellation and return recording; document upload with progress, verification
status, view/download and withdrawal; monthly and list calendar with type and date filters; profile.

**Admin portal**: live dashboard (students, rooms, occupancy, sales, outpasses, overdue returns, documents,
events). Student directory with search, filters, sort and pagination over 4,663 students, plus a detail page
and create/edit/delete. Hostels and rooms: create, edit and delete rooms and view room history. Room
allocation: allocate, an atomic transfer, vacate. Outpass review queue with approve/reject, return recording
and overdue list. Document verification with an inline preview. Stores, order status management with
reinstate, menu management with availability toggles, calendar management, **13 SQL reports** with charts
and CSV export, and the **Database Integrity Lab**.

---

## Technology stack

| Layer | Technology |
|-------|------------|
| Database | PostgreSQL 13+ (developed and tested on PostgreSQL 18) |
| Backend | Node.js 20+, Express 5, TypeScript, `pg` (node-postgres), zod, jsonwebtoken, bcryptjs, multer, helmet |
| Frontend | React 18, Vite 6, TypeScript, Tailwind CSS 4, React Router 7, TanStack Query, Recharts, lucide icons |
| Tests | Vitest, Supertest, Testing Library, playwright-core (browser E2E) |
| Local DB helper | `embedded-postgres` (official PostgreSQL binaries via npm) or Docker Compose |

---

## Database architecture

The design document is [docs/CampusConnect_Database_Design.pdf](docs/CampusConnect_Database_Design.pdf):
the Chen ER diagram is on page 2, the relational schema on page 3 and the integrity constraints on page 4.
The implementation follows it exactly. **There are 12 relations and no extra domain tables.**

| Relation | Kind | Key | Notes |
|----------|------|-----|-------|
| `hostel` | strong | `hostel_name` | gender MALE / FEMALE / COED |
| `room` | weak (HAS) | (`hostel_name`, `room_no`) | `occupancy` maintained by trigger |
| `student` | strong | `student_id` | UNIQUE email; `total_deductions_amount` maintained by trigger |
| `room_allocation` | M:N ASSIGNED | (`student_id`, `hostel_name`, `room_no`, `start_date`) | partial unique index: one ACTIVE per student |
| `campus_store` | strong | `store_name` | |
| `menu_item` | weak (OFFERS) | (`store_name`, `item_name`) | |
| `orders` | strong | `order_id` (identity) | UNIQUE (`order_id`, `store_name`) is the target of the composite FK |
| `order_item` | M:N CONTAINS | (`order_id`, `item_name`) | two composite FKs: items must belong to the order's store |
| `document` | strong | `document_id` | file stored on disk, path in the database |
| `admin` | strong | `admin_id` | UNIQUE email |
| `outpass_request` | strong | `request_id` | REQUESTS (student), REVIEWS (admin, nullable) |
| `calendar` | independent | (`title`, `start_datetime`) | no relationships |

Database scripts:

| File | Purpose |
|------|---------|
| [db/schema.sql](db/schema.sql) | The approved mid-sem schema, **unchanged** (tables, constraints, 10 indexes, 6 triggers). Only its destructive `DROP` block was moved out. |
| [db/views.sql](db/views.sql) | `v_student_spend`, `v_hostel_occupancy`, `v_overdue_outpass` |
| [db/functions.sql](db/functions.sql) | `sp_place_order(student, store, items JSONB)` |
| [db/reports.sql](db/reports.sql) | All report queries; the API reads them from this file |
| [db/audit.sql](db/audit.sql) | 7 audit queries, each of which must return zero rows |
| [db/dev/reset.sql](db/dev/reset.sql) | **Development only**: drops everything |
| [db/original/schema_midsem.sql](db/original/schema_midsem.sql) | Verbatim copy of the submitted mid-sem script |

---

## Quick start

Prerequisites: **Node.js 20+** and npm. PostgreSQL is optional, because the project can start one for you.

```bash
# 1. install all workspaces (db, backend, frontend)
npm install

# 2. configure
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
#    then set JWT_SECRET in .env, for example to the output of:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. start PostgreSQL (leave this terminal open)
npm run db:local                # real PostgreSQL on localhost:54329, data in ./.pgdata
#   or:  docker compose up -d
#   or:  use your own PostgreSQL 13+ and point DATABASE_URL at it

# 4. in a second terminal: create the schema, import the roster, generate demo data
npm run db:setup                # = db:migrate + db:import + db:seed
npm run db:audit                # every audit must report 0 rows

# 5. run the app (API on :4000, web on :5173)
npm run dev
```

Open **http://localhost:5173** and sign in with a [demo account](#demo-login-credentials).

**Production-style run** (one server on one port): `npm run build` and then, with `NODE_ENV=production`
in `.env`, `npm start`. Express then serves the built React app from `frontend/dist` on `PORT`.

**Safety:** `db:migrate` never drops anything. It records applied files in `app_meta.schema_migrations` and
detects a database created earlier with the mid-sem script. Seeding is idempotent. The only destructive
command is `npm run db:reset:dev`, which refuses to run unless `.env` contains `ALLOW_DB_RESET=yes`.

---

## Environment configuration

All settings live in one root `.env` file, documented in [.env.example](.env.example). Never commit it.

| Variable | Meaning |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string used by the API and the scripts |
| `TEST_DATABASE_URL` | Database used by the automated tests. It is **dropped and rebuilt**, so its name must end in `_test`. |
| `PORT`, `CLIENT_ORIGIN`, `NODE_ENV` | API port, allowed browser origin, environment |
| `JWT_SECRET`, `SESSION_TTL` | Session signing key (at least 32 characters) and lifetime |
| `DEMO_STUDENT_PASSWORD`, `DEMO_ADMIN_PASSWORD` | Demo passwords (or `*_HASH` with bcrypt hashes) |
| `DEMO_STUDENT_PREFIXES` | Student ID prefixes allowed to sign in (default `DEMO`) |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | Where uploaded documents are stored, and the maximum file size |

The API refuses to start, with a clear message, if `DATABASE_URL` is missing, `JWT_SECRET` is missing,
too short or still the placeholder, a demo password is missing, or the database has not been migrated.

---

## Student data import

`npm run db:import` reads `db/seed/data/on_campus_list.xlsx` (copied from `ON CAMPUS LIST - 23.09.2026.xlsx`).

| Spreadsheet column | Database |
|--------------------|----------|
| Campus ID | `student.student_id` |
| Name | `student.full_name` |
| Sex = M / F | `student.gender` = MALE / FEMALE |
| ID (first column) | not in the approved schema, so it is preserved in `db/seed/output/student_import_audit.csv` |

* **4,651 valid students** are imported (3,732 male, 919 female). Skipped rows: 9 empty rows and the
  repeated header row at the end. Every skipped row and its reason is written to the audit CSV.
* Campus IDs are validated loosely (alphanumeric, at most 20 characters), so IDs with uncommon suffixes
  (`…P`, `…U`, `…G`, `…D`) are kept. Duplicate IDs would be skipped.
* E-mails are generated on the reserved, undeliverable `.invalid` domain. `phone` and `program` stay NULL.
* The import is idempotent (`ON CONFLICT DO NOTHING`).
* Privacy: the roster contains real names. It is visible only to signed-in admins; roster students get no
  login and no fabricated transactions. Decide as a team whether the spreadsheet belongs in a public repository.

---

## Sample data generation

`npm run db:seed` builds a **reproducible** dataset. It uses a fixed PRNG seed and runs in one transaction.

* **6 hostels**: Krishna, Ram, Valmiki and Vishwakarma (MALE); Malviya and Meera (FEMALE).
* **2,600 rooms**: male hostels have 4 wings × 5 floors × 26 rooms, female hostels 2 wings.
  Room numbers look like `C-315` (wing C, floor 3, room 15).
* **Gender-correct ACTIVE allocations for every student**, round-robin across that gender's hostels
  (935 / 935 / 935 / 934 male and 462 / 462 female), with at most two students per room. **688 historical
  (ENDED) stays** are added for senior students. `ROOM.occupancy` is filled by the trigger, never by the script.
* 10 admins, 8 campus stores, 80 menu items (two of them unavailable), and 33 calendar entries
  (holidays, events, exams for 2026-27).
* **12 synthetic `DEMO…` student accounts** hold all transactions. Orders are placed through `sp_place_order`,
  so the triggers compute every total. The seed creates about 340 orders and 830 order items, 77 outpasses
  covering every status (including overdue and late returns), and 39 documents with real sample PDF files.

In total there are more than 14,000 rows. Transaction timestamps are relative to the day the seed runs,
so pending, upcoming and overdue cases make sense on demo day.

---

## Demo login credentials

These are demonstration credentials and are **not production-grade** (see [Limitations](#limitations)).
Passwords come from `.env`.

| Role | Sign in with | Password (default `.env`) |
|------|--------------|---------------------------|
| Student | `DEMO2023A7PS001H` (Aarav Mehta, Krishna) | `student@123` |
| Student | `DEMO2023B3PS002H` (Ananya Iyer, female hostel) | `student@123` |
| Student | any `DEMO…` ID listed on the login page | `student@123` |
| Admin | `admin@campusconnect.invalid` (SWD Office) | `admin@123` |
| Admin | `chief.warden@campusconnect.invalid`, `warden.krishna@campusconnect.invalid`, … | `admin@123` |

The login page lists the demo identities (IDs only) and fills them in with one click.

---

## Major workflows

1. **Place / cancel an order (transaction and triggers).** Cart → `POST /api/orders` → `BEGIN;
   SELECT sp_place_order(...); COMMIT`. The function inserts ORDERS and every ORDER_ITEM with a
   `unit_price` snapshot. `trg_item` sets `orders.total_amount`, `trg_order` adds it to
   `student.total_deductions_amount`, and the deferred `ctrg_order_has_items` checks "at least one item"
   at COMMIT. Cancelling sets `status = 'CANCELLED'`; `trg_order` removes the order from the spend and
   `trg_item_frozen` freezes its items.
2. **Outpass lifecycle and reports.** The student requests (the `CHECK` constraints guard the time window),
   the admin reviews in a transaction (`SELECT … FOR UPDATE`, then `reviewed_by` and `reviewed_at` set
   together), and the student or admin records the return (`chk_outpass_returned`).
   `v_overdue_outpass` and the analytics reports summarise all of it.
3. **Room allocation and Integrity Lab.** A transfer runs as one transaction (end the ACTIVE stay, insert
   the new one). `trg_alloc_occupancy` updates both rooms; `uq_one_active_allocation` guarantees one active
   room per student. The Integrity Lab runs invalid operations and shows PostgreSQL rejecting each one.

---

## Database features

| Feature | Objects |
|---------|---------|
| Constraints | 12 PKs (5 composite), 3 UNIQUE + partial unique index, 11 FKs (3 composite), domain and multi-column `CHECK`s |
| Triggers (6) | `trg_item`, `trg_order`, `trg_item_frozen`, `ctrg_order_has_items`, `ctrg_item_delete_keeps_one` (both deferred), `trg_alloc_occupancy` |
| Indexes (10) | `uq_one_active_allocation`, `idx_alloc_room`, `idx_orders_student`, `idx_orders_store`, `idx_item_menu`, `idx_document_student`, `idx_outpass_student`, `idx_outpass_reviewer`, `idx_outpass_status`, `idx_calendar_start` |
| Views (3) | `v_student_spend`, `v_hostel_occupancy`, `v_overdue_outpass` |
| Stored functions | `sp_place_order` (JSONB items, **opening hours**, availability check, row locks, price snapshot); `fn_store_is_open` (campus-time opening hours, overnight stores) |
| Transactions | order placement, order cancel / status change, room allocate / transfer / vacate, outpass review |
| Error translation | SQLSTATE `23505`, `23503`, `23514`, `23502`, `P0001` mapped to readable messages; the constraint name and SQLSTATE are shown in the UI |

Application rules that the schema deliberately leaves out are enforced by the API and reported as
`APP_RULE` (HTTP 422):

* no cross-gender hostel allocation (design assumption 3);
* an outpass must be requested before departure (15-minute grace), and an expired request can only be rejected;
* order status changes follow PLACED → PREPARING → READY → COMPLETED, an order can be cancelled before
  completion, and a cancelled order can be reinstated;
* students can cancel only PLACED or PREPARING orders.

---

## SQL reports

All SQL is in [db/reports.sql](db/reports.sql). **Reports & Analytics** (admin) runs it live, with parameters,
a chart, the result table, the query text and CSV export.

| # | Report | SQL concepts |
|---|--------|--------------|
| 1 | Student-wise spending | 3-table JOIN, GROUP BY, FILTER, **HAVING** |
| 2 | Store-wise sales (top store flagged) | **CTE**, LEFT JOIN, AVG / COUNT DISTINCT, **RANK()**, SUM() OVER () |
| 3 | Most popular menu items | JOIN on composite keys, **RANK() OVER (PARTITION BY)**, DENSE_RANK() |
| 4 | Hostel occupancy | chained **CTEs**, **correlated subquery**, window SUM() OVER (PARTITION BY) |
| 5 | Outpass analytics | CTE, conditional aggregation, date arithmetic, approval percentage, overdue |
| 5b | Outpasses per month | date_trunc, running total window |
| 6 | Monthly revenue trend | CTE, SUM() OVER (ORDER BY), **LAG()** |
| 7 | Above their hostel's average | **correlated subquery** |
| 8 | Customers of every store | **double NOT EXISTS** (relational division) |
| 9 | Never-sold menu items | **nested query**, NOT IN on a row value |
| 10 | Items above store average price | derived table in FROM |
| 11 | Frequent outpass requesters | GROUP BY … **HAVING** |
| 12 | Document verification by type | **GROUP BY ROLLUP**, GROUPING() |

---

## Integrity Lab

Admin → **Integrity Lab** runs 17 scenarios with real SQL on a dedicated connection inside
`BEGIN … ROLLBACK`, so nothing persists. The "order with no items" scenario must actually reach `COMMIT`,
and PostgreSQL rolls that one back itself. For each scenario the Lab shows the operation attempted, the
expected result, the actual result, the SQLSTATE, the constraint or trigger, and pass/fail.

| Scenario | Enforced by | Result |
|----------|-------------|--------|
| One student in two ACTIVE rooms | `uq_one_active_allocation` | 23505 |
| Male student → female hostel | application rule (the raw SQL is shown being *accepted* by the DB, then rolled back) | APP_RULE |
| Item from another store | composite FK `order_item_order_id_store_name_fkey` | 23503 |
| Order at a closed store | `sp_place_order` → `fn_store_is_open` | P0001 |
| Order with no items (at COMMIT) | deferred `ctrg_order_has_items` | P0001 |
| Delete every item of an order | deferred `ctrg_item_delete_keeps_one` | P0001 |
| Modify an item of a CANCELLED order | `trg_item_frozen` | P0001 |
| Return before departure | `chk_outpass_window` | 23514 |
| `returned_at` before `out_at` | `chk_outpass_returned` | 23514 |
| Duplicate student e-mail | `student_email_key` | 23505 |
| `reviewed_by` without `reviewed_at` | `chk_outpass_reviewed` | 23514 |
| ENDED allocation without end date | `chk_alloc_status` | 23514 |
| Negative price | `menu_item_price_check` | 23514 |
| Delete a store with order history | restrictive FK | 23503 |
| Price change keeps old order prices | `unit_price` snapshot | behaviour |
| Transfer updates both occupancies | `trg_alloc_occupancy` | behaviour |
| Cancel reduces the student's spend | `trg_order` | behaviour |

The page also runs the [audit queries](db/audit.sql) and lists the live triggers, indexes, constraints,
views and functions read from `pg_catalog`.

---

## API reference

All routes are under `/api`. JSON in and out. The session is an httpOnly cookie. Roles: **S** = student,
**A** = admin, **any** = either. Lists accept `page` and `pageSize`.

| Method & path | Role | Purpose |
|---------------|------|---------|
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `GET /auth/demo-accounts` | public / any | Session |
| `GET /students/me` · `/me/dashboard` · `/me/allocations` · `/me/spend` · `PATCH /students/me` | S | Own profile, dashboard, stays, spend, phone |
| `GET /students?q&gender&hostel&allocated&sort` · `POST /students` · `GET/PATCH/DELETE /students/:id` | A | Student directory |
| `GET /hostels` · `GET/PATCH /hostels/:name` | any / A | Hostels (from `v_hostel_occupancy`) |
| `GET /rooms?hostel&floor&q&occupancy` · `GET /rooms/available?student` · `POST /rooms` · `GET/PATCH/DELETE /rooms/:hostel/:room` | A | Rooms |
| `POST /allocations` · `POST /allocations/transfer` · `POST /allocations/vacate` · `GET /allocations/recent` · `GET /allocations/student/:id` | A | Allocate / transfer / vacate |
| `GET /stores` · `GET /stores/:store` · `POST /stores` · `PUT/DELETE /stores/:store` | any / A | Stores |
| `GET /menu?store&q&category&available&sort` · `GET /menu/categories` · `POST /menu/:store` · `PATCH/DELETE /menu/:store/:item` | any / A | Menu |
| `POST /orders` · `POST /orders/:id/cancel` | S | Place / cancel |
| `GET /orders?status&store&q&from&to` · `GET /orders/:id` | any (students see only their own) | History / detail |
| `PATCH /orders/:id/status` | A | Status, cancel, reinstate |
| `POST /outpasses` · `POST /outpasses/:id/cancel` | S | Request / cancel |
| `GET /outpasses?status&q&from&to&overdue` · `GET /outpasses/summary` · `GET /outpasses/:id` · `POST /outpasses/:id/return` | any (own rows for S) | List / detail / return |
| `POST /outpasses/:id/review` · `GET /outpasses/overdue` | A | Approve / reject, overdue view |
| `POST /documents` (multipart `file`, `doc_type`) · `DELETE /documents/:id` | S | Upload / withdraw pending |
| `GET /documents?status&type&q` · `GET /documents/summary` · `GET /documents/:id/file` | any (own rows for S) | List / download |
| `PATCH /documents/:id/status` · `GET /documents/types` | A / any | Verify / reject |
| `GET /calendar?from&to&type&q` · `POST /calendar` · `PUT/DELETE /calendar/entry?title&start` | any / A | Calendar (composite key in the query) |
| `GET /admin/dashboard` | A | Dashboard figures |
| `GET /reports` · `GET /reports/:key?params` | A | Reports |
| `GET /integrity/tests` · `POST /integrity/tests/:key/run` · `POST /integrity/tests/run-all` · `GET /integrity/audits` · `GET /integrity/catalog` | A | Integrity Lab |
| `GET /health` | public | Database connectivity |

Errors use the shape `{ "error": { "code", "message", "details": { "sqlstate", "constraint", "detail" } } }`
with status 400 (validation), 401, 403, 404, 409 (unique / FK / state conflict) or 422 (`CHECK`, trigger,
application rule).

---

## Testing

PostgreSQL must be running, `TEST_DATABASE_URL` must be set, and its name must end in `_test`.

```bash
npm run test:db         # 51 database tests: schema, constraints, triggers, deferred checks, opening hours, views, sp_place_order, import, seed, audits
npm run test:backend    # 54 API tests: auth, authorization, every workflow, application rules, uploads, reports, Integrity Lab
npm run test:frontend   # 16 unit/component tests: cart rules, formatting, login flow, UI kit
npm test                # all three suites

# Browser end-to-end check of the main workflows (needs `npm run dev` running and Chrome or Edge installed):
npm run test:e2e --workspace frontend   # 12 checks; creates a few rows for DEMO accounts in the dev DB
```

The database and API suites rebuild the test database from scratch (migrate → import → seed) before
they run. The suites check, among other things:

* order placement updates `orders.total_amount` and `student.total_deductions_amount`;
* cancelling reduces the spend, and reinstating restores it;
* menu price changes leave historical `unit_price` and totals untouched;
* allocation and transfer update `room.occupancy` for both rooms, and a failed transfer rolls back completely;
* a second ACTIVE allocation is rejected;
* items of cancelled orders are frozen;
* an order cannot be committed without items;
* orders are refused while a store is closed;
* every audit query returns zero rows, before and after the full API suite.

---

## Repository layout

```
├── backend/                 Express API (TypeScript)
│   ├── src/config           environment validation (fails fast)
│   ├── src/db               pg pool, transactions, named-SQL loader
│   ├── src/middleware       auth (JWT cookie, roles), uploads, error translation
│   ├── src/routes           REST routes (validation + authorization)
│   ├── src/services         SQL for each domain area, transactions, reports, Integrity Lab
│   └── tests                API integration tests
├── frontend/                React app (Vite, Tailwind)
│   ├── src/components       UI kit, charts, calendar
│   ├── src/pages/{auth,student,admin,shared}
│   ├── src/services         typed API client
│   ├── src/test             unit / component tests
│   └── e2e                  browser workflow check
├── db/
│   ├── schema.sql  views.sql  functions.sql  reports.sql  audit.sql
│   ├── migrations/          versioned migrations (see README there)
│   ├── seed/                import_students.ts, seed.ts, data/on_campus_list.xlsx
│   ├── lib/                 migration runner, importer, seeder, test-db helper
│   ├── scripts/             migrate, local PostgreSQL, audit, dev reset
│   ├── dev/reset.sql        DEVELOPMENT ONLY
│   └── tests/               database tests
├── docs/                    design document, DBMS demo guide
├── uploads/                 uploaded documents (git-ignored)
├── .env.example  docker-compose.yml  package.json
```

---

## Limitations

* **Authentication is for demonstration only.** It uses one shared password per role from `.env`, and no
  credential tables exist, because the design leaves authentication to the application layer. Only `DEMO…`
  students may sign in. There is no password reset, MFA or CSRF token (cookies are `SameSite=Lax`).
* Room capacity is not modelled (design assumption), so the room chooser shows occupancy but does not cap it.
* `DOCUMENT` has no column for a rejection reason, so students see only the REJECTED status.
* Payments and wallets are out of scope. "Spend" means cumulative non-cancelled orders.
* Design observation: `outpass_request.reviewed_by` is `ON DELETE SET NULL`, but `chk_outpass_reviewed`
  requires `reviewed_by` and `reviewed_at` to be set together. Deleting an admin who reviewed requests is
  therefore rejected by PostgreSQL. This is documented and tested, and the schema is left unchanged.
* Store hours are in campus time (Asia/Kolkata) and checked against the database server's clock.
* `start_date` is part of the `ROOM_ALLOCATION` key, so a student cannot start two stays in the same room on
  the same day (for example, transferred out and back again). PostgreSQL rejects this with a clear message.

---

## Live demonstration

The step-by-step script with talking points is in **[docs/DBMS_DEMO_GUIDE.md](docs/DBMS_DEMO_GUIDE.md)**.
Before the demo, run `npm run db:local`, then `npm run dev`, then `npm run db:audit`. Keep a SQL window
open to show tables changing:

```bash
npm run db:sql                                   # interactive console (end statements with ;  \q quits)
npm run db:sql -- "SELECT * FROM v_hostel_occupancy"
# or any psql client:  psql postgres://postgres:postgres@localhost:54329/campusconnect
```
