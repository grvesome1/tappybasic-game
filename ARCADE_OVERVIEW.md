# Gruesøme’s Arcade — System Overview (Jan 3, 2026)

This document explains how the arcade works end-to-end: what runs in the browser, what runs on the backend, how games communicate with the dashboard, how Arcade Credits (AC) and runs are handled, and how leaderboards + payouts are calculated.

> Note: This repo contains both older “Tappy Rocket” docs and the newer multi-view Arcade Dashboard + Vercel API architecture. This overview describes the current **arcade dashboard** model.

---

## 1) High-level architecture

At a high level, the arcade is:

- A **static dashboard SPA** served from `public/` (main entry: `public/index.html`).
- A set of **embedded games** (usually iframes) that talk to the dashboard via `postMessage`.
- An optional **Vercel serverless backend** under `api/` that stores authoritative state in Redis/KV (Upstash REST / Vercel KV).
- **Vercel Cron** jobs that run daily and weekly settlement to produce claimable payouts.

### Runtime components

- **Dashboard shell (browser):** UI, navigation, wallet view, PRO state, local fallbacks, iframe management.
- **Game iframe(s) (browser):** gameplay loop; requests runs; submits results.
- **Leaderboard UI bundle (browser):** a drop-in UI loaded into the leaderboard view.
- **Backend (serverless):** validates run submissions, updates leaderboards/activity, computes epoch/week state, and returns leaderboard rows.

---

## 2) Frontend: the dashboard shell

### Entry point and views

The primary UI is a single HTML app:

- `public/index.html`

It manages navigation between views like:

- Play
- Wallet
- Leaderboard
- Proposals
- Settings

The page renders these views and toggles visibility based on internal state.

### Embed-only intent + iframe rules

The arcade uses internal iframes (games, access gate, and occasionally external viewers). Deployment sets restrictive headers:

- `X-Frame-Options: SAMEORIGIN`
- CSP `frame-ancestors 'self'`

(see `vercel.json`).

This means:

- The arcade can frame its own same-origin pages.
- Third-party sites generally cannot embed the arcade.

---

## 3) Game embedding + message protocol

### How games are embedded

The dashboard loads a game into an iframe (the “portal”). The selected game is driven by the **catalog**:

- `public/arcade-games.json`

Each game entry typically includes:

- `id`, `name`
- `embedUrl`
- `runCostAC`, promo configuration
- `metrics` (for multi-metric leaderboards)

### Run lifecycle (conceptual)

1. Dashboard selects a game and loads the iframe.
2. Game notifies readiness.
3. Game requests a run (paid/promo/free as applicable).
4. Dashboard grants/denies the run based on AC balances and rules.
5. After gameplay, game submits a run result (score, duration, etc).
6. Dashboard submits to backend (if enabled), or falls back to local-only behavior.

### postMessage

The dashboard and game communicate via `window.postMessage`.

- Dashboard → game (examples): sync state, run grants, promo claimed
- Game → dashboard (examples): ready, request run, run result

The dashboard should only accept messages from the active game iframe window.

---

## 4) Player state: credits, XP/level, PRO

### Local vs server-authoritative state

The dashboard persists a large amount of state under `localStorage` keys prefixed with `arcade.`.

When the backend is available and a session exists, the backend becomes authoritative for:

- balances (paid AC + promo AC)
- XP/level
- run records

When offline / API unavailable, the dashboard uses local-only fallbacks.

### Arcade Credits (AC)

AC is the in-game unit used to start runs and drive the economy:

- Runs can be `paid` (consume paid AC), `promo` (consume promo AC), or free.
- Paid-only activity is what drives payout “activity” scoring in the v2 backend.

### PRO

PRO is a tiered membership state used for perks and (in v2) identity visibility rules.

---

## 5) Leaderboards (v2)

The current leaderboard view is a **drop-in bundle** under:

- `public/gruesome-arcade-leaderboard-ui-v2.0/`

The dashboard loads:

- `leaderboard.css`
- `leaderboard-panel.html`
- `leaderboard.js`

into a host container in the leaderboard view.

### Multi-metric boards

Per-game leaderboards support multiple metrics (examples):

- score (higher is better)
- time (lower is better)

The catalog (`public/arcade-games.json`) defines a game’s metrics and default metric.

### Eligible vs all

Leaderboard queries often include:

- `eligible=1` → paid-only leaderboard variant (used for payouts)
- `eligible=0` → all runs leaderboard

### Hover identity (nickname + avatar)

The v2 UI supports hover previews.

Backend enrichment comes from:

