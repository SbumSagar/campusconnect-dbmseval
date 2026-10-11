# CampusConnect: Student Welfare Management System

Group-15

DBMS Course Project (mid-sem submission). A database-centred campus welfare application, modelled on the BITS SWD portal, covering hostel room allocation, campus store ordering, outpass requests, document verification and the campus calendar.

The core of the project is the relational design: business rules are enforced by PostgreSQL constraints and triggers, not by the application layer.

## Team

| Name | Student ID | Contribution up to mid-sem |
|------|-----------|----------------------------|
| Shubham Sagar | 2024A3PS0394H | Requirements analysis, problem statement, assumptions and business rules |
| Jay Kimtani | 2024A3PS0392H | ER diagram (Chen notation) and ER-to-relational mapping |
| Sai Gautam Reddy | 2024A3PS0429H | Relational schema DDL: keys, data types, CHECK / UNIQUE constraints |
| Krishna Gupta | 2024A3PS0380H | Triggers, indexes and audit queries |
| Sreejith Gundla | 2024A3PS0427H | Normalization and design justification, application design, README, GitHub repo |

## Technology stack

| Layer | Choice |
|-------|--------|
| Database | PostgreSQL 13+ |
| Backend (planned) | Node.js + Express, `node-postgres` |
| Front end (planned) | React + Vite |

## Repository layout

```
db/schema.sql                         tables, constraints, indexes, triggers, audit queries
docs/CampusConnect_Database_Design.pdf    ER diagram, relational schema, constraints, normalization
docs/CampusConnect_Application_Design.pdf workflows, stack, architecture
docs/CampusConnect_ER_Chen_v5.pdf         full-size Chen ER diagram
README.md
```

## Database summary

* 12 relations: `hostel`, `room` (weak), `student`, `room_allocation` (from M:N ASSIGNED), `campus_store`, `menu_item` (weak), `orders`, `order_item` (from M:N CONTAINS), `document`, `admin`, `outpass_request`, `calendar`.
* Declarative rules: primary / foreign / unique keys, `CHECK` constraints, a partial unique index (one ACTIVE room allocation per student), and composite foreign keys that force an order to contain only items of the store it was placed with.
* Triggers: order and student totals (`trg_item`, `trg_order`), frozen items of cancelled orders (`trg_item_frozen`), room occupancy (`trg_alloc_occupancy`), and deferred constraint triggers requiring at least one item per order.
* 10 indexes on foreign keys and common filters.

## Setup

```bash
createdb campusconnect
psql -d campusconnect -f db/schema.sql
```

The script drops and recreates all objects, so it is safe to re-run. The audit queries at the end of `db/schema.sql` must return zero rows.

## Current progress

- [x] Requirements, Chen ER diagram, relational mapping, normalization
- [x] PostgreSQL schema with constraints, triggers and indexes
- [ ] Seed data (at least 500 records), views, stored function, 5+ reports
- [ ] REST API and React front end for the 3 workflows (order placement, outpass lifecycle, room allocation + Integrity Lab)

## Planned workflows

1. **Place / cancel an order**: one transaction, triggers maintain totals.
2. **Outpass lifecycle and reports**: request, review, return, overdue report.
3. **Room allocation and Integrity Lab**: atomic transfer; invalid operations rejected by named constraints.

See `docs/CampusConnect_Application_Design.pdf` for details.
