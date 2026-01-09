# Gruesome Arcade Contracts (v2.1)

This package replaces the old `ArcadePayments` model with a **single universal payments router** that can accept multiple payment assets while keeping payout solvency anchored to **mUSD**.

**Contracts**
- `ArcadePaymentsRouterV2.sol`  
  Universal purchase router (credits, PRO mint/renew, and future SKUs). Verifies **EIP-712 signed quotes** from the backend, routes funds, and emits canonical receipts.
- `ArcadeTreasuryVault.sol`  
  Custody vault for **non-mUSD** payments (e.g., TBAG, RUSTYAI, ETH). No swaps; just holds assets + owner withdraw.
- `ArcadeProAvatarV2.sol`  
  PRO Avatar NFT (SBT-first) + nickname + membership tier/expiry. **Payment removed**; mint/renew is router-only.
- `ArcadeEpochVault.sol` (unchanged)  
  Merkle-claim vault for payouts (reward token e.g., mUSD).
- `ArcadePromo.sol` (unchanged)  
  Optional promo receipt contract.
- `MockERC20.sol` (unchanged)  
  Local testing token.

---

## Key Design Rules

### 1) Only mUSD is "direct pot funded"
- If `payToken == mUSD`, the router splits and transfers **on-chain immediately**:
  - ops → `opsWallet`
  - daily pot → `dailyPot`
  - weekly pot → `weeklyPot`
  - treasury reserve → `treasuryVault` (only for SKUs that include it)
- If `payToken != mUSD` (TBAG/RUSTYAI/ETH/etc), the router **defaults** to transferring the **full payment** to `treasuryVault` and emitting the intended split amounts in the `PaymentExecuted` event.
  - **Optional direct OPS routing (non‑mUSD):** enable `setDirectOpsToken(token, true)` to route the **OPS portion** directly to `opsWallet` in that same token (e.g. “25% straight to ops wallet in TBAG”), while the remainder (pots + reserve allocations) stays in `treasuryVault` for custody and off‑chain conversion to mUSD.

This guarantees **mUSD solvency**: payout vaults/pots are only funded by actual mUSD transfers, never by volatile-token IOUs.

### 2) Backend settlement uses on-chain receipts + pot balances
The backend should treat the router as the canonical purchase ledger:
- Index `PaymentExecuted` events.
- For reward funding, count only events where `directPotFunding=true` (mUSD payments) or, even simpler, read the **mUSD balance** of `dailyPot`/`weeklyPot`.

For TBAG/RUSTYAI payments:
- Credits/mints can still be granted (because the backend-signed quote defines value),
- but **payout funding** happens only after ops converts treasury assets into mUSD and deposits mUSD into the pot/vault addresses.

---

## Default Splits (Basis Points)

Configured in `ArcadePaymentsRouterV2` constructor (editable by owner):

### Credits purchase (KIND_CREDITS)
- ops: **700 bps** (7%)
- daily pot: **7905 bps** (79.05%)
- weekly pot: **1395 bps** (13.95%)
- treasury: **0 bps**

> Note: Inside the daily pot, the **off-chain epoch settlement** can still apply your payout weighting  
> e.g. **55% skill / 35% activity / 10% PRO boost** (not enforced on-chain by the router).

### PRO mint / renew (KIND_PRO_MINT / KIND_PRO_RENEW)
- ops: **2500 bps** (25%)
- daily pot: **0 bps**
- weekly pot: **5000 bps** (50%)
- treasury: **2500 bps** (25%)

---

## Deployment Checklist

1) Deploy `ArcadeTreasuryVault(owner)`
2) Deploy `ArcadeProAvatarV2(owner)`
3) Decide addresses for:
   - `opsWallet`
   - `dailyPot` (mUSD receiver; can be a multisig or a vault address)
   - `weeklyPot` (mUSD receiver)
   - `quoteSigner` (backend signing key)
4) Deploy `ArcadePaymentsRouterV2(owner, mUSD, treasuryVault, opsWallet, dailyPot, weeklyPot, quoteSigner)`
5) Set router in PRO contract:
   - `ArcadeProAvatarV2.setPaymentsRouter(router)`
6) Allow tokens (examples):
   - `router.setTokenAllowed(mUSD, true)` already done
   - `router.setTokenAllowed(TBAG, true)`
   - `router.setTokenAllowed(RUSTYAI, true)`
7) Set SKU kinds:
   - `router.setSkuKind(bytes32Sku, KIND_*)` for each SKU (see `SKU_LIST.md`)

---

## Docs

- `SKU_LIST.md` – standardized SKUs (credits packs + PRO tiers, mint vs renew)
- `EIP712_QUOTE_TYPES.md` – copy/paste typed data definitions for backend signer
- `BACKEND_QUOTE_ENDPOINT_SPEC.md` – endpoint spec to keep the UI fast + manipulation-resistant
