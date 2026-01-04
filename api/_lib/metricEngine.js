// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

/**
 * Metric Engine v3.2 (server-side)
 * - Normalizes metric configs across schema variants (dir/kind/higher/lower).
 * - Accepts a flexible `metrics` payload from games on run submit.
 * - Computes a small set of derived/composite metrics when inputs exist.
 * - Encodes values so higher-is-better for Redis ZREVRANGE:
 *    - desc => enc = value
 *    - asc  => enc = -value
 *
 * NOTE: Keep this file dependency-free (Node/Vercel safe).
 */

/** @typedef {{ min?: number, max?: number }} Clamp */
/** @typedef {{ id: string, label?: string, dir?: 'asc'|'desc', kind?: string, format?: string, unit?: string, src?: string, clamp?: Clamp }} MetricCfg */
/** @typedef {{ score: number, durationMs: number }} BaseRun */

/** @param {any} v */
function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** @param {any} v @param {number} d */
function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** @param {any} v @param {number} d */
function int(v, d = 0) {
  const n = Math.floor(num(v, d));
  return Number.isFinite(n) ? n : d;
}

/** @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/** @param {MetricCfg} m */
export function dirOf(m) {
  const dir = String(m?.dir || '').toLowerCase();
  if (dir === 'asc' || dir === 'desc') return /** @type {'asc'|'desc'} */ (dir);

  const kind = String(m?.kind || '').toLowerCase();
  // common schema variants
  if (kind === 'asc' || kind === 'lower' || kind === 'lowest' || kind === 'min') return 'asc';
  if (kind === 'desc' || kind === 'higher' || kind === 'highest' || kind === 'max') return 'desc';

  // fallback: assume higher-is-better
  return 'desc';
}

/** @param {MetricCfg} m */
export function formatOf(m) {
  const f = String(m?.format || 'int').toLowerCase();
  if (f === 'ms' || f === 'int' || f === 'bp') return f;
  return 'int';
}

/** @param {MetricCfg} m */
export function srcOf(m) {
  const s = String(m?.src || '').trim();
  return s || String(m?.id || '').trim();
}

/**
 * Parse raw metrics payload from a run submit body.
 * Accepts:
 * - body.metrics: object of { [id]: number }
 * - plus base fields: score, durationMs
 *
 * @param {any} body
 * @param {BaseRun} base
 * @returns {Record<string, number>}
 */
export function parseIncomingMetrics(body, base) {
  /** @type {Record<string, number>} */
  const out = {};

  if (isObj(body?.metrics)) {
    for (const [k, v] of Object.entries(body.metrics)) {
      const id = String(k || '').trim();
      if (!id) continue;
      const n = num(v, NaN);
      if (!Number.isFinite(n)) continue;
      out[id] = n;
    }
  }

  // Canonical base fallbacks
  if (!Number.isFinite(out.score)) out.score = base.score;
  if (!Number.isFinite(out.durationMs)) out.durationMs = base.durationMs;

  // Common aliases
  if (!Number.isFinite(out.timeMs) && Number.isFinite(out.durationMs)) out.timeMs = out.durationMs;
  if (!Number.isFinite(out.time) && Number.isFinite(out.durationMs)) out.time = out.durationMs;

  return out;
}

/**
 * Compute a small set of derived/composite metrics when inputs exist.
 * These are optional and only used if the game defines them in cfg.metrics.
 *
 * Derived:
 * - accuracyBp: basis points 0..10000 from hits/attempts
 * - kpm: kills per minute (integer) from kills + durationMs
 * - spm: score per minute (integer) from score + durationMs
 * - efficiency: (primaryValue * 1000) / (inRunSpendAC + 1)
 *
 * @param {Record<string, number>} metrics
 * @param {BaseRun} base
 * @returns {Record<string, number>}
 */
