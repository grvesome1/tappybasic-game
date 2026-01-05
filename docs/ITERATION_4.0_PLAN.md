# Iteration 4.0 — Docs + Spec Sync

Last updated: 2026-01-05

## Included in Iteration 4.0 (this bundle)
- Updated documents:
  - Game Integration Guide v1.1 (PDF + TXT)
  - Embedding Guide v1.1 (PDF + TXT)
  - Launch Reference v1.1 (PDF + TXT)
- Updated Pitch Deck v3.2 (PPTX + PDF)
- Updated Contracts/Backend README v1.3 (weekly reserve + multi-metric + Gen1 avatar notes)

## Why this matters
The codebase has moved fast (weekly reserve, multi-metric leaderboards, claims UX).
This iteration makes the reference documents match the actual architecture so future changes stay coherent.

## Next iteration proposal (4.1): Admin transparency + admin page
### Goals
- Admin UI visible only to a hardcoded admin wallet address (client-side gating).
- Admin wallet appears on leaderboards with an ADMIN badge, but is excluded from payouts.
- Admin can deposit/withdraw reward token, view epoch/week summaries, and open block-explorer links.

### Minimal implementation (no new deps)
Backend:
- Add env var `ECON_PAYOUT_EXCLUDE_ADDRS` and filter excluded wallets during settlement.
- Add endpoints under `/api/admin/*` with strict checks:
  - require server secret OR require SIWE-style signature from admin wallet.
- Add read-only endpoints:
  - vault balances
  - epoch + week summary snapshots

Frontend:
- New lazy-loaded bundle:
  - public/gruesome-arcade-admin-ui-v1.0/admin-panel.html
  - admin.css
  - admin.js
- Only show Admin tab if connected wallet matches ADMIN_WALLET_ADDRESS.

### Transparency behaviors
- If admin places #1 on an eligible leaderboard, payouts shift to #2.
- Admin payouts are always 0 (explicit in summary).

## Next iteration proposal (4.2): Finalize Moonshot “launch-ready”
- Confirm ArcadeBridge gating is fully integrated
- Remove remaining local economy authority
- Ensure run metrics submission includes durationMs and supports chosen default metric
- Add robust timeout UX + “open wallet” hint
