# Admin UI Prompt — Adjustable Splits + Payout Ops (Gruesøme Arcade)

You are implementing the Admin UI (Web2 + Web3) for the Gruesøme Arcade platform.

## Goals
1. Let admins **adjust split percentages per payment kind** on-chain.
2. Let admins **publish daily/weekly epochs** to the EpochVault.
3. Let admins do **direct payouts** (small batches) from the TreasuryVault.
4. Give admins a **minimal Treasury Overview** panel (balances + runway) and controls for the v2.4 keeper-based auto-funding.
5. Keep it safe: if ownership is a multisig, UI should only prep transactions (the Safe signs).

## Constraints
- WalletConnect/Reown project id: `d4a5e9e9b3d173f65e9d6f97ad6ec33b`.
- Chain: Linea Sepolia (now), mainnet later.
- Contracts:
  - ArcadePaymentsRouterV2
  - ArcadeEpochVault (daily + weekly)
  - ArcadeTreasuryVault

## Required UI modules

### 0) Treasury Overview (minimal, admin-only)
Show a single compact dashboard card with:
- Treasury address + "copy" button
- Balances (read-only):
  - ETH (native balance of TreasuryVault)
  - mUSD (ERC20 balance of TreasuryVault)
  - LINEA (if configured)
  - TBAG / RUSTYAI (if configured)
- Payout vault balances (mUSD): Daily + Weekly
- "Next payout requirement" (from your backend/dist JSON) and "funding gap" (required - vaultBalance)
- Most recent treasury events (optional): `VaultFunded`, `TreasurySwapExecuted`

Admin actions (keeper or multisig only):
- Button: "Fund vault from treasury mUSD" (calls `fundVaultMUSD(vault, amount)`)
- Button: "Auto-fund (swap if needed)" should NOT do on-chain quoting in the browser. Call a backend endpoint that:
  1) builds a swap plan using the DEX quoter,
  2) submits keeper tx to `swapETHForExactMUSDToVault` / `swapTokenForExactMUSDToVault`,
  3) returns tx hash + updated balances.

### 1) Split Editor (per kind)
- Read `kindSplits(kind)` from the router.
- Provide sliders or number inputs for:
  - opsBps
  - dailyBps
  - weeklyBps
  - treasuryBps
- Must enforce sum = 10000 client-side.
- Show "effective %" (bps / 100).
- Submit tx: `setKindSplits(kind, splits)`.
- Display `KindSplitsSet` event confirmation.

### 2) SKU Kind Binding
- UI to bind SKU => kind
- Submit tx: `setSkuKind(bytes32 sku, uint8 kind)`
- Show current binding if present.

### 3) Epoch Publisher
- Inputs:
  - ymd (YYYYMMDD)
  - merkle root
  - totalAmount
  - oracle signature (optional: generate server-side)
- Submit tx: `publishEpoch(ymd, root, totalAmount, oracleSig)`
- Show the published epoch + totals.

### 4) Direct/Batched Treasury Payouts
- Single payout:
  - `withdrawERC20(token, to, amount)`
  - `withdrawETH(to, amount)`
- Batch payout (small sets):
  - `batchWithdrawERC20(token, to[], amounts[])`
  - `batchWithdrawETH(to[], amounts[])`
- Add warnings about gas costs.

### 5) Payments Ops (optional)
- Toggle `setPaused(true/false)` on router.
- Toggle `setTokenAllowed(token, allowed)`.
- Toggle `setDirectOpsToken(token, enabled)`.

### 6) Treasury Reserve Tokens (v2.3)
- UI to mark a token as a "reserve" token the treasury intends to hold long-term
  (e.g., TBAG, RUSTYAI).
- Read `reserveToken(token)` from TreasuryVault.
- Submit tx: `setReserveToken(token, enabled)`.
- Explain in UI copy:
  - When users pay with a non-mUSD token, the PaymentsRouter routes the full amount to TreasuryVault.
  - Holding tokens in treasury reduces immediate sell-pressure, but does not magically guarantee price stability.

### 7) Treasury Auto-Conversion Controls (v2.4)
Owner-only (multisig) configuration screens to manage:
- `setKeeper(address)`
- `setSwapConfig(mUSD, WETH, router)`
- `setPayoutVault(vault, allowed)` (should include daily + weekly vaults)
- `setAutoConvertToken(token, enabled)` (use `address(0)` to represent native ETH)
- `setExactOutPathToMUSD(token, bytesPath)` (store exactOutput paths for ETH and LINEA)
- `setMaxSwapIn(token, cap)`

UX safety:
- Gate all owner-only actions behind an explicit "I understand" confirmation.
- For bytes paths, provide a helper UI that constructs the encoded path from token addresses + fee tiers, and shows the final hex.

## UX notes
- Add a "simulator" panel: user enters amountIn + token + kind, UI shows where funds will go based on current splits.
- Add a history panel reading events:
  - PaymentExecuted
  - CreditsPurchased
  - ProMinted / ProRenewed
  - Claimed / EpochPublished

## Deliverable
- Implement the UI screens + state management.
- Provide a single config file where I paste deployed addresses from `deployments/*.json`.
