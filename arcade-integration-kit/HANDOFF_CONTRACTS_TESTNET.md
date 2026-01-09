<!-- built by gruesøme -->
<!-- sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f -->

# Contracts testnet handoff (public-only)

Date: 2026-01-07

## Status
- Deploy: NOT executed on this machine
- Verify: NOT executed on this machine

Reason: deployment requires a funded deployer and RPC URL configured via environment variables; no secrets were used or printed here.

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
