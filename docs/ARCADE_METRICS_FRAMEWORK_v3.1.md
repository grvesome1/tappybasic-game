# Gruesøme’s Arcade — Metrics Framework (v3.1)

**Goal:** make leaderboards + payouts scale across wildly different game types (defense, shooter, puzzle, rhythm, sim, idle) while staying **equitable** (not equal).

This v3.1 iteration is intentionally **safe to apply**: it adds docs + a metric library + a catalog validator tool.
No runtime code is replaced.

---

## 0) Why metrics matter (equity, not equality)

“Best score wins” only works for a narrow set of games.

If we want the arcade to feel fair across:
- fast reflex games
- slow strategy games
- endurance games
- precision games
- grind/economy games

…we need **multiple metric types** and a **game-type-aware** way to pick which ones actually count for Skill payouts.

---

## 1) Key terms

- **Metric**: a single scalar number tracked per run (example: `waves`, `accuracyBp`, `timeMs`).
- **MetricSpec**: the schema describing a metric (direction, clamp, etc).
- **Telemetry metric**: collected for analytics and anti-cheat, but **not** used for Skill payouts.
- **Payout metric**: eligible to drive Skill payouts for a specific game (usually 1–3 per game).
- **Board**: a leaderboard “dimension” (example: `skill`, `activity`).

---

## 2) Canonical MetricSpec schema

A metric is declared with:

- `id` (string) — lowercase, stable, no spaces
- `label` (string) — UI display name
- `kind` (enum) — `counter | duration | ratio | currency | composite`
- `direction` (enum) — `desc | asc`
  - `desc`: higher is better (score, waves, kills)
  - `asc`: lower is better (time trials, damageTaken)
- `format` (enum) — `int | ms | bp | pct | usd | ac`
  - `bp` = basis points (0–10000)
- `clamp` — `{ "min": number, "max": number }`

Optional but recommended:
- `group` — `core | skill | quality | effort | economy | social | antiCheat`
- `payoutEligible` (bool)
- `notes` (string)
- `antiCheat` (object): lightweight sanity rules, not “perfect security”
  - `maxPerSecond`, `requiresDuration`, etc.

---

## 3) Run result schema (what games submit)

A run should submit:

- `score` (number) — optional if the game isn’t score-based
- `durationMs` (number) — measured by the game using `performance.now()` deltas
- `metrics` (object) — `{ [metricId]: number }`
- `econ` (object)
  - `entryCostAC` (number) — known to the arcade (authoritative)
  - `spentInRunAC` (number) — optional; if the game spends Credits in-run

### In-run Credit spend rule (important)
If a game spends Credits during a run (`spentInRunAC > 0`), ranked fairness requires:
- either a **spend cap** (`rankedSpendCapAC`) *or*
- an **efficiency metric** (computed or submitted) that makes “spend more” not strictly dominant.

---

## 4) Where metrics attach in a game (generic integration points)

You don’t “add metrics” at the end. You attach them at natural points:

- **startRun()**
  - reset counters
  - store `t0 = performance.now()`
- **every tick / every wave / every checkpoint**
  - increment counters (`kills`, `waves`, `shotsFired`)
- **on success events**
  - update streak/combo
- **on failure events**
  - update mistakes/deaths
- **on in-run purchases**
  - accumulate `spentInRunAC`
- **on endRun()**
  - finalize `durationMs`
  - compute derived metrics (efficiency)
  - submit `{ score, durationMs, metrics, econ }`

---

## 5) Game-type templates (recommended payout metrics)

Keep Skill payouts focused: **1–3 payout metrics** per game.

Examples:

### Shooter
Payout metrics:
- `score` (0.6)
- `accuracyBp` (0.4)

Telemetry:
- `kills`, `headshotBp`, `damageTaken`, `streak`, `durationMs`

### Defense (Storm the House 2 fits here)
Payout metrics:
- `waves` (0.5)
- `baseHpLeft` (0.2)
- `efficiency` (0.3)  ← protects against “spend more”

Telemetry:
- `kills`, `damageTaken`, `spentInRunAC`, `durationMs`

### Puzzle
Payout metrics:
- `levelsCleared` (0.6)
- `timeMs` (0.4 asc)

Telemetry:
- `hintsUsed`, `moves`, `mistakes`, `attempts`

### Rhythm
Payout metrics:
- `score` (0.5)
- `accuracyBp` (0.3)
- `maxCombo` (0.2)

---

## 6) How this flows through the arcade

### Leaderboard
- The leaderboard becomes **(gameId, metricId, period)**.
- Metric selector is driven by the catalog, not hardcoded.

### Wallet + payouts
- Daily + weekly claims are separate.
- Wallet should show:
  - Skill earnings (by game + metric)
  - Activity earnings
  - PRO boost earnings
  - Weekly reserve accumulation (operator-facing, optional)

### Play view
- Before “Play”, show:
  - entry cost
  - which metrics count (ranked)
  - “lower is better” labels for asc metrics
  - any spend caps (ranked fairness)

---

## 7) What this iteration adds to the repo

Files introduced by the v3.1 bundle:
- `public/arcade-metrics-library.json` — canonical metric vocabulary
- `public/arcade-metrics-templates.json` — game-type templates
- `tools/validate-arcade-catalog-metrics.mjs` — CI / sanity checker for `public/arcade-games.json`

**No frontend UI or backend payout logic is changed in v3.1.** That comes next.

---

## 8) Next iterations (what we’ll build next)

- **v3.2 (backend)**: store per-metric leaderboards; accept `metrics` in run submit; expose `/api/leaderboard/top?metric=...`.
- **v3.3 (frontend)**: leaderboard metric selector + tooltips + fairness UX; wallet adds weekly claim surfaces.

---

<!-- Signature: built by gruesøme -->
<!-- sig_enc (xor+b64): OC8zNi56OCN6PSgvPymZ4jc/ -->