- `api/leaderboard/top.js`
- `api/_lib/user.js`

Visibility rule (as implemented in v2 patch docs):

- Nickname/avatar are only returned publicly when **PRO is active** AND **SBT is locked** (`PRO_SBT_UNLOCKED` is NOT truthy).

---

## 6) Backend overview (Vercel serverless + Redis/KV)

### Storage layer

The backend stores state in Upstash Redis / Vercel KV via REST.

- Wrapper: `api/_lib/redis.js`
- Key scheme: `api/_lib/keys.js`

If Redis/KV is not configured, many endpoints return `redis_not_configured`.

### Key endpoints (v2)

- Run submission:
  - `api/run/submit.js`
- Leaderboard query:
  - `api/leaderboard/top.js`
- Epoch status:
  - `api/epoch/status.js`
- Settlement:
  - `api/epoch/settle.js` (daily)
  - `api/week/settle.js` (weekly)
- Weekly claim:
  - `api/week/claim.js`
- Profile patch (nickname/avatar set-once + normal profile fields):
  - `api/ledger/profile.js`

> Note: The dashboard references additional endpoints like `/api/session`, `/api/ledger/balance`, `/api/ledger/buy`, `/api/promo/claim`, etc. Those handlers may exist in another snapshot/branch or were intentionally excluded from the Iteration 2 bundle.

---

## 7) Epochs, payouts, and cron

### Epoch status

The dashboard and leaderboard UI read status from:

- `api/epoch/status.js`

It includes:

- daily epoch info (last settled day, claimable record)
- weekly epoch info (last settled week, weekly claimable record)
- activity-derived ticket counts

### Settlement

Settlement is intended to be cron-driven:

- Daily: `/api/epoch/settle`
- Weekly: `/api/week/settle`

Cron is configured in:

- `vercel.json`

Default schedules in this repo:

- daily: `0 0 * * *` (00:00 UTC)
- weekly: `5 0 * * 1` (Monday 00:05 UTC)

Weekly reserve percentage:

- `ECON_WEEKLY_RESERVE_PCT` (default 15)

---

## 8) Offline behavior and caching

The repo includes a service worker:

- `public/sw.js`

And the dashboard includes explicit “offline fallback” behavior when API calls fail.

Documenting tip:

- When debugging user reports, always note whether the backend is enabled + whether cookies/session exist, because the UI can appear to “work” locally even when the server is absent.

---

## 9) Deployment and configuration

Primary config:

- `vercel.json` (static output dir, rewrites, headers, cron)

Local dev:

- `npm run dev` (serves `public/`)

Backend env vars (typical):

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Optional env vars:

- `ECON_WEEKLY_RESERVE_PCT=15`
- `PRO_SBT_UNLOCKED=1`

---

## 10) Gotchas (read this first when something seems “broken”)

1. **Some pages/endpoints referenced by the dashboard may not exist in this repo snapshot** (e.g., `/access/`, `/api/session`). If you see 404s, check whether you’re on the right branch/bundle.
2. **Framing restrictions are intentional** (`SAMEORIGIN` + `frame-ancestors 'self'`).
3. **LocalStorage drives a lot of UI state**; “Reset everything” clears `arcade.*` and can fix strange client-side behavior.
4. **PoH checks are permissive by default** if no PoH API is configured (see `api/_lib/poh.js`).
5. **Identity hover is PRO-gated**: nickname/avatar visibility depends on PRO active + SBT lock.

---

## Appendix A: Quick smoke checks

Replace `$BASE` with your deployment URL.

- Daily skill score (paid-only):
  - `curl -s "$BASE/api/leaderboard/top?board=skill&period=daily&gameId=moonshot&metric=score&eligible=1"`
- Weekly skill time (all):
  - `curl -s "$BASE/api/leaderboard/top?board=skill&period=weekly&gameId=moonshot&metric=time&eligible=0"`
- Weekly activity:
  - `curl -s "$BASE/api/leaderboard/top?board=activity&period=weekly"`
- Epoch status (daily+weekly):
  - `curl -s "$BASE/api/epoch/status"`

---

## Appendix B: Source map (where to look)

- Frontend shell: `public/index.html`
- Catalog: `public/arcade-games.json`
- Leaderboard UI bundle: `public/gruesome-arcade-leaderboard-ui-v2.0/`
- Backend endpoints: `api/`
- Backend libs: `api/_lib/`
- Deployment + headers + cron: `vercel.json`
- Patch notes: `README_V2_PATCH.txt`, `README_V2_LEADERBOARD_UI.txt`
