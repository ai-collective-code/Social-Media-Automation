-- Content Engine — document storage (the fix for data loss on deploy)
--
--   psql "$DATABASE_URL" -f db/schema-documents.sql
--
-- WHY THIS AND NOT db/schema.sql
--
-- schema.sql is a fully normalized 16-table design, and it is the better
-- long-term model. It is not what this app can adopt today:
--
--   - It assumes UUID primary keys. The app generates its own string ids
--     ("brand_msiufbin_m10ou1", "req_msjx25he_gdp9ny") and, for calendar
--     posts, day-based ids ("MON_001") that repeat across brands. Adopting it
--     means minting surrogate keys and remapping every reference in eight
--     store modules — image jobs, QC decisions, prompt overrides, storyboards,
--     scene clips, renders — each of which currently keys off those strings.
--   - That is a large rewrite of code paths built and verified across this
--     project, with real regression risk, and it does nothing extra to solve
--     the actual failure: Render's filesystem is ephemeral, so every deploy
--     deletes data/*.json. Two brands' completed research and six stages of
--     billed pipeline output have already been lost that way.
--
-- So this stores the same JSON documents the app already reads and writes,
-- keyed by the same relative paths, in Postgres instead of on disk. The app's
-- logic and data shapes are untouched; only where the bytes live changes.
-- Deploys stop destroying work, today, without touching pipeline correctness.
--
-- schema.sql stays in the repo for when relational queries are actually
-- wanted (reporting across brands, per-platform analytics). Migrating to it
-- becomes a data migration between two Postgres schemas rather than a
-- rewrite-while-losing-data-weekly.

BEGIN;

CREATE TABLE IF NOT EXISTS json_documents (
  -- The store's own relative path, verbatim: "brands.json",
  -- "results/req_x.trends.json". Keeping the app's existing naming means the
  -- call sites don't need a second key scheme to reason about.
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION json_documents_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_json_documents_updated_at ON json_documents;
CREATE TRIGGER trg_json_documents_updated_at
  BEFORE UPDATE ON json_documents
  FOR EACH ROW EXECUTE FUNCTION json_documents_set_updated_at();

-- Pipeline results are read one at a time by request id, so a prefix index
-- covers the "everything for this request" access pattern without a scan.
CREATE INDEX IF NOT EXISTS idx_json_documents_key_prefix
  ON json_documents (key text_pattern_ops);

COMMIT;
