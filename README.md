# MangaLib

A mobile-first PWA to track a personal **physical** manga collection: see, series
by series, which volumes you own and which are missing — and (later) add volumes by
photographing a bookshelf.

Built with Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Supabase.

## Architecture

Layers are kept separate on purpose:

```
src/
  middleware.ts        # Session refresh + route protection (runs server-side)
  app/                 # Routes & UI (Server Components)
    page.tsx           #   /            home / overview (+ sign out)
    library/           #   /library     searchable series list
    series/[id]/       #   /series/:id  volume grid (owned / missing)
    scan/              #   /scan        workflow placeholder (no AI yet)
    login/             #   /login       email/password sign-in & sign-up
    manifest.ts        #   PWA manifest (native Next.js, no dependency)
  components/          # Presentational UI (+ sign-out button)
  domain/              # Pure logic & types — NO I/O
    types.ts           #   Series / Edition / Volume / OwnedVolume + view models
    library.ts         #   ownership + missing-volume computation, scan helpers
    scan.ts            #   MangaDetection + ScanProvider contract
  data/                # Supabase data access (server-only), mapped to domain types
    ownership.ts       #   idempotent add / remove owned volumes
  scan/                # Scan provider registry + stub (AI layer, isolated)
  lib/
    env.ts             # env access & "configured?" guard
    supabase/          # browser / server / service-role / middleware clients + DB types
supabase/
  migrations/          # SQL schema + Row Level Security
```

**Ownership is boolean.** `owned_volume` has no quantity — a row means "the user
owns this volume", no row means they don't. Adds are idempotent
(`UNIQUE(user_id, volume_id)` + upsert/ignore-duplicates), so overlapping bookshelf
scans never create duplicates.

Catalog data (**Series → Edition → Volume**) is shared and **read-only** through the
user client; ownership (`owned_volume`) is private per user. Both are enforced by RLS.
The AI recognition layer sits behind a single `ScanProvider` interface so a real
provider (OpenAI / Gemini / Claude) can be dropped in without touching the rest.

## Authentication

Supabase Auth with **email/password only** (no OAuth, no profile table — `auth.users`
is the identity source). `/login` handles both sign-in and account creation.
`src/middleware.ts` refreshes the session on every request and enforces access
server-side: unauthenticated users are redirected to `/login`, and authenticated users
are redirected off `/login` into the app. Protected: `/`, `/library`, `/series/[id]`,
`/scan`.

## Setup

1. **Create a dedicated Supabase project** (separate from your other apps).
2. Copy env vars and fill them in:
   ```bash
   cp .env.example .env.local
   ```
   Never commit `.env.local`.
3. **Run the schema.** Paste `supabase/migrations/0001_init.sql` into the Supabase
   SQL editor (or apply it with the Supabase CLI).
4. **Auth settings.** In Supabase → Authentication, email/password is enabled by
   default. For the quickest local testing you may disable "Confirm email"; otherwise
   new accounts must confirm via email before signing in.
5. Install & run:
   ```bash
   npm install
   npm run dev
   ```

## Environment variables

| Variable                        | Where         | Purpose                                         |
| ------------------------------- | ------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | client+server | Supabase project URL                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | Public anon **or** publishable key              |
| `SUPABASE_SERVICE_ROLE_KEY`     | server only   | Reserved for future catalog-management logic; currently unused, never exposed |

## Database types

`src/lib/supabase/database.types.ts` is currently a **temporary, hand-written**
mirror of the schema — it is the bootstrap source of truth only until the dedicated
Supabase project is linked. Replace it with generated types then:

```bash
# one-time: install the CLI (not a project dependency) and link the project
npx supabase login
npx supabase link --project-ref <your-project-ref>

# regenerate whenever the schema changes
npm run gen:types   # supabase gen types typescript --linked --schema public > …
```

The service-role key is **not** used for type generation.

## Bookshelf scan (AI)

Photograph a shelf → the server analyzes it → you review/correct detections →
confirm → only new volumes are added. Images are **analyzed then discarded** —
never stored, never logged.

- **Gemini is the primary scanner; OpenAI is the technical fallback.** Fallback
  fires only on a technical failure of Gemini (network, timeout, rate-limit,
  invalid/unparseable response) — never merely because confidence is low or some
  spines went unread. One photo = one Gemini call by default.
- All provider calls are **server-only**. Required server-side env vars:
  - `GEMINI_API_KEY`, `OPENAI_API_KEY` (never `NEXT_PUBLIC_`, never sent to the browser)
  - optional overrides `GEMINI_MODEL` (default `gemini-3.6-flash`) and
    `OPENAI_MODEL` (default `gpt-4o`)
- Endpoints (all re-check the Supabase session): `POST /api/scan` (analyze),
  `POST /api/scan/resolve` (read-only catalog/ownership check for the summary),
  `POST /api/scan/import` (write — adds only new volumes after confirmation).
- Library writes happen **only after explicit user confirmation**, through the
  RLS-aware user client. Catalog rows for new detections are created server-side
  via the service role (RLS still denies catalog writes to browser clients).

Model note: the default is the pinned stable `gemini-3.6-flash`, chosen for
reproducibility (the `*-latest` alias can move between versions). Override with
`GEMINI_MODEL`. Availability can vary per project/API key — during this project's
integration testing `gemini-2.5-flash` returned 404 for our key, which is why we
pin a current model and expose the override rather than relying on a fixed
legacy version.

## Not implemented yet (by design)

- Manual add UI (scan is the primary add path for now; data model & idempotent
  writes support a manual form next).
- Everything in the iteration's "do not implement yet" list: barcode/ISBN, cover
  recognition, scan history, permanent image storage, provider settings UI, etc.
