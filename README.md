# Gruesøme's Arcade — Contracts + Backend Reference (v1.3)

built by gruesøme  
SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

This README is the “single source of truth” for how the on-chain contracts + backend epoch logic
fit together for launch.

## What’s new in v1.3
- Weekly reserve + weekly claim pipeline (in addition to daily epochs).
- Multi-metric leaderboards (catalog-defined metrics; game-type-aware scoring).
- PRO Avatar nickname + optional one-way “unlock transfers” (Gen1 collectible upgrade).
- Admin transparency hooks (payout exclusion list; admin page planned).

---

## System map (one paragraph)

Players buy Credits (AC) using ETH. The Arcade backend is the authority for balances, run grants,
leaderboards, and payouts. Games run in iframes and request run grants via ArcadeBridge messages.
Runs are submitted server-side and aggregated into daily epochs; a configurable percent of each day’s
net pot is reserved into a weekly pot that settles weekly. Users claim payouts via the backend,
which pays out from the on-chain EpochVault.

---

## Contracts

### ArcadePayments.sol
- Accepts ETH payments.
- Emits events the backend can reconcile into Credits.
- Has an admin-controlled treasury.

### ArcadeEpochVault.sol
- Holds reward token (mUSD / stable).
- Pays claims after the backend settles epochs.

### ArcadePromo.sol
- Optional promo allocations.
- Can be disabled at launch; promos never create payout eligibility.

### ArcadeProAvatar.sol (v1.2)
- ERC-721 that is both PRO membership + Avatar.
- One per wallet (tokenId = uint160(wallet)).
- Status stored on-chain: tier + expiry.
- tokenURI written once (Gen1 avatar image lock).
- Nickname written once at mint.
- Transfers/approvals locked by default (SBT), with optional one-way admin unlock to tradable later.

---

## Backend: epochs, leaderboards, claims

### Leaderboards
Server uses Redis ZSETs:
- Daily / Weekly / All-time per game and metric.
- “Paid-only eligible” leaderboards (used for Skill payouts).

Multi-metric support:
- The catalog (public/arcade-games.json) defines metrics[] + defaultMetric per game.
- API reads metric rules (direction/clamp) for ranking.

### Daily epoch settlement
- Settles at UTC midnight (`/api/epoch/settle` cron).
- Uses paid-only eligible daily leaderboards for Skill pool.
- Uses activity ZSET for Activity + PRO + Lottery weighting.

Default daily splits (net pot):
- 55% Skill pool (rank-based)
- 35% Activity pool (paid activity)
- 10% PRO boost pool
- Optional lottery % is taken from Activity (configurable)

### Weekly reserve + weekly settlement
- Each day’s net pot contributes a reserve % into a weekly pot.
- Weekly settle is cron’d (`/api/week/settle`) Monday 00:05 UTC.
- Weekly claims are exposed via `/api/week/claim`.

### Claim endpoints
- Daily:  `/api/epoch/status` + `/api/epoch/claim`
- Weekly: `/api/week/status`  + `/api/week/claim`

Wallet UX can call adapter methods (preferred), or fall back to direct API POST.

---

## Admin transparency (payout exclusion)
For transparency, an admin wallet can:
- appear on leaderboards with an “ADMIN” label
- be excluded from payouts (rewards shift to next eligible player)

Implementation recommendation:
- env var: ECON_PAYOUT_EXCLUDE_ADDRS="0xabc...,0xdef..."
- settlement logic filters these addresses out before distributing pools

---

## Environment variables (backend)
- ECON_TAKE_PCT (default: 10)
- ECON_WEEKLY_RESERVE_PCT (default: 15)
- ECON_PAYOUT_EXCLUDE_ADDRS (default: empty)
- REDIS_URL / KV binding (depends on deployment)
- TREASURY_ADDRESS, VAULT_ADDRESS, etc (deployment)

---

## Notes
- Games MUST NOT submit leaderboards directly in embedded mode.
- ArcadeBridge “run grant gating” is required for payout compatibility.

