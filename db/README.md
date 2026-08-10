# Postgres schema (Render)

`schema.sql` replaces the JSON files under `data/` with a normalized
Postgres database. It's written for Render's managed Postgres but runs on
any Postgres 13+.

## Set up on Render

1. Render dashboard → **New → PostgreSQL**. Pick a region close to wherever
   the app itself will run (or your own machine, for now).
2. Once it's provisioned, copy the **Internal Database URL** if the app will
   also run on Render, or the **External Database URL** for anywhere else
   (this repo, right now, from your own PC).
3. Run the schema:

   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   ```

4. Put the connection string in `web/.env.local`:

   ```
   DATABASE_URL=postgres://user:pass@host/dbname?sslmode=require
   ```

   Render's external URLs need `sslmode=require` — the connection is
   rejected without it.

## Why this schema, not a straight copy of the JSON files

Three real bugs already happened under the JSON model, and each one is
structurally impossible under this schema rather than something the code has
to remember to avoid:

- **Post-ID collisions across brands.** Bucket post ids like `MON_001` are
  day-based, not globally unique — two brands' Monday posts share one id.
  Every JSON store works around this by tacking a `requestId` onto every
  record and scoping every lookup by both fields. `bucket_posts` gets a real
  UUID primary key instead; everything downstream has a foreign key to it,
  so the collision has nowhere to happen.
- **The scene-ID string hack.** Reel scenes are identified today by
  suffixing their post id (`THU_001__s2`) and parsing it back apart. That
  scheme already shipped one real bug: a naive prefix match on the id
  deleted every other scene's rendered frame whenever the parent post's own
  image regenerated. `reel_scenes` is its own table with its own primary
  key, so nothing needs to parse an id to know what it refers to.
- **Drifting `updated_at`.** Sixteen call sites currently set
  `updatedAt: new Date().toISOString()` by hand. A `BEFORE UPDATE` trigger
  makes it correct unconditionally, on every table that has one.

Full rationale for every table is written as comments directly in
`schema.sql` — read there for the field-by-field detail.

## What's normalized vs. left as JSONB

Anything read and written as one indivisible unit, and never filtered by an
inner field, stays JSONB: a creative brief's `visualDirection`, a strategy's
`pillars`, a trend list. Turning those into child tables would add joins
nothing in the app ever needs. Anything another table needs to reference, or
that the app actually queries by an inner value, is a real column or a real
table — `bucket_posts`, `reel_scenes`, `image_jobs.provider`.

## Status columns are `TEXT + CHECK`, not native `ENUM`

Postgres enum types are cheap to extend (`ALTER TYPE ... ADD VALUE`) but
expensive to shrink or rename — this schema's status vocabularies have
already changed shape more than once across this project's life. A `CHECK`
constraint is a one-line `ALTER TABLE` in either direction.

## Migrating the app to use it

This file is the schema only — none of the ~15 store modules
(`brand-store.ts`, `pipeline-store.ts`, `reel-store.ts`, …) have been
rewired to it yet. That's a separate, larger piece of work: swapping file
reads for SQL queries, one store at a time, with the app still working after
each one. Ask for it explicitly when you're ready — it's not something to do
silently alongside a schema design.
