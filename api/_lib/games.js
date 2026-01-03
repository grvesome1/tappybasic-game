// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f
// Keep in sync with public/arcade-games.json (server-side validation & pricing)
//
// Multi-metric support:
// - Each game can define multiple leaderboard metrics (score, time, accuracy, etc).
// - Metrics store "encoded" values so higher-is-better for Redis ZREVRANGE:
//   - dir: 'desc' => enc = value
//   - dir: 'asc'  => enc = -value
//
// NOTE: payoutWeight controls how a game's Skill pool is split across metrics.
// For launch, keep secondary metrics at payoutWeight=0 until you explicitly enable them.

export const GAMES = {
  moonshot: {
    name: 'Moonshot',
    runCostAC: 10,
    promoRuns: 5,
    promoGrantAC: 50,
    payoutEligible: true,
    scoreMax: 5000,
    minDurationMs: 800,

    // Leaderboard metrics
    defaultMetric: 'score',
    metrics: [
      { id: 'score', label: 'Score', kind: 'score', dir: 'desc', format: 'int', src: 'score', payoutWeight: 1.0 },
      { id: 'time', label: 'Time', kind: 'time', dir: 'asc', format: 'ms', src: 'durationMs', payoutWeight: 0.0 },
    ],
  },

  'storm-the-blockchain': {
    name: 'Storm the Blockchain (3D Remaster)',
    runCostAC: 0,
    promoRuns: 0,
    promoGrantAC: 0,
    payoutEligible: false,
    scoreMax: 100000,
    minDurationMs: 0,

    defaultMetric: 'score',
    metrics: [{ id: 'score', label: 'Score', kind: 'score', dir: 'desc', format: 'int', src: 'score', payoutWeight: 1.0 }],
  },
};

export const DEFAULTS = {
  acUsd: 0.01,
  maxBonusPct: 0.15,
  bonusCurveK: 40,
};
