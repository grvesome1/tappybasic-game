# Iteration 3.5 — Claims Pipeline Stabilization (Daily + Weekly)

## What shipped
1) **New backend endpoint**
- `POST /api/epoch/claim`
  - Mirrors the existing `POST /api/week/claim`
  - Marks the most recently settled daily epoch as claimed (or returns `note:no_rewards`).

2) **Leaderboard UI resilience**
- `public/gruesome-arcade-leaderboard-ui-v2.0/leaderboard.js`
  - Claim buttons now work even if `__ARCADE_LB_ADAPTER__` does NOT implement `claimDaily()` / `claimWeekly()`
  - Uses same-origin POSTs directly:
    - `/api/epoch/claim`
    - `/api/week/claim`
  - Adds optimistic “claimed” disables so users don’t double-click spam the claim buttons.

## Why
- Your v2 leaderboard UI already shows daily + weekly claim amounts, but claim buttons depended on adapter methods.
- This iteration makes claims “just work” with the server routes you already have.

## Smoke tests
- `curl -s https://YOUR_DOMAIN/api/epoch/status`
- Daily claim (requires session cookie):
  - `curl -i -X POST https://YOUR_DOMAIN/api/epoch/claim`
- Weekly claim:
  - `curl -i -X POST https://YOUR_DOMAIN/api/week/claim`

## Notes
- Both claim routes enforce same-origin and PoH (unless session is demo).
- If you want “claim” to be on-chain later, keep these routes as *proof/quote endpoints* instead of side-effecting “claimed”.
