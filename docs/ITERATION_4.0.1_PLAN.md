# Iteration 4.0.1 — Metrics Documentation + Pitch Alignment

Goal
- Make the **full leaderboard metric library** explicit and consistent across:
  - Pitch deck
  - Integration + embedding docs
  - Canonical JSON library used by the Arcade

What’s in this bundle
- **Pitch**
  - `pitch/gruesome-arcade-pitch-deck-v3.3.pptx`
  - `pitch/gruesome-arcade-pitch-deck-v3.3.pdf`
  - Adds a 2-slide appendix listing every metric ID + label + direction.

- **Docs**
  - `docs/gruesome-arcade-metrics-library-v1.0` (PDF + TXT)
  - Updated:
    - `docs/gruesome-arcade-game-integration-guide-v1.2` (PDF + TXT)
    - `docs/gruesome-arcade-embedding-guide-v1.2` (PDF + TXT)
    - `docs/gruesome-arcade-launch-reference-v1.2` (PDF + TXT)

- **Tools**
  - `tools/ensure-metrics-library.mjs`
  - `tools/metrics-library-canonical.json`

How to apply
1) Put the folder `iteration-4.0.1/` at repo root (do **not** commit it).
2) Copy docs + pitch + tools into the repo.
3) Run:
   - `node tools/ensure-metrics-library.mjs`
   - `node tools/validate-arcade-catalog-metrics.mjs` (if present)
4) Commit.

Notes
- The ensure script **never deletes** existing metrics; it only adds missing ones and backfills missing fields.
- The pitch deck appendix aligns with the canonical metrics file.
