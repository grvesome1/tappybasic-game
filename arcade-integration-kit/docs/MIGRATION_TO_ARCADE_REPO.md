<!-- built by gruesøme -->
<!-- sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f -->

# Migration into the main Arcade repo

This repository is intentionally self-contained (“integration kit”) so it can be either:

1) vendored into the Arcade repo (recommended when you want CI gates and deterministic artifacts kept in the same monorepo), or
2) consumed as an external dependency (recommended when you want the kit versioned and released independently).

## Option A: Vendor into Arcade repo (script-assisted)

From this repo root:

- Dry run:
  - `npm run migrate:vendor -- --target "C:\\path\\to\\arcade-repo"`
- Actually write:
  - `npm run migrate:vendor -- --target "C:\\path\\to\\arcade-repo" --no-dry-run`

By default this writes into `arcade-repo/arcade-integration-kit/`.

Notes:
- The script never deletes anything.
- The script intentionally does not copy `.github/workflows/` (workflow merging is repo-specific and should be done manually).

## Option B: Consume as dependency

If the Arcade repo is using a package manager that supports workspaces well (pnpm/yarn), you can publish the SDK/backend-kit and consume them normally.

Minimum viable approach:
- Consume `@gruesome/arcade-contracts-sdk` (or your chosen package name).
- Consume `@gruesome/arcade-backend-kit`.
- Copy `deployments/*.json` (or host them in a shared artifact bucket) and point runtime config at them.

## What to migrate

At minimum:
- `deployments/` (SSOT manifests + schema)
- `packages/arcade-contracts-sdk/`
- `packages/arcade-backend-kit/`
- `scripts/` (validation, ABI export, offline smoke)
- `docs/` (integration + admin call reference)

If you want the same hardening gates:
- merge the workflow steps from this repo’s `.github/workflows/ci.yml` into the Arcade repo CI
- keep running: manifest validation, ABI drift guard, watermark validation, EIP-712 vector validation, offline smoke
