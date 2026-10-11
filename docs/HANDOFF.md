# Handoff: Outward — group trip planner (v1)

## Overview
A mobile-first web app for planning a group trip from a group-chat link. No accounts required.
Someone creates a trip and gets a shareable link. Anyone who opens it picks or enters their name once, then:
1. **Dates**: taps the days they're free. The app shows an overlap heatmap and lists the ranges where everyone is free.
2. **Where**: adds destinations and uses approval voting (thumbs up on any number), plus **one veto per person**. Results are ranked by approvals; vetoed places keep their rank and get a flag.
3. **Pitch**: each destination has a one-page free-form "pitch" anyone can edit, with reactions and a comments/questions thread.
4. **Bring your own AI**: each participant has a private agent URL. Their own Claude/ChatGPT/Muse/agent can read the trip and post a pitch. The app never calls an LLM itself.
5. **Optional Google sign-in**: locks a name to a person and syncs across devices. Never required.

Target stack: **Next.js (App Router) + TypeScript + Tailwind + hosted Postgres (Neon) + Drizzle ORM + Auth.js (Google)**, deployed on **Vercel**.

## About the design files
`Trip Planner.dc.html` (open it in a browser; `support.js` must sit next to it) is a **design reference built in HTML**. It is a working prototype that shows the intended look and behavior, with state in localStorage. It is **not production code to copy**. Rebuild it in Next.js using the architecture below. The `renderVals()` logic in the file is a useful reference for derived data (heatmap, ranges, ranking, pitch parsing).

## Fidelity
**High-fidelity.** Colors, type, spacing, copy and interactions are final. Recreate them closely in Tailwind.

---

## Data model (Postgres / Drizzle)

```ts
trips           id text pk (nanoid 10, URL slug) · name text · window_start date · window_end date
                created_at timestamptz default now()
                CHECK (window_end >= window_start AND window_end - window_start <= 89)

users           id uuid pk · email text unique · name text · image text · created_at      -- Auth.js
                (+ Auth.js accounts/sessions/verification_tokens tables via @auth/drizzle-adapter)

participants    id uuid pk · trip_id fk→trips cascade · name text · hue smallint
                user_id uuid fk→users null                 -- set = name is "locked"
                agent_token text unique not null           -- 'ag_' + 24 random chars; regenerable
                veto_destination_id uuid fk→destinations null ON DELETE SET NULL
                created_at
                UNIQUE (trip_id, lower(name)) · UNIQUE (trip_id, user_id)

availability    participant_id fk cascade · day date · PK (participant_id, day)   -- row = free

destinations    id uuid pk · trip_id fk cascade · name text · note text null
                added_by fk→participants · created_at
                pitch_text text not null default ''
                pitch_updated_by fk→participants null · pitch_source text null  -- e.g. "Maya's AI"
                pitch_updated_at timestamptz null
                UNIQUE (trip_id, lower(name))

approvals       participant_id fk cascade · destination_id fk cascade · PK (both)

reactions       participant_id fk cascade · destination_id fk cascade · emoji text
                PK (participant_id, destination_id, emoji)   -- emoji ∈ 👍 😍 🤔 💸

comments        id uuid pk · destination_id fk cascade · participant_id fk · text text
                is_question bool default false · answered bool default false · source text null · created_at
```

**Rules**
- One veto per person is enforced by the single nullable column. Vetoing another place moves it; vetoing the same place clears it.
- Anyone can remove any destination (with an undo toast in the UI). Removing a destination nulls any vetoes on it.
- `pitch_text` is plain text (a light convention, not Markdown). Parsing rules are under **Pitch canvas** below.

