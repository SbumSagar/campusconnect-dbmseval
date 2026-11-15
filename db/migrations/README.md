# Versioned migrations

`npm run db:migrate` applies, in order:

1. `db/schema.sql` — recorded as `V001__core_schema` (the approved mid-sem schema, applied once).
2. Any file in this folder named `V002__description.sql`, `V003__…`, sorted by name (forward-only, applied once).
3. `db/views.sql` and `db/functions.sql` — repeatable; re-applied whenever their content changes.

Applied migrations and their checksums are tracked in `app_meta.schema_migrations`. The `app_meta` schema is
infrastructure and is kept separate from the 12 domain relations in `public`.

Rules:

* Never edit a versioned file after it has been applied. Add a new `V0xx__…sql` file instead.
* Migrations must not drop data. Destructive resets live only in `db/dev/reset.sql`
  (`npm run db:reset:dev`, which requires `ALLOW_DB_RESET=yes`).
* A database that was created earlier with the mid-sem `schema.sql` is detected and baselined automatically.
