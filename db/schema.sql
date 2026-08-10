-- Content Engine — PostgreSQL schema (Render-ready)
--
-- Replaces the JSON-file stores under data/*.json. Run once against a fresh
-- Render Postgres database:
--
--   psql "$DATABASE_URL" -f db/schema.sql
--
-- Design notes (the "why", not just the "what"):
--
-- 1. STATUS COLUMNS ARE TEXT + CHECK, NOT NATIVE ENUM. This schema has
--    changed shape every few days across this project's history (QCStatus
--    gained values, RunStage grew stages). Postgres enum types support ADD
--    VALUE cheaply but not removing or renaming one without a full rebuild.
--    A CHECK constraint is a one-line ALTER either way. Enums would be the
--    right call for a schema that has stopped moving; this one hasn't.
--
-- 2. bucket_posts GETS A REAL SURROGATE KEY. The JSON model keys everything
--    off strings like "MON_001" — day-plus-index, not globally unique — so
--    every downstream store (image jobs, QC decisions, prompt overrides) has
--    to carry a second requestId column and remember to scope every lookup
--    by both. Forgetting once already caused a real bug: two brands' Monday
--    posts collided under one QC decision. A UUID primary key plus real
--    foreign keys make that collision structurally impossible instead of a
--    discipline the code has to maintain.
--
-- 3. reel_scenes IS ITS OWN TABLE, NOT A JSONB ARRAY. The app currently
--    fakes a scene's identity by string-suffixing its post id
--    ("THU_001__s2") and parsing it back apart (see reel-types.ts's
--    sceneAssetId/parseAssetId). That scheme already caused one shipped bug:
--    a scene id starting with its post id made a naive prefix match delete
--    every OTHER scene's rendered frame whenever the post's own image
--    regenerated. A scene with its own primary key removes the string
--    parsing entirely — image_jobs, scene_clips and prompt_overrides
--    reference reel_scenes.id directly.
--
-- 4. image_jobs AND prompt_overrides ARE POLYMORPHIC BY DESIGN. Both target
--    either a whole post (a feed image) or one scene of a reel (a video
--    frame) — the app has always treated these as the same kind of asset.
--    Modelled here as two nullable foreign keys plus
--    CHECK (num_nonnulls(post_id, scene_id) = 1), which is enforced by
--    Postgres itself rather than by every call site remembering which id
--    shape it was holding.
--
-- 5. reel_edits IS GONE — ABSORBED INTO reel_storyboards AND reel_scenes.
--    The JSON model keeps storyboard content and edit settings (duration,
--    camera move, transition) in two separate files that must be read
--    together and can drift out of sync (a storyboard rewrite can leave a
--    stale edit with the wrong scene count — reelEditFor() exists purely to
--    paper over that). One row per scene, one place for its content and its
--    timing, removes the reconciliation step altogether.
--
-- 6. updated_at IS TRIGGER-MAINTAINED. The JSON stores set
--    `updatedAt: new Date().toISOString()` by hand at every call site — easy
--    to forget on a new code path, impossible to verify by reading the
--    schema. A BEFORE UPDATE trigger makes it true unconditionally.
--
-- 7. DELETING A BRAND CASCADES. Every table below is reachable from
--    `brands` by a chain of ON DELETE CASCADE foreign keys, matching what
--    "delete this brand" already means in the app: its runs, requests,
--    calendar, briefs, images and reels are that brand's alone.
--
-- Nested objects that are always read and written as one unit and never
-- filtered by an inner field (visual direction, copy direction, pillars,
-- trend list) are stored as JSONB rather than further normalised — turning
-- them into child tables would add joins with no query anyone makes. Each
-- JSONB column is commented with the shape the application code expects.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- BRANDS
-- ============================================================================

CREATE TABLE brands (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  domain        TEXT,
  industry      TEXT,
  description   TEXT,               -- what the brand sells and how it positions itself
  audience      TEXT,                -- who it is for
  voice         TEXT,                -- how it should sound
  never_say     TEXT,                -- claims/words/topics banned from every caption and brief
  markets       TEXT,                -- free text: "India, UAE" — drives regional research + post times
  avoid_visuals TEXT,                -- visual bans, applied to every image/reel-frame prompt
  image_seed    INTEGER,             -- pinned seed for a reproducible look; NULL = vary freely
  language      TEXT,                -- content language; NULL/'' means English
  platforms     TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- RESEARCH REQUESTS — one per pipeline run's competitor research
-- ============================================================================

CREATE TABLE research_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  domain       TEXT,
  industry     TEXT,
  -- [{ "name": string, "url"?: string }, ...] — the discovery stage's own list,
  -- distinct from research_results.competitors below, which is the researched,
  -- per-platform breakdown of the same names.
  competitors  JSONB NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'researching', 'complete')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_research_requests_brand_id ON research_requests(brand_id);

-- ============================================================================
-- RUNS — one pipeline execution, tracked stage by stage
-- ============================================================================

CREATE TABLE runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  -- Nullable: a run exists from the moment it's queued, before a research
  -- request has been created for it (discovery hasn't run yet).
  request_id        UUID REFERENCES research_requests(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  stage             TEXT
                    CHECK (stage IS NULL OR stage IN
                      ('discovery', 'research', 'trends', 'strategy', 'bucketing', 'creative')),
  completed_stages  JSONB NOT NULL DEFAULT '[]', -- string[] of the stage names above
  -- What the discovery stage found, kept for auditability even after a
  -- research_request supersedes it. [{ "name": string, "url"?: string }, ...]
  competitors       JSONB,
  message           TEXT NOT NULL DEFAULT '',
  error             TEXT,
  queued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  -- Refreshed on every progress update; a run whose heartbeat has gone stale
  -- while status = 'running' means its worker died without reporting failure.
  heartbeat_at      TIMESTAMPTZ
);

CREATE INDEX idx_runs_brand_id ON runs(brand_id);
CREATE INDEX idx_runs_request_id ON runs(request_id);
-- Powers "is anything currently running" / queue-position checks without a
-- full table scan.
CREATE INDEX idx_runs_status ON runs(status) WHERE status IN ('queued', 'running');

-- ============================================================================
-- PIPELINE STAGE RESULTS — one row each per request (research/trends/strategy)
-- ============================================================================

CREATE TABLE research_results (
  request_id      UUID PRIMARY KEY REFERENCES research_requests(id) ON DELETE CASCADE,
  -- [{ "name", "platforms": [{ "platform","handle"?,"url"?,"followers"?,
  --    "engagementRate"?,"postingFrequency"?,"topContentThemes"?[],"gaps"?[],
  --    "notes"? }], "summary"? }, ...]
  competitors     JSONB NOT NULL DEFAULT '[]',
  key_gaps        TEXT[] NOT NULL DEFAULT '{}',
  recommendations TEXT[] NOT NULL DEFAULT '{}',
  sources         TEXT[] NOT NULL DEFAULT '{}',
  researched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trend_results (
  request_id          UUID PRIMARY KEY REFERENCES research_requests(id) ON DELETE CASCADE,
  -- [{ "name","growthSignal","competitorGap","opportunity" }, ...]
  trends              JSONB NOT NULL DEFAULT '[]',
  recommended_actions TEXT[] NOT NULL DEFAULT '{}',
  sources             TEXT[] NOT NULL DEFAULT '{}',
  analyzed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE strategy_results (
  request_id        UUID PRIMARY KEY REFERENCES research_requests(id) ON DELETE CASCADE,
  -- [{ "name","percentage","rationale" }, ...]
  pillars           JSONB NOT NULL DEFAULT '[]',
  -- [{ "stage","pillar","postsPerWeek" }, ...]
  buyer_journey     JSONB NOT NULL DEFAULT '[]',
  platform_strategy TEXT NOT NULL DEFAULT '',
  success_metrics   TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- BUCKET POSTS — the content calendar itself. Everything else keys off this.
-- ============================================================================

CREATE TABLE bucket_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES research_requests(id) ON DELETE CASCADE,
  -- The human-readable slot from the old scheme ("MON_001"). Kept for display
  -- and for matching against pre-migration data; NOT the join key anymore —
  -- see design note 2 above. Unique per request, not globally.
  slot_key         TEXT NOT NULL,
  day              TEXT NOT NULL,
  time             TEXT NOT NULL,
  platform         TEXT NOT NULL,
  pillar           TEXT NOT NULL,
  buyer_stage      TEXT NOT NULL,
  topic            TEXT NOT NULL,
  content_type     TEXT NOT NULL,
  why_this_post    TEXT NOT NULL,
  hashtag_themes   TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, slot_key)
);

CREATE INDEX idx_bucket_posts_request_id ON bucket_posts(request_id);

-- ============================================================================
-- CREATIVE BRIEFS — one per post
-- ============================================================================

CREATE TABLE creative_briefs (
  post_id             UUID PRIMARY KEY REFERENCES bucket_posts(id) ON DELETE CASCADE,
  concept_name        TEXT NOT NULL,
  concept_one_sentence TEXT NOT NULL,
  insight             TEXT NOT NULL,
  emotional_tone      TEXT NOT NULL,
  -- { "palette": string[], "aesthetic": string, "vibe": string }
  visual_direction    JSONB NOT NULL,
  -- { "detailedPrompt","styleReference","avoid","textOverlay"?: string|null }
  image_prompt        JSONB NOT NULL,
  -- NULL for non-video posts. Otherwise:
  -- { "totalDuration","overallDirection",
  --   "scenes": [{ "timing","description" }, ...] }
  -- (Superseded for editing purposes by reel_storyboards/reel_scenes once a
  --  storyboard is written on the Reels page — this is the pipeline's first
  --  pass, kept for record.)
  video_prompt        JSONB,
  -- { "hookExamples": string[], "tone","hashtags": string[], "captionExample" }
  copy_direction      JSONB NOT NULL,
  score               NUMERIC(3, 1) NOT NULL,
  score_rationale     TEXT NOT NULL,
  -- A post whose brief generation failed is simply absent from this table —
  -- the pipeline records that in-memory per run, not as a persistent row.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- QC DECISIONS — one per post, upserted as reviewers act
-- ============================================================================

CREATE TABLE qc_decisions (
  post_id     UUID PRIMARY KEY REFERENCES bucket_posts(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('approved', 'revision_requested', 'pending')),
  feedback    TEXT,
  -- Checklist toggles keyed "visual:0" / "copy:3" — sparse, so a fresh
  -- checklist item added to the UI needs no migration here.
  checks      JSONB NOT NULL DEFAULT '{}',
  decided_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- REEL STORYBOARDS — one per video post; absorbs the old reel-edits file
-- ============================================================================

CREATE TABLE reel_storyboards (
  post_id             UUID PRIMARY KEY REFERENCES bucket_posts(id) ON DELETE CASCADE,
  total_duration      TEXT NOT NULL DEFAULT '',
  overall_direction   TEXT NOT NULL DEFAULT '',
  hook                TEXT NOT NULL DEFAULT '',
  -- Locked description of the recurring person, repeated into every scene's
  -- image prompt so the same character survives across independent
  -- generation calls. '' means no storyboard cast has been set. Named
  -- cast_description rather than the app's own field name `cast` — that's
  -- a reserved word in SQL (the CAST(x AS type) operator) and can't be a
  -- bare identifier even quoted-escaped without every query remembering to.
  cast_description    TEXT NOT NULL DEFAULT '',
  transition_sec      NUMERIC(4, 2) NOT NULL DEFAULT 0.5,
  burn_text           BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_reel_storyboards_updated_at
  BEFORE UPDATE ON reel_storyboards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- REEL SCENES — first-class rows; see design note 3 above
-- ============================================================================

CREATE TABLE reel_scenes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storyboard_id  UUID NOT NULL REFERENCES reel_storyboards(post_id) ON DELETE CASCADE,
  scene_index    INTEGER NOT NULL,           -- 0-based position in the reel
  timing         TEXT NOT NULL DEFAULT '',   -- display only, e.g. "0:00-0:04"
  shot           TEXT NOT NULL,              -- what the camera sees; feeds image generation
  voiceover      TEXT,
  on_screen_text TEXT,                       -- burned in at render time, never sent to the image model
  duration_sec   NUMERIC(4, 2) NOT NULL DEFAULT 4.0,
  motion         TEXT NOT NULL DEFAULT 'zoom-in'
                 CHECK (motion IN ('zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'still')),
  UNIQUE (storyboard_id, scene_index)
);

CREATE INDEX idx_reel_scenes_storyboard_id ON reel_scenes(storyboard_id);

-- ============================================================================
-- SCENE CLIPS — uploaded footage that replaces a scene's still + camera move
-- ============================================================================

CREATE TABLE scene_clips (
  scene_id      UUID PRIMARY KEY REFERENCES reel_scenes(id) ON DELETE CASCADE,
  local_path    TEXT NOT NULL,     -- e.g. /generated/clips/<file>.mp4
  duration_sec  NUMERIC(6, 3) NOT NULL,
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  has_audio     BOOLEAN NOT NULL,
  original_name TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- REEL RENDERS — history of assembled MP4s per post
-- ============================================================================

CREATE TABLE reel_renders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID NOT NULL REFERENCES bucket_posts(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'rendering'
               CHECK (status IN ('rendering', 'complete', 'failed')),
  local_path   TEXT,               -- set once complete: /generated/reels/<file>.mp4
  duration_sec NUMERIC(6, 2),
  scene_count  INTEGER,
  text_burned  BOOLEAN,            -- false when captions were requested but no font was found
  error        TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);

-- Powers "latest render for this post" without scanning every attempt.
CREATE INDEX idx_reel_renders_post_latest ON reel_renders(post_id, started_at DESC);

-- ============================================================================
-- IMAGE JOBS — every generation attempt, for a post OR a reel scene
-- ============================================================================

CREATE TABLE image_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Exactly one of these is set — see design note 4 above.
  post_id      UUID REFERENCES bucket_posts(id) ON DELETE CASCADE,
  scene_id     UUID REFERENCES reel_scenes(id) ON DELETE CASCADE,
  day          TEXT NOT NULL,
  topic        TEXT NOT NULL,
  prompt       TEXT NOT NULL,       -- the fully composed prompt actually sent to the model
  design_type  TEXT NOT NULL,       -- "instagram_post" | "instagram_reel_cover" | "reel_frame"
  status       TEXT NOT NULL
               CHECK (status IN ('pending', 'generating', 'complete', 'failed')),
  -- Result fields, flattened rather than nested JSONB: each is a plain scalar
  -- and "provider" in particular is worth filtering/grouping by directly.
  provider     TEXT CHECK (provider IS NULL OR provider IN ('canva', 'openai', 'pollinations')),
  design_id    TEXT,                -- Canva-only
  title        TEXT,
  edit_url     TEXT,                -- Canva-only
  view_url     TEXT,
  local_path   TEXT,                -- e.g. /generated/<file>.jpg, once complete
  width        INTEGER,
  height       INTEGER,
  exported_at  TIMESTAMPTZ,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(post_id, scene_id) = 1)
);

CREATE TRIGGER trg_image_jobs_updated_at
  BEFORE UPDATE ON image_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Both partial: a plain index on a column that's NULL half the time wastes
-- space covering rows the "latest job for this post/scene" query never wants.
CREATE INDEX idx_image_jobs_post_latest
  ON image_jobs(post_id, created_at DESC) WHERE post_id IS NOT NULL;
CREATE INDEX idx_image_jobs_scene_latest
  ON image_jobs(scene_id, created_at DESC) WHERE scene_id IS NOT NULL;

-- ============================================================================
-- PROMPT OVERRIDES — the AI art director's rewrite, layered over the brief
-- ============================================================================

CREATE TABLE prompt_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Exactly one of these is set — same polymorphism as image_jobs, and for
  -- the same reason: a refinement targets whatever the generation targeted.
  post_id      UUID REFERENCES bucket_posts(id) ON DELETE CASCADE,
  scene_id     UUID REFERENCES reel_scenes(id) ON DELETE CASCADE,
  prompt       TEXT NOT NULL,       -- rewritten scene description, art-director's output
  instruction  TEXT NOT NULL,       -- what the user asked for, verbatim
  note         TEXT NOT NULL,       -- the art director's one-line summary of the change
  revision     INTEGER NOT NULL DEFAULT 1,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(post_id, scene_id) = 1)
);

CREATE TRIGGER trg_prompt_overrides_updated_at
  BEFORE UPDATE ON prompt_overrides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One override per target — a new refinement replaces the last, it doesn't
-- accumulate a row (the app increments `revision` in place, per
-- prompt-override-store.ts's savePromptOverride).
CREATE UNIQUE INDEX idx_prompt_overrides_post
  ON prompt_overrides(post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX idx_prompt_overrides_scene
  ON prompt_overrides(scene_id) WHERE scene_id IS NOT NULL;

COMMIT;
