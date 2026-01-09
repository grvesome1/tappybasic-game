Gruesøme’s Arcade — Leaderboard V2 Patch (Iteration 2)

What this patch includes
- Backend: weekly settlement + multi-metric leaderboards (from Iteration 1) + nickname/avatar enrichment
- Frontend: full Leaderboard UI replacement (drop-in bundle) + hover avatar preview + multi-metric selector
- Catalog: arcade-games.json updated with per-game metrics + coming soon support

How to apply (recommended)
1) Back up your repo / commit your current work.
2) Unzip this patch folder over your repo root (so api/, public/, vercel.json overwrite).
3) Deploy.

Notes
- Nickname + avatar PNG are only returned publicly when PRO is active AND PRO_SBT_UNLOCKED is NOT set.
  (This matches your "visible while active and SBT" requirement.)
- Weekly reserve defaults to 15% via ECON_WEEKLY_RESERVE_PCT (can override as env var).

Smoke checks (replace BASE)
- Daily skill score (paid-only):  curl -s "$BASE/api/leaderboard/top?board=skill&period=daily&gameId=moonshot&metric=score&eligible=1"
- Weekly skill time (all):        curl -s "$BASE/api/leaderboard/top?board=skill&period=weekly&gameId=moonshot&metric=time&eligible=0"
- Weekly activity:                curl -s "$BASE/api/leaderboard/top?board=activity&period=weekly"
- Epoch status (daily+weekly):    curl -s "$BASE/api/epoch/status"
