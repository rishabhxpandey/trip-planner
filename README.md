# Outward

Mobile-first group trip planner. Make a trip, drop the link in the group chat; everyone taps the days they're free, votes on where to go, pitches places (optionally drafted by their own AI), splits the costs, and keeps the trip's files (itinerary PDFs, bookings, plan pages). No accounts required; Google sign-in is optional.

Built from the design handoff in [`docs/HANDOFF.md`](docs/HANDOFF.md) (prototype in `docs/design/`).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Postgres (Supabase or Neon) · Drizzle ORM · Auth.js v5 (Google) · Vercel.

## Run locally

```bash
npm install
cp .env.example .env.local      # set DATABASE_URL and AUTH_SECRET (npx auth secret)
cp .env.local .env              # drizzle-kit reads .env
npm run db:migrate              # applies drizzle/*.sql
npm run dev
```

`DATABASE_URL` pointing at `*.neon.tech` uses the Neon HTTP driver; any other URL (Supabase, local Postgres) uses `postgres-js` with prepared statements off, as Supabase's transaction pooler requires.

Google sign-in turns on when `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are set (redirect URI: `{origin}/api/auth/callback/google`). Without them the app works fully and the Google entry points are hidden.

## Deploy (Vercel + Supabase)

1. Database: the Supabase project `outward` (us-east-1) already has both migrations applied, including RLS on every table (run `npm run db:migrate` after merging anything that adds a file to `drizzle/`) so Supabase's public REST API can't read anything (the app connects as the owner, which bypasses RLS). For a new database, run `npm run db:migrate`.
   `DATABASE_URL` is the **Transaction pooler** string from Supabase → Connect (port 6543).
2. Vercel env vars: `DATABASE_URL`, `AUTH_SECRET`, optionally `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_SITE_URL`.
3. Config knobs: `NEXT_PUBLIC_WEEK_STARTS_MONDAY`, `NEXT_PUBLIC_MIN_RANGE_DAYS`, `NEXT_PUBLIC_PUBLIC_VETOES`.

## Layout

| Path | What |
|---|---|
| `app/page.tsx` | Create trip + recent trips |
| `app/t/[slug]/layout.tsx` | Loads the trip, resolves the Google-session participant, wraps `TripProvider` |
| `app/t/[slug]/page.tsx` | Hub (Dates / Where / Costs / Files tabs) + `generateMetadata` |
| `app/t/[slug]/files/[fileId]/route.ts` | Opens or downloads a trip file (`?download=1`) |
| `app/t/[slug]/p/[destId]/page.tsx` | Full-screen pitch |
| `app/t/[slug]/opengraph-image.tsx` | 1200×630 iMessage preview |
| `app/api/agent/[token]/…` | Bring-your-own-AI API |
| `lib/db/schema.ts` | Drizzle schema (migrations in `drizzle/`) |
| `lib/trip-derive.ts` | Heatmap, ranges, ranking, cost/location parsing, `blocksOf()` (pure, unit tested) |
| `lib/costs.ts` | Expense splitting (equal, by nights, exact), balances, settle-up (pure, unit tested) |
| `lib/files.ts` | File types, names, sizes, and how each type is served (pure, unit tested) |
| `lib/actions.ts` | Server actions (all mutations) |
| `lib/ops.ts` | Optimistic reducer used with `useOptimistic` |
| `components/` | `TripProvider`, `NameSheet`, `DatesTab`, `WhereTab`, `CostsTab`, `ExpenseSheet`, `FilesTab`, `PitchView`, `SendYourAI`, toast |

## Notes

- **Identity** is per device (`localStorage outward:me:{slug}`). Server actions accept the participant id from the client; if that participant is locked to a Google user, the session must match.
- **Agent tokens** are never in the page payload; the pitch page fetches the viewer's own token through a server action when "Send your AI" opens. `POST /api/agent/{token}/rotate` or the "Leaked? Make a new link" button regenerates it.
- **Agent API:** `GET /api/agent/{token}`, `PUT …/places/{id}/pitch` (POST also accepted), `POST …/places`, `POST …/places/{id}/comments`. CORS `*`, 20 KB bodies, 8,000-char pitches, 30 req/min per token (Upstash if configured, otherwise in-memory per instance).
- **Costs:** amounts are integer cents. Each share stores integer `units` (1 for equal, nights stayed, or cents for exact) and owes `amount × units / Σunits`, with leftover cents assigned deterministically. A payment ("Mark paid") is an expense paid by the sender with the receiver as the only share. People who leave keep their expenses and still show in balances.
- **Files:** stored in Postgres (`trip_files.data`, bytea), up to 4 MB each and 40 per trip, so there's no extra storage service. Uploads go through a server action (`serverActions.bodySizeLimit` is 4.5 MB in `next.config.ts`, matching Vercel's request limit). Anyone with the trip link can open them. HTML, SVG and anything that isn't a PDF or plain image is served with `Content-Security-Policy: sandbox`, so scripts in an uploaded page run in an opaque origin with no access to the app's cookies, storage or actions. Removing is a soft delete so it can be undone.
- **Freshness:** mutations revalidate the trip; clients also `router.refresh()` on focus and every 20s while visible.

## Scripts

`npm run dev` · `npm run build` · `npm test` (derive logic) · `npm run lint` (typecheck) · `npm run db:generate` · `npm run db:migrate`
