# Deployment Clarifications (Staging + Prod)

built by gruesøme  
SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

Date: 2026-01-06  
Project: **gruesome.arcade** (prod) + **staging.gruesome.arcade** (staging)  
Network: **Linea Sepolia** for staging, mainnet for prod

This document is the single checklist for deploying, configuring, and validating the full stack:
- Static site (`public/`)
- Serverless functions (`/api/*`)
- Redis/KV state
- WalletConnect + PoH
- Contracts (deploy + verify)

---

## 0) Key assumptions (explicit)

- Hosting is **Vercel**.
- This repo is **not** a Next.js app; it uses Vercel’s “static + serverless functions” layout:
  - Static files in `public/`
  - Serverless handlers in `api/**`
- We want a stable staging URL and stable staging env vars → **staging is its own Vercel project**.

---

## 1) Required accounts / services

You will need access to:

1) **Git hosting** (GitHub recommended)
- repo must be connected to Vercel via Git integration.

2) **Vercel account**
- ability to create 2 projects and set env vars.

3) **DNS provider** for `gruesome.arcade`
- ability to add records for `staging.gruesome.arcade`.

4) **Redis/KV provider**
- Either **Vercel KV** or **Upstash Redis**.
- Must be separate per environment (staging vs prod).

5) **WalletConnect Cloud**
- Prefer separate WalletConnect projects for staging vs prod.

6) **Linea Sepolia** deployment tools
- Hardhat/Remix + a deployer wallet.

---

## 2) Git branches (recommended)

- `main` → production
- `staging` → staging (Linea Sepolia)

Rules:
- Any testnet-only changes (addresses, RPC, allowlists) land on `staging` first.
- Only merge `staging` → `main` when validated.

---

## 3) Vercel projects (recommended: 2 projects)

### 3.1 Production project
- Existing project: **gruesome.arcade**
- Connected branch: `main`
- Domain: `gruesome.arcade` (+ optional `www.gruesome.arcade`)

### 3.2 Staging project
- Create a new project: **gruesome-arcade-staging** (name can vary)
- Connected branch: `staging`
- Domain: `staging.gruesome.arcade`

Why 2 projects:
- A Vercel project has one “Production Branch”.
- We want staging to behave like production (stable env vars + stable URL).

---

## 4) DNS configuration

In the **staging** Vercel project:
- Add domain: `staging.gruesome.arcade`
- Vercel will provide required DNS record(s).

At your DNS provider:
- Add the record(s) Vercel specifies (usually CNAME).
- Wait for propagation.

---

## 5) Environment variables (staging vs prod)

### 5.1 Redis / KV (REQUIRED for full features)
The API uses Upstash REST Redis via `@upstash/redis`.

Set **one** of these pairs per environment:

Option A (Vercel KV style):
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Optional (read-only):
- `KV_REST_API_READ_ONLY_TOKEN` (read-only access; useful for read-only endpoints/diagnostics)

Option B (Upstash REST style):
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Critical requirement:
- **Use separate databases** for staging and prod.

Notes:
- If you provision Redis via **Vercel Marketplace** (Upstash), Vercel typically injects the
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` pair automatically for the selected environment.
- `KV_URL` / `REDIS_URL` are also supported as a fallback (TCP Redis URL) if REST credentials are not provided.
- Do not expose Redis/KV secrets client-side (including via `/api/config`).

### 5.2 PoH behavior (IMPORTANT for testnet)
Server PoH checks are implemented in `api/_lib/poh.js`.

Supported env vars:
- `POH_ALLOW_ALL=1` (bypass PoH checks; staging-only if needed)
- `POH_TIMEOUT_MS=3500` (optional)

Clarification:
- If the Linea PoH endpoints do not support Sepolia (common), you must either:
  - bypass PoH on staging (`POH_ALLOW_ALL=1`), OR
  - implement a staging allowlist (not currently implemented).

### 5.3 Session cookies
Server sessions are stored in Redis and referenced by an HttpOnly cookie.

Supported env vars:
- `SESSION_TTL_SECONDS` (default: 7 days)
- `COOKIE_SECURE=1` (forces Secure cookies)
- `SESSION_ALLOW_INSECURE_COOKIE=1` (NOT recommended; legacy only)

Clarification:
- `/api/session/establish` requires Redis configured with **write** access.
- The access gate calls `/api/session/establish` after PoH verify (best-effort).

### 5.4 WalletConnect
Required env var:
- `WALLETCONNECT_PROJECT_ID`

Minimum requirement:
- WalletConnect Cloud project must allow the domain(s) you will actually use:
  - Staging: `https://staging.gruesome.arcade`
  - Prod: `https://gruesome.arcade`

