# Backend Quote Endpoint Spec (manipulation-resistant + fast UI)

This spec assumes:
- The backend is the **only quote signer** (`quoteSigner` in the router).
- The frontend never constructs prices; it only requests a signed quote and submits it on-chain.

---

## 1) SKU Catalog Endpoint (static)

### `GET /api/pay/skus`

Returns the canonical SKU table (same SKUs as `SKU_LIST.md`), plus what payment tokens are currently accepted.

**Response**
```json
{
  "chainId": 59144,
  "payTokens": [
    { "symbol": "mUSD", "address": "0x...", "decimals": 6, "directPotFunding": true },
    { "symbol": "TBAG", "address": "0x...", "decimals": 18, "directPotFunding": false },
    { "symbol": "RUSTYAI", "address": "0x...", "decimals": 18, "directPotFunding": false }
  ],
  "skus": [
    { "sku": "AC_1000", "kind": 1, "usdCents": 1000, "credits": 1050 },
    { "sku": "PRO_MINT_T2", "kind": 2, "usdCents": 2500, "tier": 2 }
  ]
}
```

Notes:
- This endpoint can be CDN cached (e.g., 60s–10m), because it is not security-critical.
- UI uses it to populate buy buttons instantly.

---

## 2) Quote Endpoint (signed)

### `POST /api/pay/quote`

**Purpose**
- Convert a requested SKU into a **server-signed** EIP-712 Quote.
- Quote includes the exact `amountIn` for the chosen `payToken`, so the router can verify and execute without any user-trust.

**Request**
```json
{
  "buyer": "0xBuyerAddress",
  "sku": "AC_1000",
  "payToken": "0xTokenAddress",
  "chainId": 59144,
  "ref": "campaign:launch" 
}
```

Rules:
- `buyer` is required; it is embedded in the signature and must match `msg.sender` on-chain.
- `sku` must be from the allowlisted SKU table.
- `payToken` must be allowlisted for the chain.
- `ref` is optional. Backend should sanitize and/or convert to `bytes32` (e.g., keccak256 of a short string).

**Response**
```json
{
  "domain": { "name": "GruesomeArcade PaymentsRouter", "version": "2.4", "chainId": 59144, "verifyingContract": "0xRouter" },
  "types": { "Quote": [ /* exactly as in EIP712_QUOTE_TYPES.md */ ] },
  "quote": {
    "buyer": "0xBuyerAddress",
    "sku": "0x...bytes32",
    "kind": 1,
    "payToken": "0xTokenAddress",
    "amountIn": "1234500000000000000",
    "usdCents": "1000",
    "credits": "1050",
    "tier": 0,
    "expiresAt": 1769999999,
    "nonce": "987654321",
    "ref": "0x...bytes32",
    "dataHash": "0x0000000000000000000000000000000000000000000000000000000000000000"
  },
  "signature": "0x..."
}
```

### Quote Signing Logic

1) Lookup `sku` → `{kind, usdCents, credits/tier}`
2) Compute `expiresAt = now + 60` (recommended 30–120 seconds)
3) Compute `nonce`:
   - Recommended: **monotonic per-buyer nonce** stored in Redis/DB, or a random 128-bit nonce stored with TTL.
4) Compute `amountIn`:
   - If payToken is **mUSD**:
     - `amountIn = usdCents * 10^(mUSD_decimals) / 100`
     - for 6 decimals: `amountIn = usdCents * 10_000`
   - If payToken is **TBAG/RUSTYAI**:
     - Use a **DEX quote** to estimate how many tokens equal `usdCents` worth of mUSD.
     - Cache price routes aggressively (5–15s TTL) for UI speed.
     - Apply a small safety margin (e.g., +0.5% to amountIn) to reduce "quote too low" risk.
5) Build EIP-712 typed data and sign with `quoteSigner`.

PRO mint metadata binding (v2.4)
- If kind == PRO mint, you MUST set `dataHash = keccak256(abi.encode(tokenURI, dnaHash, nickname))`.
- The frontend then calls `processPayment(quote, sig, abi.encode(tokenURI, dnaHash, nickname))`.
- This keeps user-generated PNG avatars fully supported while preventing payload swapping after pricing.

### Manipulation Prevention

- The router enforces:
  - EIP-712 signature by `quoteSigner`
  - `buyer == msg.sender`
  - `expiresAt >= now`
  - `quoteId` replay protection
- Backend additionally should:
  - Rate-limit quote requests per IP + per wallet
  - Enforce max SKU value per quote and per time window (anti-scrape / anti-spam)
  - Store `nonce` with TTL and mark it “used” when it sees the on-chain receipt
  - Reject mismatched `chainId`/router address

---

## 3) Backend Indexing + Settlement Hook

### On-chain receipt: `PaymentExecuted`
Backend listens/indexes:
- `quoteId`
- `buyer`
- `sku`, `kind`
- `payToken`, `amountIn`
- `usdCents`, `credits`, `tier`
- `opsAmount`, `dailyPotAmount`, `weeklyPotAmount`, `treasuryAmount` (intended split)
- `opsRouted`, `treasuryRouted` (actual transfers to ops/treasury)
- `directPotFunding`

**Credits granting**
- When kind = credits:
  - Grant `credits` to the buyer’s off-chain balance after observing the event.

**PRO status**
- When kind = PRO mint/renew:
  - Backend can read the on-chain membership (tier/expiry) from `ArcadeProAvatarV2.proStatus(buyer)`.

**Payout solvency rule**
- Only treat `directPotFunding=true` events as funded payout revenue.
- If `directPotFunding=false` but `opsRouted>0`, the OPS portion was routed directly to `opsWallet` in the payment token (enabled via `setDirectOpsToken`).
- For TBAG/RUSTYAI purchases:
  - Record the USD value for analytics/treasury reporting,
  - but do not include it in the payout pool until converted to mUSD and deposited into pot/vault addresses.

This is how you hold TBAG/RUSTYAI in treasury without ever over-promising mUSD payouts.
