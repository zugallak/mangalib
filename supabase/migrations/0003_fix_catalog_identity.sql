-- MangaLib — 0003: fix catalog identity (forward migration)
--
-- Transitions production from the schema left by 0002:
--   * series.match_key : GENERATED ALWAYS AS (lower(regexp_replace(...))) STORED
--   * edition.total_volumes : CHECK (NULL or >= 0)
-- to the intended schema:
--   * series.match_key : plain text, APP-MAINTAINED (written by seriesMatchKey())
--   * edition.total_volumes : CHECK (NULL or >= 1)
--
-- Rationale for making match_key app-maintained instead of generated: a pure
-- SQL lower()+regexp_replace() is NOT equivalent to the app's seriesMatchKey().
-- It DELETES accented characters instead of transliterating them
-- ("Pokémon" -> "pokmon" instead of "pokemon"), and Postgres cannot use
-- unaccent() in a generated column (unaccent is STABLE, not IMMUTABLE). Rather
-- than let the database and application disagree on identity, the application
-- owns the value.
--
-- Non-destructive to edition rows: no edition/series rows are deleted.
-- Existing series.match_key values are discarded (they are recomputed): rows
-- become NULL and are backfilled EXACTLY (in JS) by
--   npm run catalog:repair -- --apply
-- New trusted writes (src/data/catalog.ts findOrCreateVolumeId) populate
-- match_key with seriesMatchKey(title).

-- ---------------------------------------------------------------------------
-- 1) series.match_key: replace the GENERATED column with a plain text column.
--    Dropping the column also drops its dependent index; we drop the index
--    first for clarity, then recreate it on the new column.
-- ---------------------------------------------------------------------------
drop index if exists public.series_match_key_idx;

alter table public.series drop column if exists match_key;

alter table public.series add column if not exists match_key text; -- nullable; backfilled later

create index if not exists series_match_key_idx on public.series (match_key);

-- ---------------------------------------------------------------------------
-- 2) edition.total_volumes: tighten CHECK (NULL or >= 0) to (NULL or >= 1).
-- ---------------------------------------------------------------------------

-- Normalize any existing 0 to NULL ("0" is not a meaningful authoritative
-- total). No-op when none exist.
update public.edition set total_volumes = null where total_volumes = 0;

-- Drop the existing check constraint by discovering its real name (0002 created
-- it inline, so Postgres auto-named it — normally edition_total_volumes_check,
-- but we resolve it dynamically to be robust).
do $$
declare
  c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.edition'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%total_volumes%';
  if c is not null then
    execute format('alter table public.edition drop constraint %I', c);
  end if;
end $$;

alter table public.edition
  add constraint edition_total_volumes_check
  check (total_volumes is null or total_volumes >= 1);
