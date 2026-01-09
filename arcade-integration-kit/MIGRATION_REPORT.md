<!-- built by gruesøme -->
<!-- sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f -->

# Arcade Integration Kit Vendoring Report

Generated: 2026-01-08T02:10:22.740Z

Source: C:\Users\grays\OneDrive\Desktop\gruesomes.arcade\gruesome-arcade-deploy-2.4
Target: c:\Users\grays\OneDrive\Desktop\gruesomes.arcade\arcade-integration-kit

Mode: WRITE

Planned files: 165

## Next steps inside the Arcade repo

- Decide whether to add this folder to the monorepo workspaces (recommended if you want to build the SDK/backend-kit in CI).
- If you want the CI gates and scheduled epoch workflows, copy/merge the workflows from this kit's .github/workflows into the Arcade repo root .github/workflows manually (this script intentionally does not copy workflows).
- Run the kit gates from the Arcade repo root, pointing into this folder, or by adding workspace entries.
