-- MangaLib — 0002: catalog identity + truthful completeness
--
-- Safe for existing production data:
--   * adds a GENERATED series.match_key (auto-computed, no backfill needed)
--   * adds a nullable edition.total_volumes (defaults to NULL = unknown)
--   * NO UNIQUE constraint is added yet — production currently contains
--     duplicate series ("XXX Holic" vs "XXXHolic"). A unique index on
--     match_key can be added in a LATER migration once the repair script
--     (npm run catalog:repair -- --apply) has consolidated duplicates.
--
-- This migration is non-destructive: no rows are modified or deleted.

-- ---------------------------------------------------------------------------
-- Series identity key (matching only — the human-readable title is unchanged).
--
-- Mirrors the app's seriesMatchKey(): lowercase + strip all non-alphanumerics.
-- (Accent-stripping is done app-side; regexp_replace/lower are immutable so the
-- column can be GENERATED and always stays in sync with the title.)
-- ---------------------------------------------------------------------------
alter table public.series
  add column if not exists match_key text
  generated always as (lower(regexp_replace(coalesce(title, ''), '[^a-zA-Z0-9]+', '', 'g'))) stored;

-- Non-unique on purpose (duplicates still exist). Used for lookups now and as
-- the basis for a future unique index post-repair.
create index if not exists series_match_key_idx on public.series (match_key);

-- ---------------------------------------------------------------------------
-- Authoritative published volume count. NULL = unknown (the default).
-- The app never infers this; it stays NULL until a trusted source sets it.
-- ---------------------------------------------------------------------------
alter table public.edition
  add column if not exists total_volumes integer
  check (total_volumes is null or total_volumes >= 0);
