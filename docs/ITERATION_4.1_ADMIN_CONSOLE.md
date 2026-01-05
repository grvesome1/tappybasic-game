# Iteration 4.1 — Admin Console + Payout Exclusion (Spec + Drop-in UI)

> built by gruesøme
> SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

## What this iteration adds

1) **A new Admin Console UI bundle** (no build step):
- `public/gruesome-arcade-admin-ui-v1.0/admin-panel.html`
- `public/gruesome-arcade-admin-ui-v1.0/admin.css`
- `public/gruesome-arcade-admin-ui-v1.0/admin.js`

2) **A clear backend requirement**: the admin wallet MUST be excluded from payouts (daily + weekly) so that:
- Admin can appear on leaderboards for transparency
- Admin never receives payouts
- **Ranks roll down** (if admin is #1, payouts start at #2)

## Frontend integration checklist

### 1) Copy the admin UI bundle into the repo

Copy these files into:

- `public/gruesome-arcade-admin-ui-v1.0/`

### 2) Hardcode the admin wallet in `public/index.html`

Add once near your other global config:

```js
window.__GA_ADMIN_WALLET__ = '0xYOUR_ADMIN_WALLET_HERE';
```

### 3) Add a new tab/view in the SPA (lazy-loaded)

Follow the existing pattern you already use for Wallet and Leaderboard v2:

- Create a host element (example):
  - `<div id="adminV1Host"></div>`
- Create a lazy loader:
  - loads `admin.css`
  - fetches + injects `admin-panel.html`
  - loads `admin.js`

**Gate visibility**:
- Only show the Admin nav item when:
  - wallet is connected AND
  - `address.toLowerCase() === window.__GA_ADMIN_WALLET__.toLowerCase()`

### 4) Optional: add `ethers` global if you want "gameId string -> bytes32" promo config

Admin Console can set promo by gameId string **only if** `window.ethers` exists.
If you don’t already load ethers, either:
- load it once globally, or
- use the Admin Console “Advanced bytes32” field.

## Backend integration checklist (required)

### 1) Add `ECON_PAYOUT_EXCLUDE_ADDRS`

Set an env var in Vercel:

```
ECON_PAYOUT_EXCLUDE_ADDRS=0xYOUR_ADMIN_WALLET_HERE
```

(You can support multiple by comma-separating.)

### 2) Exclude addresses in BOTH settlement paths

You must filter excluded addrs in:
- `api/epoch/settle.js` (daily)
- `api/week/settle.js` (weekly)

Rules:
- **Skip excluded addresses when selecting winners from ZSETs**
- Pull extra rows (e.g. topN*3) so you can still pay topN after filtering
- **Renormalize weights** among remaining winners so 100% of each pool is distributed

### 3) Block excluded addresses from claiming (defense-in-depth)

In:
- `api/epoch/claim.js`
- `api/week/claim.js`

If caller address is excluded:
- return `{ ok:false, error:'excluded', message:'This address is excluded from payouts.' }`

### 4) Mark excluded addresses in leaderboard responses (transparency)

In:
- `api/leaderboard/top.js`

For each entry:
- set `payoutEligible=false` when address is excluded
- set `badge='ADMIN'` (or similar) so the UI can render it

## What the Admin Console can do

- Set a **public** nickname + avatar image (calls `/api/ledger/profile`)
- View pot balances (ETH + mUSD) from the connected wallet provider
- Send on-chain admin transactions:
  - `ArcadePayments.withdrawPot(to, amountWei)`
  - `ArcadeEpochVault.sweepERC20(mUSD, to, amount)`
  - `ArcadeProAvatar.unlockTransfersPermanently()`
  - `ArcadePromo.setPromo(bytes32 gameId, uint256 grantAC)`
- Pull backend status JSON:
  - `/api/epoch/status`
  - `/api/week/status`

## QA checklist

1) Admin tab is hidden for normal users.
2) Admin tab appears ONLY when admin wallet is connected.
3) Admin wallet appears on leaderboard but has a clear `ADMIN` badge.
4) Daily+weekly settlement skips admin wallet and pays the next players.
5) Admin wallet cannot claim (returns `excluded`).
