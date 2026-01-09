# VS Terminal Prompt — Deploy Gruesøme Arcade v2.4 to Linea Sepolia

You are my dev agent. We are deploying the **contracts + payout system** from this repo to **Linea Sepolia** using Hardhat.

## Context
- I have: Hardhat, Foundry, Node, Vercel CLI, Git CLI.
- Target chain: Linea Sepolia.
- I want **ownership + admin roles handed off to multisig** (recommended), but I also want my Admin UI to be able to adjust revenue split % values (via multisig transactions).
- I want daily + weekly payouts to be **automated off-chain** (cron/workflows) by publishing epochs, and optionally pushing claims (batch claim).

## Your tasks
1. **Install + compile**
   - Run `npm i` and `npm run compile`.
   - Fix any dependency version issues (OpenZeppelin must match import paths).

2. **Prepare `.env`**
   - Copy `.env.example` to `.env`.
   - Fill:
     - `DEPLOYER_PRIVATE_KEY`
     - `LINEA_SEPOLIA_RPC_URL`
     - `LINEASCAN_API_KEY` (optional but preferred)
     - `MULTISIG_ADDRESS` (my Safe address)
     - `OPS_WALLET_ADDRESS` (can equal multisig)
     - `QUOTE_SIGNER_ADDRESS` (address that signs quotes)
     - `ORACLE_SIGNER_ADDRESS` (address that signs epoch publishes)
     - `MUSD_ADDRESS` (if none exists, leave blank to deploy MockERC20)
     - `TBAG_TOKEN_ADDRESS` (optional)
     - `RUSTYAI_TOKEN_ADDRESS` (optional)
     - `LINEA_TOKEN_ADDRESS` (optional; accept LINEA ERC20)

   - If you want automated payouts with auto-conversion (ETH/LINEA -> mUSD), also fill:
     - `TREASURY_KEEPER_ADDRESS` (hot key address)
     - `TREASURY_KEEPER_PRIVATE_KEY` (used by liquidity script)
     - `SWAP_ROUTER_ADDRESS` (V3-style router, e.g., PancakeSwapV3)
     - `QUOTER_ADDRESS` (V3 quoter v2)
     - `WETH_ADDRESS` (wrapped ETH on Linea)
     - `V3_FEE_WETH_MUSD`, `V3_FEE_LINEA_WETH` (and optional `V3_FEE_LINEA_MUSD`)
     - `SWAP_SLIPPAGE_BPS`, `SWAP_DEADLINE_SECONDS`

3. **Deploy**
   - Run: `npm run deploy:linea-sepolia`
   - Confirm it writes `deployments/lineaSepolia.json`.
   - Confirm router is wired to pro avatar.
   - Confirm final handoff happened: router owner, pro avatar owner, treasury vault owner = multisig; epoch vault + promo roles transferred.

4. **Verify on explorer**
   - Run: `npm run verify:linea-sepolia`
   - If verify fails due to Lineascan API URL differences, update `hardhat.config.ts` customChains to the correct endpoints and re-run.

5. **Sanity checks (read-only)**
   - Read router config:
     - `mUSD`
     - `treasuryVault`, `opsWallet`, `dailyPot`, `weeklyPot`
     - `kindSplits(KIND_CREDITS)` should be (700,7055,1245,1000)
   - Read epoch vault config:
     - `rewardToken`
     - `oracleSigner`

6. **Create a smoke test quote**
   - Create `tmp/quote.json` that purchases credits (kind=1) using mUSD.
   - Generate signature via `scripts/signQuote.ts` and execute purchase from a test wallet.

   - (Optional PRO mint test) Ensure quote includes `dataHash` and call `mintProAvatar` with matching payload.

7. **Set up payout automation scaffolding**
   - Add a GitHub Actions workflow or Vercel Cron that runs:
     - build winners list (placeholder for now)
     - `scripts/epoch/buildMerkle.ts`
     - `scripts/treasury/ensureLiquidity.ts` **(fund pots; auto-convert ETH/LINEA if needed)**
     - `scripts/epoch/publishEpoch.ts` (daily + weekly)
   - For now, implement a fake winners list generator to prove the pipeline.

## Output required
- A short deployment log with:
  - contract addresses
  - confirmation of ownership/roles handoff
  - the explorer links
- A checklist of what to do next for mainnet.
