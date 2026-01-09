Arcade v2 Leaderboard (Iteration 2)

Includes:
- Backend: weekly payouts reserve + multi-metric / game-type-aware leaderboards (from Iteration 1)
- Frontend: full Leaderboard UI replacement (drop-in bundle)
- Catalog sync: arcade-games.json includes per-game metrics + defaultMetric
- Identity: nickname + PRO avatar PNG hover (public only while PRO is active AND SBT is locked)

FILES INCLUDED (drop-in overwrite)
- vercel.json
- api/_lib/keys.js
- api/_lib/games.js
- api/_lib/user.js
- api/run/submit.js
- api/epoch/settle.js
- api/epoch/status.js
- api/week/{settle.js,status.js,claim.js}
- api/leaderboard/top.js
- api/ledger/profile.js
- public/index.html
- public/arcade-games.json
- public/gruesome-arcade-leaderboard-ui-v2.0/{leaderboard-panel.html,leaderboard.css,leaderboard.js}

INSTALL (recommended)
1) Unzip this bundle at your repo root and overwrite when prompted.
2) Deploy.
3) Verify cron:
   - Daily settle: /api/epoch/settle
   - Weekly settle: /api/week/settle (Mondays 00:05 UTC by default)
4) Optional env:
   - ECON_WEEKLY_RESERVE_PCT=15   (default 15)
   - PRO_SBT_UNLOCKED=1          (when truthy, public nickname/avatar are hidden; intended for when you unlock SBT / make tradeable)

HOW TO SET NICKNAME + AVATAR PNG (set-once)
- POST /api/ledger/profile?address=0x...
  { patch: { nickname: "My Name", avatarPng: "ipfs://..." , avatarTokenId: "123" } }
Rules:
- nickname: 2..20 chars, letters/numbers/space/_-.
- avatarPng: must start with ipfs:// or https://
- set-once: subsequent attempts return nickname_locked / avatar_locked.
- visibility: only shown publicly if PRO is active and PRO_SBT_UNLOCKED is NOT set.

LEADERBOARD API QUICK CHECK
- Skill (paid-only) daily:
  /api/leaderboard/top?board=skill&period=daily&gameId=moonshot&metric=score&eligible=1
- Skill (all runs) weekly:
  /api/leaderboard/top?board=skill&period=weekly&gameId=moonshot&metric=time&eligible=0
- Activity weekly:
  /api/leaderboard/top?board=activity&period=weekly

If patching via VS instead of overwriting:
- Apply the included patch file(s) with git apply, or manually copy files listed above.
