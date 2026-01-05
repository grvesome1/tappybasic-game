# Iteration 3.7 + 3.8 – Storm the House 2 profile + final polish

## What this finishes

This bundle does two things:

### Iteration 3.7 — Defense economy profile (Storm the House 2)
Adds a standard, fair **multi-metric** scoring profile for a defense game that spends Credits inside the run.

Why this matters:
- Defense games can be “pay-to-win” if the only skill metric is progress/score.
- We neutralize that by using:
  - `waves` (progress)
  - `efficiency` (performance per in-run spend)
  - `durationMs` (survival time)
- We also set `rankedSpendCapAC` to cap ranked spend.

### Iteration 3.8 — Guardrails
Updates the catalog metrics validator to warn you when a game uses in-run Credits but is missing the fairness telemetry/metrics.

---

## How to apply

1) Ensure you have a gameId for Storm the House 2 in `public/arcade-games.json`.
   - Recommended: `stormhouse2`

2) Apply the profile (preview first):

```bash
node tools/apply-game-profile.mjs --gameId=stormhouse2 --profile=tools/profiles/defense_econ_sth2.json
```

This writes:
- `public/arcade-games.preview.json`
- `public/arcade-metrics-library.preview.json`

3) Overwrite real files when satisfied:

```bash
node tools/apply-game-profile.mjs --gameId=stormhouse2 --profile=tools/profiles/defense_econ_sth2.json --write
```

If the game doesn’t exist yet in the catalog, create a placeholder entry:

```bash
node tools/apply-game-profile.mjs --gameId=stormhouse2 --profile=tools/profiles/defense_econ_sth2.json --add --write
```

4) Validate:

```bash
node tools/validate-arcade-catalog-metrics.mjs
```

---

## Storm the House 2 run submit payload
The game should submit these metrics on run result:

- `waves` (int)
- `kills` (int)
- `inRunSpendAC` (int)
- `durationMs` (ms)
- optional accuracy inputs: `hits`, `attempts`

See `snippets/sth2_run_result_payload.json`.

### Important
- `efficiency` is derived server-side if you provide `waves` and `inRunSpendAC`.
- In ranked/paid runs, you should count **paid** in-run spend only for `inRunSpendAC`.

---

## Definition of “done” after this
- Catalog declares game type + metrics + default metric.
- Validator enforces fairness warnings.
- Game emits the metrics payload.

At that point you can ship the arcade and begin adding more games by picking a profile + mapping metrics.
