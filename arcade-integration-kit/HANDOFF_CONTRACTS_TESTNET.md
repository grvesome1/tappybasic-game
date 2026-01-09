<!-- built by gruesøme -->
<!-- sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f -->

# Contracts testnet handoff (public-only)

Date: 2026-01-09

## Status
- Deploy: COMPLETED on Linea Sepolia
- Verify: PENDING (Hardhat 3 verify plugin not yet compatible)
- Post-deployment wiring: COMPLETED

## Deployed Contracts (Linea Sepolia - chainId 59141)

| Contract | Address |
|----------|---------|
| ArcadePaymentsRouterV2 | `0xF22c4c91d88c6C715d3665576b2b6593AFb63Ff2` |
| ArcadeTreasuryVault | `0xb0CEebad1cbD423907aFBBc6CFF1b5F4b772cB11` |
| ArcadeEpochVaultDaily | `0x2dFe2dADa92667DE107A4c24569e0c52FF7Dccc2` |
| ArcadeEpochVaultWeekly | `0xa4E1db4f37EBFFCCE0F59f1B2f75f8F0C1842Ab8` |
| ArcadeProAvatarV2 | `0x2cA2963fab7D0DD1AB3CB681205F5F12cED9178b` |
| ArcadePromo | `0x410BdB6D323A6A2262f4437CC02077E01034C950` |
| MockERC20_mUSD | `0x95B5fC14eEd5DF10A818818B65251aD55Af8CF99` |
| MockERC20_TBAG | `0x3e046d9058290B07cC662859c1D11f8219fad55F` |
| MockERC20_RUSTYAI | `0xCFfBAc928b448CA3B148B60701CBf0367016AAd9` |

**Deployer Address:** `0x3100fF9597B87E791E5bB8C0d57C94336A432089`

**Explorer Links:**
- Router: https://sepolia.lineascan.build/address/0xF22c4c91d88c6C715d3665576b2b6593AFb63Ff2
- Treasury: https://sepolia.lineascan.build/address/0xb0CEebad1cbD423907aFBBc6CFF1b5F4b772cB11

## Wiring Status
- PRO Avatar ← Router: ✅ Connected
- Router ← PRO Avatar: ✅ Connected
- Tokens allowed (mUSD, TBAG, RUSTYAI): ✅ Configured
- Treasury payout vaults (Daily, Weekly): ✅ Allowlisted
- TBAG/RUSTYAI marked as reserve: ✅ Done

## Framework
- Hardhat: present (`hardhat.config.ts`)
- Solidity: 0.8.20
- Optimizer: enabled, runs=200
- `viaIR`: true

## Networks configured
- `lineaSepolia` (chainId 59141) via `LINEA_SEPOLIA_RPC_URL`
- `linea` (chainId 59144) via `LINEA_RPC_URL`

## Compile evidence
- This handoff repo can be compiled locally without secrets.
- Do not treat any previously-generated build folders as evidence; compile on the deployer machine and keep the console output.

## Deploy command (example)
Run on the contracts machine after setting env vars (do not paste keys):
- `npm ci`
- `npx hardhat compile`
- `npx hardhat run scripts/deploy.ts --network lineaSepolia`

After deploy, record (public):
- Deployer address
- Contract addresses
- Tx hashes + block numbers
- Explorer links
- Whether verify succeeded

## Verify command (example)
- `npx hardhat verify --network lineaSepolia <ADDRESS> <CONSTRUCTOR_ARGS>`

## Where artifacts/ABIs live
- Hardhat artifacts: `artifacts/contracts/<Contract>.sol/<Contract>.json`

## Public deployment record
- See `deployments/testnet.json` for the machine-readable record.
- After deploying, fill in: deployer address, contract addresses, tx hashes, block numbers, and verify status.

## Verification checklist (before publishing any addresses)
- Confirm `chainId` matches the target network.
- Confirm router address is non-zero.
- Confirm EIP-712 quote domain fields (name/version/chainId/verifyingContract) match what the backend signs.
- Confirm accepted tokens list from on-chain state (allowlist) before listing tokens publicly.
