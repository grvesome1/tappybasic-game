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

## Splits + Payout Weighting (how to think about it)

There are three layers that work together:

### Layer A — On-chain splits (router enforced)
`ArcadePaymentsRouterV2` computes a basis-points split for each `kind` and enforces the actual transfers:
- For **mUSD** payments, pots can be funded immediately (direct pot funding).
- For **non-mUSD** payments, funds are custody-routed to `treasuryVault` while the intended split is still emitted as a receipt.

Important:
- The exact bps values are **configurable** (constructor + owner-admin updates).
- Treat any numbers as **environment-specific** until confirmed.

How to verify current splits before publishing them:
- Read from the deployed router (recommended), OR
- Read from the deployment manifest if it is populated with real addresses (non-zero) and treated as SSOT.

### Layer B — Treasury conversion policy (ops process)
For non-mUSD inflows (ETH/TBAG/etc), payouts become solvent once ops converts treasury assets into mUSD and deposits mUSD into the intended pot/vault destinations.

### Layer C — Epoch distribution weighting (off-chain settlement)
Within a funded pot, epoch settlement can apply additional weighting rules (e.g., skill/activity/pro-boost weighting). This weighting is a settlement policy and is not enforced by the router.

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
