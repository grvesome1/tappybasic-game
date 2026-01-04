# Arcade Metrics Payload v3.2 (server-side)

This document describes the **generic** `metrics` payload that games can send on `/api/run/submit` and how the backend projects those values into multi-metric leaderboards.

> built by gruesøme  
> SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

## 1) Run submit body shape

Games should POST JSON:

```json
{
  "gameId": "moonshot",
  "runId": "abc123",
  "score": 12345,
  "durationMs": 67890,
  "metrics": {
    "kills": 42,
    "hits": 90,
    "attempts": 100,
    "inRunSpendAC": 12,
    "waves": 10
  }
}
```

Only `score` + `durationMs` are required for compatibility.  
`metrics` is optional and can include any numeric keys.

## 2) Standard metric keys (recommended)

These are intentionally **genre-agnostic** and can be mapped from any game:

- `score` — points/score
- `durationMs` — session length / survival time
- `objectives` / `waves` / `levelsCleared` — objectives completed
- `kills` / `enemiesKilled` — action count
- `hits` + `attempts` — accuracy input (shots hit / shots fired, notes hit / notes total, etc.)
- `inRunSpendAC` — paid credits spent *inside the run* (if applicable to the game economy)

## 3) Derived/composite metrics (computed by backend when inputs exist)

Backend computes these if they are not already present in `metrics`:

- `accuracyBp` — 0..10000 basis points (hits/attempts)
- `kpm` — kills per minute
- `spm` — score per minute
- `efficiency` — generic "value per in-run spend" proxy:
  - `(primaryValue * 1000) / (inRunSpendAC + 1)`
  - primaryValue prefers `objectives/waves/levelsCleared`, else `kills`, else `score`

A game only gets a leaderboard for one of these if the game config includes that metric id.

## 4) How metrics become leaderboards

For each game, define a `metrics[]` list in the server game config.

Each metric entry supports:

- `id` (string, required) — metric ID used in API + leaderboards
- `label` (string)
- `dir` (`asc` or `desc`) **or** `kind` (`lower` or `higher`)
- `format` (`int` | `ms` | `bp`)
- `src` (string) — which key in `metrics` to read (defaults to `id`)
- `clamp` `{min,max}` — optional hard bounds

Example metric config:

```js
metrics: [
  { id: 'score', label: 'Score', dir: 'desc', format: 'int', src: 'score', clamp: { min: 0, max: 1000000 } },
  { id: 'time',  label: 'Time',  dir: 'asc',  format: 'ms',  src: 'durationMs', clamp: { min: 0, max: 3600000 } },
  { id: 'accuracyBp', label: 'Accuracy', dir: 'desc', format: 'bp', src: 'accuracyBp' }
]
```

## 5) Why this exists

Different genres express skill differently (endurance, accuracy, efficiency, etc.).  
Multi-metric leaderboards let payout systems be **equitable** (not equal), across many game types.
