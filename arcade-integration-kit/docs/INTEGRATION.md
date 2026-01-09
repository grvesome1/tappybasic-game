<!-- built by gruesøme -->
<!-- sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f -->

# Arcade Integration Kit — Integration Guide (v2.4.1)

This repo is the **contracts + deployment + SDK** side of Gruesøme Arcade.

Goals:
- Single source of truth for **addresses**, **chain IDs**, and **EIP-712 quote domain/types**.
- Deterministic, auditable deployments via `deployments/arcade.<chain>.json` manifests.
- Minimal scripts for Admin/backends to drive on-chain behavior.

## Networks

- Linea Sepolia: `chainId = 59141` (Hardhat network name: `lineaSepolia`)
- Linea Mainnet: `chainId = 59144` (Hardhat network name: `linea`)

## Quickstart

### 1) Install

- `npm install`

### 2) Compile

- `npx hardhat compile`

### 3) Deploy

Set env vars (examples):
- `DEPLOYER_PRIVATE_KEY`
- `LINEA_SEPOLIA_RPC_URL` / `LINEA_RPC_URL`

Then:
- `npm run deploy:linea-sepolia`
- `npm run deploy:linea`

Deploy writes:
- `deployments/arcade.lineaSepolia.json` or `deployments/arcade.lineaMainnet.json` (SSOT)
- `deployments/latest.json` (copy of the latest manifest)
- `deployments/<hardhatNetwork>.json` (legacy compatibility)

### 4) Export ABIs to the SDK

- `npm run abis:export`

This writes ABI JSON files into:
- `packages/arcade-contracts-sdk/src/generated/abi/*.abi.json`

### 5) Export UI config (addresses + accepted payments)

- `npm run export:ui-config -- --network lineaSepolia`

This writes:
- `deployments/ui-config.lineaSepolia.json` or `deployments/ui-config.lineaMainnet.json`

### 6) Print accepted payments (on-chain allowlist)

- `npm run print:accepted-payments -- --network lineaSepolia`

Notes:
- ERC20 allowlist is `ArcadePaymentsRouterV2.getTokenList()` filtered by `tokenAllowed(token)`.
- Native ETH is always considered accepted (pay token = `address(0)`).

## EIP-712 Quotes (backend → frontend → router)

The backend signs an EIP-712 `Quote` with the router’s configured `quoteSigner` address.
The router enforces:
- `buyer == msg.sender`
- expiry (`expiresAt`)
- one-time use (quote digest replay protection)
- correct signer (`quoteSigner`)

**Domain version** is `2.4` for this kit (read from the deployed router during deploy).

PRO mint metadata binding:
- For `KIND_PRO_MINT`, backend should set `quote.dataHash = keccak256(abi.encode(tokenURI,dnaHash,nickname))`.
- Frontend submits `processPayment(quote, sig, abi.encode(tokenURI,dnaHash,nickname))`.

See:
- `docs/BACKEND_QUOTE_ENDPOINT_SPEC.md`
- `docs/EIP712_QUOTE_TYPES.md`

## SDK usage

The workspace includes a TypeScript SDK:
- `packages/arcade-contracts-sdk`

Typical flow:
- Load manifest
- Read on-chain allowlists and addresses
- Hash/verify quotes client-side for debugging

## Backend kit

The workspace includes a small backend helper package:
- `packages/arcade-backend-kit`

It includes helpers to:
- Encode `sku` + `ref` to bytes32
- Compute PRO `dataHash`
- Build and sign a quote using the manifest’s EIP-712 domain

## Operational notes

- After deploy, transfer ownership/roles to the intended multisig.
- Treat non-mUSD payments (TBAG/RUSTYAI/ETH) as treasury receipts until converted to mUSD and deposited into payout vaults.
