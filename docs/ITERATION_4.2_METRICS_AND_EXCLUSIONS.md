# Iteration 4.2 — Multi-metric Run Submit + Payout Exclusions

// built by gruesøme — SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

## Goals
1) Make **multi-metric leaderboards actually work** end-to-end (run submit writes correct values per metric id, not everything-as-score).
2) Add **house/admin payout exclusions** so specific wallets can appear on leaderboards but **never receive payouts** (payouts slide to next eligible).

## New/Updated Env Vars
- `ECON_PAYOUT_EXCLUDE_ADDRS`
  - Comma/space-separated list of wallet addresses to exclude from payouts/claims
  - Example: see `iteration-4.2/snippets/payout_exclude_env.example.txt`
- (Optional) `ECON_SKILL_FETCH_EXTRA` (default 100)
- (Optional) `ECON_ACTIVITY_FETCH_EXTRA` (default 500)

## What Changed

### 1) Server: payout exclusions
Files:
- `api/_lib/exclusions.js` (new helper)
- `api/epoch/settle.js` (excluded wallets filtered out of Skill/Activity/PRO/Lottery payouts)
- `api/week/settle.js` (excluded wallets filtered out of weekly Skill/Activity/PRO payouts)
- `api/epoch/claim.js` + `api/week/claim.js` (hard-block excluded wallets from claiming)
- `api/epoch/status.js` + `api/week/status.js` (adds `excludedAddrs` + `payoutExcluded`)

Behavior:
- Excluded wallets can still play and appear on leaderboards.
- They will **not** receive payout claims.
- When an excluded wallet ranks in a paying position, payout distribution skips them and pays the **next eligible** addresses (fetching extra leaderboard entries to fill the winner set).

### 2) Server: multi-metric run submit correctness
File:
- `api/run/submit.js`

Fixes:
- `normalizeMetrics()` no longer defaults `src` to `"score"` for every metric.  
  If `src` is missing, it defaults to the metric’s **own id**.
- `metricEncValue()` now reads metric values from:
  - `body.metrics[metricId]` (preferred)
  - `body[metricId]`
  - fallback to `score` / `durationMs`
  - derived helpers for `efficiency` and `accuracyBp` when possible
- Missing **ASC** metric values are treated as **worst** (max clamp / sentinel) so “missing” can’t become a #1 time.

### 3) Admin UI: identity persistence compatibility
File:
- `public/gruesome-arcade-admin-ui-v1.0/admin.js`

Fix:
- “Save Identity” now POSTs to `/api/ledger/profile?address=...` using `{ patch: { nickname, avatarPng } }` (matches your existing profile API shape).

## Apply Instructions (do this in your repo)
1) `git status -sb` must be clean  
2) `git checkout -b iteration-4.2-metrics-exclusions`
3) Copy folders/files from `iteration-4.2/` into repo root (**overwrite allowed only for these paths**):
   - `api/_lib/exclusions.js`
   - `api/run/submit.js`
   - `api/epoch/settle.js`
   - `api/week/settle.js`
   - `api/epoch/status.js`
   - `api/week/status.js`
   - `api/epoch/claim.js`
   - `api/week/claim.js`
   - `api/leaderboard/top.js`
   - `public/gruesome-arcade-admin-ui-v1.0/admin.js`
4) Set env var `ECON_PAYOUT_EXCLUDE_ADDRS` (at least your admin wallet)
5) Run quick checks:
   - `node --check api/run/submit.js`
   - `node --check api/epoch/settle.js`
   - `node --check api/week/settle.js`
6) Commit:
   - `git add -A`
   - `git commit -m "Iteration 4.2: multi-metric submit + payout exclusions"`

## QA Checklist

### Multi-metric
- Submit a run for `stormhouse2` with metrics:
  - `waves`, `kills`, `accuracyBp`, `inRunSpendAC`, `durationMs`, etc.
- Confirm `/api/leaderboard/top?board=skill&period=daily&gameId=stormhouse2&metric=waves` returns sane ordering.
- Confirm `metric=durationMs` respects metric direction (asc/desc) according to config.

### Payout exclusions
- Add your wallet to `ECON_PAYOUT_EXCLUDE_ADDRS`
- Ensure you still appear on leaderboards.
- Run settle locally (or trigger scheduled settle) and confirm excluded wallet does **not** get claim records.
- Attempt `/api/epoch/claim` from excluded wallet → returns `403 payout_excluded`.


## Optional: Moonshot (Arcade bridge + authoritative runs)
Files:
- `public/games/moonshot/arcadeBridge.js` (new)
- `public/games/moonshot/moonshot.js` (run gating + RUN_RESULT message)
- `public/games/moonshot/index.html` (HUD becomes display-only in embedded mode; reads `ARCADE:SYNC`)

Behavior:
- When embedded in the Arcade iframe, Moonshot will not start until the parent grants a run.
- On game over, Moonshot emits `ARCADE:RUN_RESULT` with `{ gameId, runId, score, durationMs }`.
- The local “promo/credits” HUD no longer mutates local storage while embedded.
