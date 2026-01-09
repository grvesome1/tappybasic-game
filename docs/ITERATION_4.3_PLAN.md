# Iteration 4.3 — Admin Snapshot Endpoint + 3D Map Adapter (Data Spine)

## Goal
Add an admin-only JSON endpoint that returns a complete "ops snapshot" (epochs, claims, exclusions, catalog health) and a small frontend adapter that turns that snapshot into a generic nodes+links graph for your 3D metrics map.

**No UI rewrites.** This is the data layer you can wire into your existing 3D scene.

## What’s included
### Backend (Vercel /api)
- `api/admin/snapshot.js`
  - `GET /api/admin/snapshot`
  - Requires session cookie + admin allowlist.
  - Returns:
    - daily + weekly settlement pointers
    - claimable records (last settled epoch/week)
    - activity scores (today + current week)
    - payout exclusion list
    - catalog coverage + guardrail flags
- `api/_lib/admin.js`
  - Server-side admin allowlist helper.
  - Env: `GA_ADMIN_ADDRS` (recommended).
- `api/_lib/exclusions.js`
  - (If you don’t already have it) payout exclude helper.

### Frontend (public)
- `public/gruesome-arcade-3d-map-adapter-v1.0/ga3d-admin-adapter.js`
  - `getAdminSnapshot()` + `snapshotToGraph()`

## Required env vars
- `GA_ADMIN_ADDRS` = comma/space separated list of admin wallet(s).  
  Example: `0xYourWallet,0xSecondAdmin`

Optional fallback (not recommended):
- If `GA_ADMIN_ADDRS` is not set, the endpoint falls back to `ECON_PAYOUT_EXCLUDE_ADDRS`.

## Smoke tests
1) Auth + allowlist:
- Logged out: `GET /api/admin/snapshot` → `401 not_authenticated`
- Logged in but not admin: → `403 admin_only`
- Logged in as admin: → `200 ok:true`

2) Snapshot fields present:
- `epoch.lastSettledYmd`
- `week.lastSettledYw`
- `catalog.guardrails.*`

3) 3D adapter:
- Import `ga3d-admin-adapter.js` and call `getAdminSnapshot()`.
- Pass result into `snapshotToGraph()` → nodes+links.

## Notes
- This endpoint is intentionally *read-only*.
- Admin “roll-down payouts” still happens in your **settlement** logic (exclude admin wallet from distributions).