## Derived data (compute on read)
- **Active people** = participants with ≥1 availability row. People who haven't marked days are **not counted** in "everyone" and are listed as "Not counted until they mark days: …".
- **Heatmap**: `free[day] = count of active people free`. `ratio = free / activeCount`.
- **Everyone-free ranges**: runs of consecutive days where `free == activeCount`, length ≥ `MIN_RANGE_DAYS` (default 2).
- **Fallback when none exist**: "Closest so far", meaning runs where `free == activeCount − 1`, top 3, each showing "Missing {names}".
- **Destination ranking**: approvals desc, then created_at asc. Vetoed places stay in rank order with a flag.
- **Cost on vote card**: parsed from pitch text. Use the first match of `/cost[^\n$]*\$\s?([\d,]+)/i`, else `/\$\s?([\d,]+)\s*(?:\/|per\s)\s*(?:person|pp|head)/i`.
- **Location**: the first line matching `/^\s*where:\s*(.+)$/im`, with URLs stripped. It links to `https://www.google.com/maps/search/?api=1&query=…`.

## Identity
- localStorage key `outward:me:{slug}` → participant_id. If missing, show the name sheet; it can't be dismissed until a name is picked.
- **Picking an existing unlocked name** claims it (trust-based). **A locked name** (`user_id` set) requires Google sign-in as that user.
- **New name** creates a participant. If signed in and the user isn't already in the trip, `user_id` is set.
- **Signed-in user opens a trip** where they have a participant row: auto-select it.
- Server actions take `participantId` from the client. When the participant has a `user_id`, verify the session matches; otherwise accept.

## Google sign-in (optional)
- Auth.js v5, Google provider, Drizzle adapter, database sessions.
- **Entry points**:
  1. A dismissible "Keep your spot on every device" card on the Dates tab, shown after the user has marked ≥1 day. "Not now" hides it for that trip (localStorage).
  2. "Joined on another device? Continue with Google" at the bottom of the name sheet.
  3. Tapping a locked name.
- **Linking** sets `participants.user_id` for the current participant.
- **In-app browsers**: Google blocks OAuth in embedded webviews. Detect via UA `/Instagram|FBAN|FBAV|Line\/|Snapchat|TikTok|WhatsApp/i` and show "Google doesn't allow sign-in inside this app's browser. Open the link in Safari or Chrome first." instead of starting OAuth. iMessage opens Safari, which is fine.
- The prototype's email-entry sheet is a **stand-in** for Google's account picker. Don't build it; call `signIn('google')`.
- Home shows "Your trips" (all trips with a participant row for this user) when signed in, otherwise "Trips on this device" (from localStorage), plus a sign-out link.

## Routes
| Route | Purpose |
|---|---|
| `/` | Create trip (name, from/to dates; ≤90 days). Server action → redirect `/t/[slug]`. Below: recent trips. |
| `/t/[slug]` | Trip hub. `?tab=dates\|where`. Name sheet if no identity. |
| `/t/[slug]/p/[destId]` | Full-screen pitch for one destination. |
| `/t/[slug]/opengraph-image.tsx` | 1200×630 OG image (see below). |
| `/api/auth/[...nextauth]` | Auth.js |
| `/api/agent/[token]/…` | Bring-your-own-AI API (see below). |

Mutations use **server actions** with optimistic UI (`useOptimistic`). Refresh with `router.refresh()` on window focus and every 20s while visible. No realtime service.

## Agent API (bring your own AI)
Auth is the token in the path; it resolves to one participant in one trip. Everything posted is attributed `"{participant.name}'s AI"` (append `author` if given, e.g. "Maya's AI (Claude)"). JSON in/out, CORS `*`, rate limit ~30 req/min per token (Upstash or Vercel KV), body ≤ 20 KB, `pitch.text` ≤ 8,000 chars.

```
GET  /api/agent/{token}
  → { trip:{name, window_start, window_end}, you:{name},
      people:[{name, marked_days}], best_ranges:[{start,end,days}],
      places:[{id, name, note, approvals, vetoed, pitch_text}],
      pitch_schema: { text: "…" } }

PUT  /api/agent/{token}/places/{destId}/pitch
  body { author?: string, pitch: { text: string } }   (also accept a bare string or {canvas})

POST /api/agent/{token}/places
  body { name, note?, author?, pitch?: { text } }      → { id }

POST /api/agent/{token}/places/{destId}/comments
  body { text, question?: boolean, author? }
```
- Add `POST /api/agent/{token}/rotate` (or a button in the UI) to regenerate a leaked token.
- An optional later step is an MCP server exposing the same four operations as tools.

