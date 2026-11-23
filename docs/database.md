# Database (Neon Postgres)

Pinjam stores everything, including uploaded images, in a Neon Postgres database. The app
talks to it only from the server (server components, server actions and route handlers); the
connection string is never sent to the browser.

| Piece | Where |
| --- | --- |
| Connection pool (`pg` + Vercel `attachDatabasePool`) | `src/server/db/index.ts` |
| SQL helper (`sql` tagged template → `$1` parameters) | `src/server/db/sql.ts` |
| Schema migrations (plain SQL, applied in order) | `db/migrations/*.sql` |
| Migration runner | `scripts/db-migrate.mjs` (`npm run db:migrate`) |
| One-off import of the old SQLite data | `scripts/import-sqlite.mjs` (`npm run db:import-sqlite`) |
| Tests (PGlite, an in-process Postgres) | `src/server/services/*.test.ts`, `src/test/pglite.ts` |

## Environment variables

| Variable | Required | Used for |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon **pooled** connection string (host contains `-pooler`). The app uses it. `POSTGRES_URL` is accepted as a fallback. |
| `DATABASE_URL_UNPOOLED` | no | Neon **direct** connection string for migrations. Falls back to `DATABASE_URL`. |
| `NEXT_PUBLIC_TIME_ZONE` | no | Campus time zone, default `Asia/Jakarta`. Vercel runs in UTC, so dates use this zone. |
| `ALLOWED_EMAIL_DOMAINS` | no | Default `binus.ac.id`. |
| `NEXT_PUBLIC_UNIVERSITY_NAME`, `NEXT_PUBLIC_CAMPUS_NAME` | no | Display text. |

Use `sslmode=verify-full` in connection strings. `sslmode=require` also works today, but the `pg`
driver prints a warning that its meaning will change in the next major version.

## Local setup

```powershell
copy .env.example .env.local   # then paste your Neon connection strings
npm install
npm run db:migrate             # creates/updates the tables
npm run dev
```

`npm run db:status` lists which migrations are applied without changing anything.

## Migrations

- Each file in `db/migrations/` runs **once**, in filename order, inside a transaction. Applied
  files are recorded in the `schema_migrations` table, and a Postgres advisory lock stops two
  runs from overlapping.
- **Never edit a migration that has been applied.** Add a new file instead, e.g.
  `db/migrations/0002_add_item_tags.sql`.
- Write additive changes (new tables/columns/indexes). Anything that drops or rewrites data
  needs a backup and review first. Neon branches are a cheap way to rehearse:
  create a branch, point `DATABASE_URL_UNPOOLED` at it, run `npm run db:migrate`, test, then
  apply to production.

### On Vercel

`package.json` has a `vercel-build` script, which Vercel runs instead of `build`:

```
node scripts/db-migrate.mjs && next build
```

Pending migrations are applied before each build. If a migration fails, the build fails and the
previous deployment keeps serving traffic. If you'd rather run migrations by hand, delete the
`vercel-build` script and run `npm run db:migrate` against production before deploying.

> If Preview deployments share the production `DATABASE_URL`, preview builds migrate
> production too. Neon's Vercel integration can give each preview its own database branch instead.

## Schema overview

`users`, `sessions`, `files`, `categories`, `items`, `item_images`, `loans`, `loan_events`,
`conversations`, `messages`, `reviews`, `notifications`, `reports` (+ `schema_migrations`).

Integrity rules enforced by the database itself:

- `users.email` (stored lower-case) and `users.nim` are unique.
- `loans_no_overlap`: an exclusion constraint (`btree_gist`) stops two approved or active
  loans of the same item from having overlapping dates.
- `loans_one_open_per_borrower`: a student can have only one open request per item.
- `reviews` are unique per (loan, reviewer). `reports` are unique per (reporter, item).
- Foreign keys everywhere, with check constraints on statuses, conditions, prices and dates.

## Importing the old SQLite data

The pre-Postgres version stored data in `data/pinjam.db` and `data/uploads/`. To copy it into
Neon (only into an empty database; the SQLite files are only read):

```powershell
npm run db:import-sqlite              # dry run: shows row counts
npm run db:import-sqlite -- --apply   # copies users, items, loans, messages, images…
```