Recommendation:
- Use separate WalletConnect Cloud projects (and separate `WALLETCONNECT_PROJECT_ID` values) for staging vs prod.

Local dev:
- Ensure `WALLETCONNECT_PROJECT_ID` is available to `vercel dev` via `vercel pull` (see 5.6).

### 5.6 Local dev env sync (recommended)
If you develop locally using `vercel dev`, you should pull the same env vars that exist in Vercel.

Workflow:
1) Link the repo to the correct Vercel project:
  - `npx vercel link`
2) Pull env vars for local dev:
  - `npx vercel pull --environment=development`
3) Run local checks:
  - `npm run dev`
  - `npm run doctor`
  - `npm run smoke`

Tip:
- To avoid port-collision flakes, you can use the helper script `tools/verify-local.ps1`.

### 5.5 Chain / contract addresses
You will need environment-specific values for:
- chainId + RPC
- each deployed contract address

Clarification:
- This repo currently mixes runtime config in HTML/JS; ensure staging branch is updated with Sepolia addresses and prod branch with mainnet addresses.

---

## 6) Contracts (Linea Sepolia → Prod)

### 6.1 Staging (Linea Sepolia)
1) Deploy contracts to Linea Sepolia
2) Verify them on the Sepolia explorer
3) Record:
   - contract addresses
   - ABI expectations (if frontend depends on it)
4) Update staging config to point to Sepolia addresses

### 6.2 Production
1) Repeat deploy + verify on mainnet
2) Update prod config to point to mainnet addresses

Operational recommendations:
- Use a dedicated deployer wallet for staging and a different one for prod.
- Store private keys securely (never in repo).

---

## 7) Vercel deployment flow (recommended)

### 7.1 Staging deploy
- Push to `staging` branch
- Vercel staging project auto-deploys to `https://staging.gruesome.arcade`

### 7.2 Production deploy
- Merge `staging` → `main`
- Vercel prod project auto-deploys to `https://gruesome.arcade`

---

## 8) Validation checklist (what “done” means)

Run these checks on staging first, then prod.

### 8.1 Basic site health
- `/` loads without console errors
- Access gate loads: `/access/`

### 8.2 API reachability
- `GET /api/health` (if present) returns 200
- `GET /api/session` returns JSON `{ ok, authenticated, ... }`

### 8.3 Redis/KV configured (required for leaderboards/epochs)
- `GET /api/epoch/status` returns `redisEnabled: true`
- `GET /api/week/status` returns `redisEnabled: true`

### 8.4 Wallet + session
- Connect wallet (WalletConnect in incognito/mobile works)
- Complete PoH flow (or staging bypass)
- Confirm a server session exists:
  - After PoH verify, the gate calls `POST /api/session/establish`
  - Then `GET /api/session` should report `authenticated: true`

### 8.5 Gameplay + leaderboard
- Start a run
- Submit a score
- Confirm leaderboard updates

### 8.6 Admin
- Verify the admin wallet allowlist is correct for the environment
- Admin tab appears only for authorized wallet

---

## 9) Common gotchas (explicit)

1) **PoH on Sepolia**
- If PoH is mainnet-only, staging will never become “verified” unless bypassed.

2) **Redis not configured**
- Many endpoints return `redis_not_configured` or fall back.
- The app will look “offline” or won’t persist leaderboards.

3) **Cookie security**
- On HTTPS (Vercel), cookies should generally be `Secure`.
- If you test on non-HTTPS custom setups, Secure cookies won’t be saved.

4) **Hardcoded WalletConnect project id**
- If staging/prod need different WalletConnect projects, hardcoding will cause pain.

5) **Cron settlement**
- If enabled, ensure it points at the correct environment’s Redis.

---

## 10) What we still may want to implement (optional, but recommended)

- `/api/config` endpoint that returns:
  - network (chainId/RPC/explorer)
  - walletconnect project id
  - contract addresses
  so staging/prod can differ without branch-specific hardcoding.

- `/api/session/logout` to clear `ga_session` cookie cleanly.

---

## 11) Minimal “staging go-live” requirements (short)

To go live on `staging.gruesome.arcade`, you must have:
- Vercel staging project deployed from `staging`
- `staging.gruesome.arcade` DNS pointed to that project
- Staging KV/Redis configured
- Staging WalletConnect domain allowlisted
- Staging contract addresses (Linea Sepolia) wired
- A decision on PoH staging behavior (enforce vs bypass)