### "Send your AI" panel (in each pitch)
- **Three buttons**: Claude, ChatGPT, Muse. Each copies the prompt to the clipboard, then opens:
  - Claude: `https://claude.ai/new?q={encoded}`
  - ChatGPT: `https://chatgpt.com/?q={encoded}`
  - Muse (Meta): `https://muse.ai/?q={encoded}` — **unverified URL format**. Keep the clipboard fallback; the toast says "If the box is empty, paste — it's copied."
- The last-used AI is remembered per device and highlighted ("Last used").
- **"Using something else? Copy the instructions"** link.
- **Personal AI link**: shown with a Copy button and the note: Only for you. Anything posted with it shows as "{name}'s AI". Treat it like a password.
- **Paste-back box**: for AIs that can't make HTTP calls. Parse the first `{…}` as JSON, or accept raw text. This sets `pitch_source`.
- **Collapsible "Endpoint details"**: the four calls above.
- **Prompt template**: see `aiPrompt()` in the prototype. It includes the trip name, destination (+ note), group size and names, best dates, the GET/PUT URLs, the schema, and rules (skimmable, < 250 words, "Cost per person: ~$N" line, "Day N:" lines, only URLs it's confident exist).
- A posted pitch replaces the text. Show a toast with Undo (restore the previous text).

## Open Graph (iMessage preview)
- `generateMetadata` on `/t/[slug]`:
  - title `"{trip.name}"`
  - description `"Tap the days you're free · {N} people planning"`
  - `og:image` → `opengraph-image.tsx`
  - `twitter:card=summary_large_image`
- **Image (1200×630, `next/og`)**:
  - Background `#F4EFE4`.
  - Logo mark top-left: a 22px `#1D2326` rounded square with an 8px `#E06A33` dot, plus the "Outward" wordmark.
  - Trip name in Bricolage Grotesque 800, ~96px, `#1D2326`, tracking −0.035em.
  - Date window line in Instrument Sans 600, 36px, `#5E5D56`.
  - Bottom row: participant initials as 64px colored circles (hues below), with "{N} people planning" beside them.
  - If an everyone-free range exists, a `#C2491C` pill: "Everyone's free {range}".
  - Load the fonts with `fetch` in the OG route.
- `/` gets static OG: "Outward — plan the trip, not the group chat."

---

## Screens

The global layout is a single column, `max-width: 480px`, centered, on a `#F4EFE4` page background, with 20px side padding. Every tap target is ≥ 44px.

### 1. Home `/`
- **Header**: logo mark + "Outward" (Bricolage 800 20px, −0.02em).
- **H1**: "Plan the trip, not the group chat." (Bricolage 800 46px/0.98, −0.035em, `text-wrap: balance`).
- **Sub**: 17px/1.45, `#5E5D56`.
- **Create card**: `#FFFCF5`, 1px `#E3DAC7`, radius 20, padding 20, gap 18.
  - **Trip name input**: 50px tall, radius 12, border `#D9CFBA`, 17px. Focus border `#1D2326`. Placeholder "Ski weekend, Lisbon '27…".
  - **From/To**: two date inputs in a 2-col grid, each with a small-caps label (12px 600, uppercase, 0.06em, `#6B6A63`). Helper text: "The range people pick from. Up to 90 days."
  - **Errors** (14px 600 `#A3311C`): "Give the trip a name." / "Pick a start and end date." / "End date is before the start." / "Keep the window to 90 days or less."
  - **CTA**: "Create trip & get link", 54px, radius 14, `#1D2326` bg, `#FFFCF5` text, 700 17px. Active: scale(.98).
- **Recent list**: section label "Trips on this device" / "Your trips". Rows are 60px min, radius 14, `#FFFCF5`, with the name (Bricolage 700 17), a sub line "Nov 1 – Dec 13 · 6 people", and a "→" arrow.

### 2. Trip hub `/t/[slug]`
- **Top row**:
  - Logo button (back to home).
  - "Share link" pill: 44px, radius 22, `#1D2326`, with a share icon. Uses `navigator.share({title, text:"Mark your free days for {name}", url})`, falling back to the clipboard with the toast "Link copied. Paste it in the group chat."
- **Title**: Bricolage 800 34px/1.02. Sub line "Nov 1 – Dec 13, 2026 · 6 people" (15px `#5E5D56`).
- **Avatar stack**: 34px circles overlapping by −6px, with a 2px `#F4EFE4` border. The current user gets a 2px `#1D2326` ring. Right side: "You're **Maya** 🔒 · switch", where the lock is a 12px teal icon shown only if locked.
- **Sticky segmented tabs**: track `#E8E0CF` radius 14, padding 4. The active tab is `#FFFCF5` with shadow `0 1px 3px rgba(29,35,38,.12)`, 44px tall, labels "Dates" / "Where".

#### Dates tab
- **Google nudge card** (conditional): `#E4EEEC` bg, radius 18. A 36px teal `#0F5F66` circle with a lock icon, the title "Keep your spot on every device" (Bricolage 700 17), body copy, "Continue with Google" (white, 1.5px `#1D2326` border, 50px), and a "Not now" text button.
- **Ranges card**:
  - Title "Everyone's free" or "Closest so far", plus "{n} of {total} marked".
  - Each range is a 52px row, radius 12: `#C2491C` with cream text for everyone-free, or `oklch(.48 .1 190)` for closest. It shows the label "Fri, Nov 13 – Sun, Nov 15", the detail "All 5 free" / "Missing Jonah", and the length "3 days" on the right. Tapping jumps to group mode with that day selected.
  - A dashed divider, then the "Not counted until they mark days: …" line.
- **Mode toggle**: "My days" / "Group heatmap", 44px pills with a 1.5px `#1D2326` border; the active one is filled.
  - **My days** helper: "Tap every day you could go." or "{n} days marked. Saved as you tap." Plus 36px chips "+ Weekends" (adds Fri/Sat/Sun in the window) and "Clear" (with undo).
  - **Group** legend: a 4-step ramp "Fewer → More free", an "Everyone" swatch, and "You" (dot).
- **Calendar**: one block per month. Month label in Bricolage 700 18. 7-col grid, gap 5. Weekday initials 11px 700. Week starts Sunday (configurable).
  - **Cells**: square, ≥44px, radius 11, 15px 600, with a 5px dot below the number.
  - Out of window: transparent, `#A9A595`, disabled.
  - Mine mode: free = `#1D2326` with cream text; not free = `#FFFCF5` with a `#E3DAC7` border.
  - **Group mode**:
    - Everyone free = `#C2491C`.
    - Partial = `oklch((0.92 − 0.44r) (0.04 + 0.06r) 190)`, with cream text when r > .55.
    - Zero free = `#FFFCF5`.
    - The dot is visible on days *I* marked.
    - Selected day ring: `0 0 0 2.5px #F4EFE4, 0 0 0 4.5px #1D2326`.
  - Background and color transition over .15s.
- **Day detail** (group mode, sticky bottom): `#1D2326`, radius 18, shadow `0 10px 30px rgba(29,35,38,.25)`. Shows the date, "3 of 5 free", and chips for each active person: free people in their color, busy people struck through on `rgba(255,252,245,.12)`.

#### Where tab
- **Add card**: "Add a place…" input with an Add button (48px), and an optional "Why? (optional)" input. Enter submits.
  - On add, the user auto-approves the place. Toast: "Added {name}. Make the case for it?" with a **Write pitch** action.
  - Duplicate name → toast "{name} is already on the list."
- **Line**: "Thumbs up any you'd go to. Ranked by thumbs."
- **Veto status bar** (`#EDE5D4`): "You have one veto. Use it on a place you'd skip the trip for." / "Your veto is on {X}. Tap another to move it."
- **Destination card**: radius 18. The border turns `#E9B9A8` if vetoed.
  - Rank number; name (Bricolage 700 21); cost "~$372 / person" (14 700 `#0F5F66`); note; "Added by X".
  - Veto flag pill (`#F6DCD3` / `#8E2A17`): "Vetoed by Leo".
  - Big count (Bricolage 800 30), with "thumb"/"thumbs" below it.
  - Approver chips in each person's color.
  - **Pitch button**:
    - Has a pitch: solid border, `#F4EFE4` bg. Label "See the pitch", sub "{n} words · {c} comments · drafted with X".
    - No pitch: dashed `#B9AE96` border. Label "Pitch this place", sub "Nobody has made the case yet. Write one or draft it with AI."
  - **Actions**:
    - "I'd go" / "You're in" (filled when on).
    - "Veto" / "Your veto": `#A3311C` outline, filled when mine.
    - "Remove" text link, with undo.
  - **Veto toasts**: "You vetoed X. That was your one veto." / "Veto moved from X to Y." / "Veto removed. You can use it elsewhere."
- Tapping the name or the pitch button opens the pitch.

### 3. Pitch `/t/[slug]/p/[id]`
- **Sticky top bar**: "← All places", with the trip name on the right.
- **Hero**:
  - "PITCHED BY MAYA · DRAFTED WITH …" (13 600 uppercase .07em).
  - Name (Bricolage 800 38/1).
  - Map link (teal, pin icon) if a `Where:` line exists.
  - Two stat tiles: "~$372 / per person, est." and "4 / people want to go".
  - Veto pill; then "Anyone in the group can add to this."
- **Canvas card**: `#FFFCF5`, 1.5px border (`#1D2326` while editing), radius 20, padding 18.
  - **Empty**: "Make the case for {name}" (Bricolage 700 22), the sub "One page, anything goes. Tap an idea to start, or send your AI below.", and dashed idea chips. Each chip starts editing with a starter line already in place:
    - The vibe → `Why we should go: `
    - Where → `Where: `
    - Where we'd stay → `Stay: `
    - Getting there → `Getting there: `
    - Day by day → `Day 1: \nDay 2: \nDay 3: `
    - Must-dos → `- `
    - Cost per person → `Cost per person: ~$`
  - Below the chips, a "Start writing" button.
  - **Filled**: label "THE PITCH" (or "THE PITCH · VIA MAYA'S AI") with an Edit button, then the parsed blocks.
    - `# ` → heading (Bricolage 700 19).
    - `Day N:` → teal small-caps "DAY N" lead (52px column).
    - `- ` / `• ` → bullet.
    - `Label: text` (label 2–24 letters) → teal small-caps label + text.
    - Other lines → paragraph (16/1.5).
    - Blank line → 10px gap.
    - URLs are stripped from the line and rendered as dark pills: "airbnb.com ↗".
  - **Reaction row** for the whole pitch (👍 😍 🤔 💸): 36px pills showing a count. Mine is highlighted `#EDE5D4` with a `#1D2326` border; the tooltip lists names.
  - **Editing**: textarea min 360px (16/1.55). "Add an idea" chips append the starter line on a new line. Helper: "Links turn into buttons. Write "Cost per person: ~$400" and it shows on the vote card." Save / Cancel.
- **"Send your AI" card**: `#1D2326`, collapsible, with the content described in the Agent API section.
- **Comments & questions**:
  - Header with "{n} open questions".
  - Each comment: 32px avatar, name, a "QUESTION" tag (`#FBE6C9`/`#7A4A0E`) or "ANSWERED" tag (`#DCEBE5`/`#1F5A43`), the text, and "Mark answered" (anyone can tap it) on open questions.
  - Composer: input + Send, and an "? Ask as a question" toggle. The placeholder becomes "Ask {pitcher} something…".
- **Fixed bottom vote bar**: fades from transparent to `#F4EFE4`. "I'd go"/"You're in" (flex 1, 52px pill, shadow) and "Veto".

### 4. Name sheet (bottom sheet)
- Scrim `rgba(29,35,38,.45)`; sheet `#FFFCF5`, top radius 24, grab handle.
- Title "Who's this?" with copy about remembering you on this phone.
- **Person rows**: 54px, with a 36px color avatar, the name, a lock icon if locked, and a right sub: "You" / "Signed in" / "{n} days" / "No days yet".
- "Not on the list?" (or "You're first. What's your name?") + input + Join.
- Divider, then "Joined on another device?" + "Continue with Google". Cancel appears only if the user already has an identity.

### Toast
- Fixed bottom, `#1D2326`, radius 14, ≥52px, auto-hides after 4.5s.
- Optional action button on `#E06A33` (Undo / Write pitch).

## Design tokens
**Colors**
- Ink `#1D2326` · Page `#F4EFE4` · Surface `#FFFCF5` · Track `#E8E0CF` · Chip bg `#EDE5D4`
- Border `#E3DAC7` · Input border `#D9CFBA` · Dashed `#B9AE96`
- Muted text `#5E5D56` · Subtle text `#6B6A63` · Disabled `#A9A595`
- Accent orange `#E06A33` · Everyone-free `#C2491C` · Teal `#0F5F66` · Teal tint `#E4EEEC`
- Danger `#A3311C`, with veto pill `#F6DCD3`/`#8E2A17` and veto border `#E9B9A8`/`#E2B3A4`
- Question `#FBE6C9`/`#7A4A0E` · Answered `#DCEBE5`/`#1F5A43`
- Dark-card internals: `#272E31` field, `#3A4247` border, `#C9C4B6` muted, `#E8E3D6` text
- Person colors: `oklch(0.86 0.07 H)` bg / `oklch(0.3 0.07 H)` fg, with hues assigned in join order: 35, 165, 255, 330, 95, 210, 10, 290.

**Type**
- Display: **Bricolage Grotesque** (500/700/800, opsz 12–96).
- UI: **Instrument Sans** (400–700). Load both via `next/font/google`.
- Scale: 46 / 38 / 34 / 30 / 28 / 22 / 21 / 19 / 18 / 17 / 16 / 15 / 14 / 13 / 12 / 11. Display headings use negative tracking (−0.01 to −0.035em). Small caps labels: uppercase, .06–.08em.

**Radius**: 6 (logo) · 10–12 (inputs/cells) · 14 (buttons/rows) · 18 (cards) · 20 (main cards) · 24 (sheet top) · full pills.

**Shadows**: tab `0 1px 3px rgba(29,35,38,.12)` · floating `0 10px 30px rgba(29,35,38,.25–.3)` · vote bar `0 6px 20px rgba(29,35,38,.15)`.

**Spacing**: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 28.

## Config knobs (were prototype tweaks)
`WEEK_STARTS_MONDAY=false` · `MIN_RANGE_DAYS=2` · `PUBLIC_VETOES=true` (if false, the flag reads "Vetoed" / "2 vetoes" without names).

## Assets
No images. The icons are simple inline SVG strokes (share, thumbs-up, veto circle-slash, pin, lock, link); use `lucide-react` equivalents: `Share`, `ThumbsUp`, `Ban`, `MapPin`, `Lock`, `Link`. Emoji are used only for reactions.

## Suggested file layout
```
app/page.tsx                         create + recent
app/t/[slug]/page.tsx                hub (server: load trip; client: tabs)
app/t/[slug]/p/[destId]/page.tsx     pitch
app/t/[slug]/opengraph-image.tsx
app/api/agent/[token]/route.ts (+ places/…, comments/…)
app/api/auth/[...nextauth]/route.ts
lib/db/schema.ts · lib/db/index.ts (neon-http)
lib/trip-derive.ts                   heatmap, ranges, ranking, cost/location parse, blocksOf()
lib/actions.ts                       server actions (join, toggleDay, addDest, approve, veto, removeDest, savePitch, react, comment, markAnswered, linkGoogle)
components/…                         NameSheet, DateGrid, RangeList, DestinationCard, PitchCanvas, SendYourAI, Comments, Toast
```

## Files in this bundle
- `Trip Planner.dc.html` — the full interactive prototype (all screens, sample data, logic).
- `support.js` — runtime needed to open the prototype locally.
