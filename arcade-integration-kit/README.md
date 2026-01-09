# Gruesøme Arcade — Final Deployment Package v2.4

This folder is a **ready-to-deploy Hardhat package** for the Arcade's v2.4 payout + payment routing system (Web2 credits + Web3 receipts + on-chain reward pools).

## What's inside

### Smart contracts
- `ArcadePaymentsRouterV2.sol` — EIP-712 quote-verified payments router + per-kind split routing
  - v2.3 adds `dataHash` binding for PRO mint payloads so user-generated PNG/metadata can't be swapped after pricing.
  - v2.4 adds on-chain token discovery (`getTokenList`) so your UI can show all accepted payment tokens.
- `ArcadeEpochVault.sol` — Merkle-root epoch vault for scalable daily/weekly payouts (**now includes `claimMany` for batching**)
- `ArcadeProAvatarV2.sol` — PRO membership NFT (SBT-locked by default)
- `ArcadePromo.sol` — Promo/discount controls (role-based)
- `ArcadeTreasuryVault.sol` — Treasury custody vault + direct/batch withdrawals + **keeper-limited auto-conversion**
  - `reserveToken(token)=true` labels for tokens you want to hold long-term (e.g., TBAG/RUSTYAI).
  - v2.4 adds a restricted "keeper" that can swap **only configured assets** (ETH + LINEA) into mUSD and fund payout vaults.
- `MockERC20.sol` — Optional test token for mUSD when you don't have a deployed one

### Deployment + ops scripts
- `scripts/deploy.ts` — Deploy all contracts + wire them + optionally hand off ownership/roles to your multisig
- `scripts/verify.ts` — Verify on Lineascan using the constructor args saved by the deploy script
- `scripts/signQuote.ts` — Generate an EIP-712 quote signature (dev/testing)
- `scripts/epoch/buildMerkle.ts` — Build Merkle root + proofs from a winners list
- `scripts/epoch/publishEpoch.ts` — Sign + publish an epoch to the daily or weekly vault
- `scripts/treasury/ensureLiquidity.ts` — Ensure the target vault is funded for the next epoch; if not, top up from treasury mUSD or swap ETH/LINEA -> mUSD and send directly to the vault
- `scripts/admin/setKindSplits.ts` — Set per-kind split basis points (owner only)

### Docs
Everything relevant that was provided is copied into `docs/`.

## Quickstart

```bash
cp .env.example .env
npm i
npm run compile

# Deploy to Linea Sepolia
npm run deploy:linea-sepolia

# Verify (optional)
npm run verify:linea-sepolia
```

## Enabling TBAG / RUSTYAI payments (buyback treasury flow)
If you want users to pay with ecosystem tokens (e.g., TBAG, RUSTYAI) without forcing immediate selling:

1) Set in `.env` (Linea Sepolia or mainnet addresses):

```bash
TBAG_TOKEN_ADDRESS=0x...
RUSTYAI_TOKEN_ADDRESS=0x...
```

2) Deploy normally.

Behavior:
- The router will accept TBAG/RUSTYAI as payment tokens (allowlisted).
- Because they are **not mUSD**, the router routes the full amount to `ArcadeTreasuryVault`.
- The treasury holds those tokens **as those tokens** by default (the keeper cannot auto-swap them unless you explicitly enable it).

This reduces immediate sell-pressure, but it does not guarantee price stability — that depends on liquidity and market conditions.

## PRO mint payload binding (user-generated PNG avatars)
For `KIND_PRO_MINT`, v2.3 requires that the signed Quote includes `dataHash = keccak256(abi.encode(tokenURI, dnaHash, nickname))`.

The frontend then calls:

```solidity
processPayment(quote, sig, abi.encode(tokenURI, dnaHash, nickname))
```

Users still fully control their PNG + metadata; this only prevents swapping the payload after the backend priced/signed the quote.

After deploying, addresses are saved to:

```
deployments/<network>.json
```

## Default split policy (KIND_CREDITS)
This package sets the **default** credits split to match the discussed policy:

- **7%** ops
- **10%** treasury
- remaining **83%** to payout pools (keeps the old 85/15 daily/weekly ratio):
  - **70.55%** daily
  - **12.45%** weekly

You can override splits any time via `setKindSplits` (recommended via multisig).

## "Automatic" daily/weekly payouts
On-chain payouts are claim-based (Merkle), but you can automate:

1. Compute winners + amounts off-chain (from your Web2 metrics)
2. Build Merkle root + proofs (`scripts/epoch/buildMerkle.ts`)
3. **Ensure payout liquidity** (`scripts/treasury/ensureLiquidity.ts`) — auto-converts ETH/LINEA into mUSD if needed
4. Sign + publish the epoch (`scripts/epoch/publishEpoch.ts`)
4. Either:
   - let users claim (normal), or
   - run a relayer that batch-claims using `claimMany` for selected users (gas paid by you)

See docs in `docs/Arcade_Platform_Payout_System_Upgrade_Plan.pdf`.

## Accepting ETH (native) + LINEA (ERC20) on Linea
On Linea, the native gas token is ETH.

If you also want to accept the LINEA ERC20 token:

```bash
LINEA_TOKEN_ADDRESS=0x...
```

Your UI should display accepted tokens by reading:
- `ArcadePaymentsRouterV2.getTokenList()` (then filter by `tokenAllowed(token)`), and
- always include **native ETH** (payToken = `address(0)`).

## Treasury auto-conversion: ETH/LINEA -> mUSD for payouts (v2.4)
To make daily/weekly payouts fully automated, v2.4 introduces a restricted `keeper`:

- `keeper` can ONLY:
  - swap configured assets into mUSD using a V3-style DEX router, and
  - send mUSD ONLY to allowlisted payout vaults.

Configure in `.env`:

```bash
TREASURY_KEEPER_ADDRESS=0x...
TREASURY_KEEPER_PRIVATE_KEY=...

SWAP_ROUTER_ADDRESS=0x...
QUOTER_ADDRESS=0x...
WETH_ADDRESS=0x...

V3_FEE_WETH_MUSD=3000
V3_FEE_LINEA_WETH=3000
V3_FEE_LINEA_MUSD=

SWAP_SLIPPAGE_BPS=300
SWAP_DEADLINE_SECONDS=900
```

Then, before publishing any epoch, run:

```bash
EPOCH_VAULT_KIND=daily EPOCH_DISTRIBUTION_JSON=./data/daily.json npm run treasury:ensure-liquidity:linea-sepolia
EPOCH_VAULT_KIND=weekly EPOCH_DISTRIBUTION_JSON=./data/weekly.json npm run treasury:ensure-liquidity:linea-sepolia
```

If liquidity is insufficient, the script fails and you should top up the treasury (ETH/LINEA/mUSD) or adjust routes.

## PRO mint payload binding (v2.3)
For user-generated avatars, the frontend passes `abi.encode(tokenURI, dnaHash, nickname)` as the `data` param.
In v2.3 the backend must include `dataHash = keccak256(data)` in the signed Quote, and the router enforces it.

This keeps user-generated PNG avatars fully supported while preventing payload tampering between quote issuance and mint.
