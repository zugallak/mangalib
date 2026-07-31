-- MangaLib — initial schema
-- Catalog data (series / edition / volume) is shared and readable by any
-- authenticated user, but NOT writable through the user-facing (RLS-aware)
-- client. User ownership (owned_volume) is private per user and protected by
-- Row Level Security.

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Catalog: Series → Edition → Volume
-- ---------------------------------------------------------------------------

create table if not exists public.series (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  original_title text,
  created_at     timestamptz not null default now()
);

create table if not exists public.edition (
  id           uuid primary key default gen_random_uuid(),
  series_id    uuid not null references public.series (id) on delete cascade,
  publisher    text,
  language     text,
  edition_name text,
  created_at   timestamptz not null default now()
);

create table if not exists public.volume (
  id            uuid primary key default gen_random_uuid(),
  edition_id    uuid not null references public.edition (id) on delete cascade,
  volume_number integer not null,
  isbn          text,
  title         text,
  cover_url     text,
  created_at    timestamptz not null default now(),
  unique (edition_id, volume_number)
);

-- ---------------------------------------------------------------------------
-- User ownership
--
-- A row means "this user owns this volume". No row means they do not. There is
-- deliberately no quantity: the product only answers the boolean question
-- "does the user own this volume?". The UNIQUE constraint makes ownership
-- idempotent — inserts use ON CONFLICT DO NOTHING, so repeated scans of the
-- same shelf never create duplicates.
-- ---------------------------------------------------------------------------

create table if not exists public.owned_volume (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  volume_id  uuid not null references public.volume (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, volume_id)
);

-- ---------------------------------------------------------------------------
-- Indexes for the common lookups
-- ---------------------------------------------------------------------------

create index if not exists edition_series_id_idx      on public.edition (series_id);
create index if not exists volume_edition_id_idx      on public.volume (edition_id);
create index if not exists owned_volume_user_id_idx   on public.owned_volume (user_id);
create index if not exists owned_volume_volume_id_idx on public.owned_volume (volume_id);
-- Case-insensitive series search for the mobile search box.
create index if not exists series_title_lower_idx     on public.series (lower(title));

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.series       enable row level security;
alter table public.edition      enable row level security;
alter table public.volume       enable row level security;
alter table public.owned_volume enable row level security;

-- Catalog: readable by any authenticated user. No INSERT / UPDATE / DELETE
-- policies are defined, so the shared catalog is read-only through the
-- RLS-aware user client. Future catalog mutations happen server-side through
-- controlled logic (service role), never directly from the browser.
create policy "series readable by authenticated"
  on public.series for select to authenticated using (true);

create policy "edition readable by authenticated"
  on public.edition for select to authenticated using (true);

create policy "volume readable by authenticated"
  on public.volume for select to authenticated using (true);

-- Ownership: each user may only read, add and remove their OWN rows.
-- No UPDATE policy exists — ownership is a boolean relationship with nothing
-- mutable, so add (INSERT) / remove (DELETE) is the complete, minimal set.
create policy "owned_volume select own"
  on public.owned_volume for select to authenticated
  using (auth.uid() = user_id);

create policy "owned_volume insert own"
  on public.owned_volume for insert to authenticated
  with check (auth.uid() = user_id);

create policy "owned_volume delete own"
  on public.owned_volume for delete to authenticated
  using (auth.uid() = user_id);