export function computeDerivedMetrics(metrics, base) {
  const m = { ...metrics };
  const durationMs = Math.max(0, int(m.durationMs, base.durationMs));

  const pickFinite = (...vals) => {
    for (const v of vals) {
      const n = num(v, NaN);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  };

  // --- accuracyBp ---
  const hits = pickFinite(m.hits, m.hit, m.notesHit, m.shotsHit);
  const attempts = pickFinite(m.attempts, m.shots, m.notesTotal, m.totalShots);

  if (!Number.isFinite(m.accuracyBp) && Number.isFinite(hits) && Number.isFinite(attempts) && attempts > 0) {
    const bp = Math.round((10000 * hits) / attempts);
    m.accuracyBp = clamp(bp, 0, 10000);
  }

  // --- kpm (kills per minute) ---
  const kills = pickFinite(m.kills, m.enemiesKilled, m.enemyDefeats);
  if (!Number.isFinite(m.kpm) && Number.isFinite(kills) && durationMs >= 1000) {
    m.kpm = Math.max(0, Math.round((60000 * kills) / durationMs));
  }

  // --- spm (score per minute) ---
  const score = Math.max(0, int(m.score, base.score));
  if (!Number.isFinite(m.spm) && score > 0 && durationMs >= 1000) {
    m.spm = Math.max(0, Math.round((60000 * score) / durationMs));
  }

  // --- efficiency (value per in-run spend) ---
  const spent = pickFinite(m.inRunSpendAC, m.spentAC, m.acSpent, m.creditsSpentAC, m.spentInRunAC);

  if (!Number.isFinite(m.efficiency) && Number.isFinite(spent) && spent >= 0) {
    // Choose a generic "primary value" proxy.
    // Prefer objectives/waves/kills if present; otherwise fall back to score.
    const objectives = pickFinite(m.objectives, m.objectiveCount, m.waves, m.levelsCleared);
    const primary = Number.isFinite(objectives)
      ? Math.max(0, objectives)
      : (Number.isFinite(kills) ? Math.max(0, kills) : score);

    // Scale by 1000 for a bit of precision; denominator has +1 to avoid div-by-0.
    m.efficiency = Math.max(0, Math.floor((primary * 1000) / (spent + 1)));
  }

  return m;
}

/**
 * Normalize cfg.metrics list; fall back to a single score metric.
 * @param {any} cfg
 * @returns {MetricCfg[]}
 */
export function normalizeMetricList(cfg) {
  const list = Array.isArray(cfg?.metrics) ? cfg.metrics : [];
  if (list.length) return list;
  return [{ id: 'score', label: 'Score', dir: 'desc', format: 'int', src: 'score' }];
}

/**
 * Coerce + clamp a metric value based on the spec and game cfg.
 * @param {MetricCfg} spec
 * @param {number} raw
 * @param {any} cfg
 * @param {BaseRun} base
 */
export function clampMetricValue(spec, raw, cfg, base) {
  const f = formatOf(spec);

  // Default clamps (safe upper bounds)
  let lo = 0;
  let hi = 1e15;

  // Explicit clamp wins
  if (isObj(spec?.clamp)) {
    if (Number.isFinite(num(spec.clamp.min, NaN))) lo = num(spec.clamp.min, lo);
    if (Number.isFinite(num(spec.clamp.max, NaN))) hi = num(spec.clamp.max, hi);
  } else {
    // Implicit clamps by common metric types
    const id = String(spec?.id || '').toLowerCase();
    if (id === 'score' || srcOf(spec) === 'score') {
      const mx = num(cfg?.scoreMax, NaN);
      if (Number.isFinite(mx) && mx > 0) hi = mx;
    } else if (f === 'ms' || id.includes('time') || id.includes('duration')) {
      hi = 24 * 60 * 60 * 1000; // 24h max
    } else if (f === 'bp' || id.includes('accuracy')) {
      hi = 10000;
    }
  }

  // Prefer base fields when raw missing
  let v = Number.isFinite(raw) ? raw : 0;
  if (!Number.isFinite(v)) v = 0;

  // Coerce by format
  if (f === 'ms' || f === 'int' || f === 'bp') v = int(v, 0);
  v = clamp(v, lo, hi);

  // If this metric maps to duration/score, keep them consistent with base
  const src = srcOf(spec);
  if (src === 'durationMs') v = clamp(int(base.durationMs, 0), lo, hi);
  if (src === 'score') v = clamp(int(base.score, 0), lo, hi);

  return v;
}

/**
 * Resolve a metric value from metric map + base fields using spec.src/spec.id.
 * @param {MetricCfg} spec
 * @param {Record<string, number>} m
 * @param {BaseRun} base
 */
export function valueForSpec(spec, m, base) {
  const src = srcOf(spec);

  // direct lookup
  if (Number.isFinite(num(m[src], NaN))) return num(m[src], NaN);

  // common fallbacks
  if (src === 'durationMs' || src === 'timeMs' || src === 'time' || spec.id === 'time') return base.durationMs;
  if (src === 'score' || spec.id === 'score') return base.score;

  return NaN;
}

/**
 * Encode metric value for Redis ZSET score.
 * @param {MetricCfg} spec
 * @param {number} value
 */
export function encode(spec, value) {
  const dir = dirOf(spec);
  return dir === 'asc' ? -value : value;
}

/**
 * Decode Redis ZSET score back to the human value.
 * @param {MetricCfg} spec
 * @param {number} enc
 */
export function decode(spec, enc) {
  const dir = dirOf(spec);
  return dir === 'asc' ? -enc : enc;
}

/**
 * Project (value+encoded) metrics for a given game cfg.
 *
 * @param {any} cfg
 * @param {Record<string, number>} metrics
 * @param {BaseRun} base
 * @returns {{id: string, value: number, enc: number, meta: MetricCfg}[]}
 */
export function projectMetricsForGame(cfg, metrics, base) {
  const specs = normalizeMetricList(cfg);
  const out = [];
  for (const s of specs) {
    const id = String(s?.id || '').trim();
    if (!id) continue;
    const raw = valueForSpec(s, metrics, base);
    const value = clampMetricValue(s, raw, cfg, base);
    const enc = encode(s, value);
    out.push({ id, value, enc, meta: s });
  }
  return out;
}

/**
 * Convert projected metrics into a compact { [id]: value } object for storage.
 * @param {{id:string,value:number}[]} projected
 */
export function toValueMap(projected) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const m of projected || []) {
    const id = String(m?.id || '').trim();
    if (!id) continue;
    out[id] = int(m.value, 0);
  }
  return out;
}
