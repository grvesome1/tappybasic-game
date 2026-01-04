# Iteration 3.4 – Leaderboard UI v2.1 (Bundle-only)

built by gruesøme

SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

## What changed

This iteration is **frontend-only** and only touches the Leaderboard v2 bundle files under:

- `public/gruesome-arcade-leaderboard-ui-v2.0/leaderboard-panel.html`
- `public/gruesome-arcade-leaderboard-ui-v2.0/leaderboard.css`
- `public/gruesome-arcade-leaderboard-ui-v2.0/leaderboard.js`

No backend changes. No index.html changes.

## Fixes and improvements

- **Period buttons fixed** (Daily/Weekly/All now works) by correctly binding to `data-ga-lb-period-btn`.
- **Payout card now reads real epoch data** from `/api/epoch/status` shape:
  - daily + weekly claimable amounts now display correctly
  - countdown uses `nextEpochAtUtc` / `nextWeekAtUtc`
  - week activity uses `weekActScore`
- **Leaderboard header updates dynamically** (game/metric/period + paid-only status).
- **Metric formatting expanded**: supports `int`, `ms`, `bp`, `pct`, and `usd` formats (future-proof).
- **Row rendering aligned to CSS**: replaces the unstyled “table” markup with the existing `.gaLB__rows` UI.
- **Avatar hover fixed + animated**:
  - adds missing `clamp()` helper so hover card positioning works
  - hover layout matches CSS (`gaLB__hoverTop`, `gaLB__hoverInfo`)

## Smoke test

1. Open Leaderboard tab.
2. Toggle:
   - Skill vs Activity
   - Daily/Weekly/All
   - Paid-only toggle (Skill)
3. Hover any player row — if they have a PRO avatar PNG, it should display.
4. Verify Payout card:
   - countdown shows a real time
   - claimables show non-zero if you have claimable epochs

