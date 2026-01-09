# Public UI Prompt — "Accepted Payment Methods" (Gruesøme Arcade)

You are implementing the *public* (non-admin) UI updates for Gruesøme Arcade.

## Goal
Add a clean, safe, high-trust way to tell users exactly what the arcade accepts for payments **right now**, based on on-chain config.

## Requirements
### 1) Single Source of Truth (on-chain)
- Read from the deployed `ArcadePaymentsRouterV2` contract.
- Always include **native ETH** (on Linea) as accepted (payToken = `address(0)`), even though it is not in the token allowlist mapping.
- For ERC20 tokens, use:
  - `router.getTokenList()` (list of tokens ever allowlisted)
  - `router.tokenAllowed(token)` to filter *currently enabled* tokens

### 2) Display
Create an "Accepted Payment Methods" component used in:
- Checkout modal/page
- Credits purchase page
- PRO mint page
- Footer / Help center entry

For each accepted method show:
- Token icon (fallback to generated identicon)
- Symbol + name (read via `ERC20.symbol()` / `name()`)
- Network label (e.g., "Linea Sepolia" / "Linea")
- A short note:
  - ETH: "Native gas token"
  - LINEA / TBAG / RUSTYAI / mUSD: "ERC20"

### 3) Safety + UX
- If the user's wallet is on the wrong chain, show a clear warning and a "Switch network" action.
- If the user selects an ERC20 token:
  - show their current token balance
  - show allowance state (approved / not approved)
  - provide an "Approve" step before "Pay"
- Show a disclaimer:
  - "Some payments are routed to the treasury and may be converted to fund reward payouts. This does not change your price or receipt." (keep it short)

### 4) Web2/Web3 mesh clarity
In the same UI area, add a small explainer:
- "You can pay with: (1) Arcade Credits (Web2), or (2) On-chain tokens (Web3)."
- If a user pays on-chain, they receive an on-chain receipt and your backend credits their account.

### 5) Engineering constraints
- No hardcoding token lists in the frontend (except ETH).
- Cache token metadata for 10 minutes (symbol, decimals, icon URL) to avoid rate-limiting and spam RPC calls.
- Handle bad/missing ERC20 metadata gracefully.

## Deliverable
- A React component (or your framework equivalent) that renders accepted methods.
- A config file that holds:
  - router address per environment
  - chain id per environment
- Unit tests for:
  - ETH always displayed
  - token list filtering using tokenAllowed
  - wrong-chain warning shown
