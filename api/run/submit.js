// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { parseCookies, readJson } from '../_lib/util.js';
import { readSession } from '../_lib/session.js';
import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';
import * as U from '../_lib/user.js';
import { GAMES } from '../_lib/games.js';
import { ipFromReq, enforce, rlKey } from '../_lib/rate.js';
import { sameOrigin } from '../_lib/security.js';
import { bump } from '../_lib/metrics.js';

function calcXpEarned(score, runType) {
  const s = Math.max(0, Number(score || 0));
  let xp = 6 + Math.floor(Math.log10(s + 1) * 14);
  if (runType === 'promo') xp = Math.floor(xp * 0.6);
  return U.clamp(xp, 3, 40);
}

function ymdUtc() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function weekKeyUtc() {
  // ISO week approx (UTC). Good enough for leaderboard grouping + weekly epochs.
  const d = new Date();
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  const y = date.getUTCFullYear();
  const w = String(weekNo).padStart(2, '0');
  return String(y) + 'W' + w;
}

function getMetricCfg(cfg, metricId) {
  const list = Array.isArray(cfg?.metrics) ? cfg.metrics : [];
  if (!metricId) return null;
  return list.find((m) => String(m?.id || '') === String(metricId)) || null;
}

function normalizeMetrics(cfg) {
  const list = Array.isArray(cfg?.metrics) ? cfg.metrics : [];
  if (list.length) return list;
  return [{ id: 'score', label: 'Score', kind: 'score', dir: 'desc', format: 'int', src: 'score', payoutWeight: 1.0 }];
}

function metricMissingFallback(metricCfg) {
  // Missing ASC metrics must not benefit the player (0 would be "best").
  const clampMax = Number(metricCfg?.clamp?.max);
  if ((metricCfg?.dir || 'desc') === 'asc') {
    if (Number.isFinite(clampMax)) return clampMax;
    return 9_000_000_000_000; // 9e12 sentinel
  }
  return 0;
}

function metricRawValue(metricCfg, body, ctx) {
  const id = String(metricCfg?.id || '').trim();
  const src = String(metricCfg?.src || id || 'score').trim();
  const mobj = body && typeof body.metrics === 'object' && body.metrics && !Array.isArray(body.metrics) ? body.metrics : null;

  // Prefer explicit metric map, then direct fields
  let v =
    (mobj && mobj[id] != null ? mobj[id] : null) ??
    (mobj && src && mobj[src] != null ? mobj[src] : null) ??
    (body && body[id] != null ? body[id] : null) ??
    (body && src && body[src] != null ? body[src] : null);

  // Legacy ctx fallbacks
  if (v == null) {
    if (id === 'score' || src === 'score') v = ctx?.score;
    else if (id === 'durationMs' || src === 'durationMs') v = ctx?.durationMs;
    else if (id === 'inRunSpendAC' || src === 'inRunSpendAC') v = ctx?.inRunSpendAC;
  }

  // Derived metrics (generic helpers; games may also compute these client-side)
  if (v == null && id === 'efficiency') {
    const primaryId = String(ctx?.defaultMetric || 'score');
    const primary =
      (mobj && mobj[primaryId] != null ? Number(mobj[primaryId]) : null) ??
      (body && body[primaryId] != null ? Number(body[primaryId]) : null) ??
      null;
    const spend =
      (mobj && mobj.inRunSpendAC != null ? Number(mobj.inRunSpendAC) : null) ??
      (body && body.inRunSpendAC != null ? Number(body.inRunSpendAC) : null) ??
      0;
    if (Number.isFinite(primary)) {
      v = Math.floor((Math.max(0, primary) * 1000) / (Math.max(0, spend) + 1));
    }
  }

  if (v == null && (id === 'accuracyBp' || id === 'accBp')) {
    const hits =
      (mobj && mobj.hits != null ? Number(mobj.hits) : null) ??
      (body && body.hits != null ? Number(body.hits) : null);
    const shots =
      (mobj && mobj.shots != null ? Number(mobj.shots) : null) ??
      (body && body.shots != null ? Number(body.shots) : null);
    if (Number.isFinite(hits) && Number.isFinite(shots) && shots > 0) {
      v = Math.floor((Math.max(0, hits) / Math.max(1, shots)) * 10000);
    }
  }

  let n = Number(v);
  if (!Number.isFinite(n)) n = metricMissingFallback(metricCfg);

  // sanitize + clamp
  n = Math.max(0, Math.floor(n));
  const cmin = Number(metricCfg?.clamp?.min);
  const cmax = Number(metricCfg?.clamp?.max);
  if (Number.isFinite(cmin)) n = Math.max(n, cmin);
  if (Number.isFinite(cmax)) n = Math.min(n, cmax);

  const fmt = String(metricCfg?.format || '').toLowerCase();
  if (fmt === 'bp' || fmt === 'basispoints') n = clamp(n, 0, 10000);

  return n;
}

function metricEncValue(metricCfg, body, ctx) {
  const raw = metricRawValue(metricCfg, body, ctx);
  const enc = (metricCfg?.dir || 'desc') === 'asc' ? -raw : raw;
  return { raw, enc };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!R.enabled()) return res.status(503).json({ error: 'redis_not_configured' });

    if (!sameOrigin(req)) {
      await bump('run_submit', 403);
      return res.status(403).json({ error: 'bad_origin' });
    }

    const ip = ipFromReq(req);
    await enforce({ key: rlKey('run:submit:ip', ip), limit: 240, windowSec: 600 });

    const cookies = parseCookies(req);
    const s = readSession(cookies);
    if (!s || !s.address) return res.status(401).json({ error: 'not_authenticated' });

    const address = String(s.address);
    await enforce({ key: rlKey('run:submit:addr', address.toLowerCase()), limit: 180, windowSec: 600 });

    const addrLc = address.toLowerCase();

    const body = await readJson(req).catch(() => ({}));
    const gameId = String(body.gameId || '').trim();
    const runId = String(body.runId || '').trim();
    const score = Math.max(0, Math.floor(Number(body.score || 0)));
    const durationMs = Math.max(0, Math.floor(Number(body.durationMs || 0)));

    if (!gameId || !GAMES[gameId]) return res.status(400).json({ error: 'bad_game' });
    if (!runId || runId.length < 6) return res.status(400).json({ error: 'bad_run' });

    const cfg = GAMES[gameId];
    if (score > Number(cfg.scoreMax || 1_000_000)) return res.status(400).json({ error: 'score_out_of_bounds' });
    if (durationMs < Number(cfg.minDurationMs || 0)) return res.status(400).json({ error: 'duration_too_short' });
    if (durationMs > 60 * 60 * 1000) return res.status(400).json({ error: 'duration_too_long' });

    await U.ensureUser(address);

    const runKey = K.run(address, runId);
    const runRaw = await R.cmd('GET', runKey);
    if (!runRaw) return res.status(404).json({ error: 'run_not_found' });

    let runRec = null;
    try {
      runRec = JSON.parse(String(runRaw));
    } catch {
      runRec = null;
    }

    if (!runRec || String(runRec.gameId) !== gameId) return res.status(400).json({ error: 'run_game_mismatch' });
    if (String(runRec.address || '').toLowerCase() !== addrLc) return res.status(403).json({ error: 'run_owner_mismatch' });
    if (String(runRec.status || '') !== 'started') return res.status(400).json({ error: 'run_not_start' });

    const runType = String(runRec.runType || '');
    const costAC = Math.max(0, Math.floor(Number(runRec.costAC || 0)));

    // Optional in-run spend metric (used by some game profiles for fairness / efficiency).
    let inRunSpendAC = Math.max(0, Math.floor(Number(body?.metrics?.inRunSpendAC ?? body?.inRunSpendAC ?? 0)));
    const spendCapAC = Number(cfg.rankedSpendCapAC || 0);
    if (Number.isFinite(spendCapAC) && spendCapAC > 0) inRunSpendAC = Math.min(inRunSpendAC, spendCapAC);


    // Determine runType best-effort: if costAC==0 => free. Else use stored type if present; fallback 'paid'.
    let finalRunType = 'free';
    if (costAC > 0) finalRunType = runType === 'promo' || runType === 'paid' ? runType : 'paid';

    runRec.status = 'submitted';
    runRec.score = score;
    runRec.durationMs = durationMs;
    runRec.submittedAt = new Date().toISOString();
    runRec.runType = finalRunType;

    const xpEarned = calcXpEarned(score, finalRunType);

    // Activity points that influence payouts are paid-only.
    const actInc = finalRunType === 'paid' ? costAC : 0;

    const pKey = K.profile(address);
    const bestKey = K.best(address);
    const runsKey = K.runs(address, gameId);
    const auditKey = K.audit(address);

    const curState = await U.getState(address);
    const curBest = Math.max(0, Number((curState.best || {})[gameId] || 0));
    const newBest = Math.max(curBest, score);

    const newXp = Math.max(0, Number(curState.xp || 0) + xpEarned);
    const newLevel = Math.max(1, Math.floor(newXp / 100) + 1);

    const ymd = ymdUtc();
    const wk = weekKeyUtc();

    const EXP_DAILY = 60 * 60 * 24 * 45;
    const EXP_WEEKLY = 60 * 60 * 24 * 60;

    // --- Build leaderboard targets (best-of write) ---
    // We encode metric values so higher-is-better. For asc metrics, enc is negative.
    const metrics = normalizeMetrics(cfg);

    /** @type {{key:string, score:number, expireSec:number}} */
    const targets = [];

    function addTarget(key, scoreEnc, expireSec) {
      targets.push({ key, score: Number(scoreEnc || 0), expireSec: Math.max(0, Number(expireSec || 0)) });
    }

    // Legacy "score" leaderboards (kept for backward compatibility)
    addTarget(K.lbAll(gameId), score, 0);
    addTarget(K.lbDaily(gameId, ymd), score, EXP_DAILY);
    addTarget(K.lbWeekly(gameId, wk), score, EXP_WEEKLY);
    if (finalRunType === 'paid') {
      addTarget(K.lbAllPaid(gameId), score, 0);
      addTarget(K.lbDailyPaid(gameId, ymd), score, EXP_DAILY);
      addTarget(K.lbWeeklyPaid(gameId, wk), score, EXP_WEEKLY);
    }

    // Metric leaderboards
    for (const m of metrics) {
      const mid = String(m?.id || '').trim();
      if (!mid) continue;
      const { enc } = metricEncValue(m, body, { score, durationMs, defaultMetric: cfg.defaultMetric, inRunSpendAC });

      addTarget(K.lbAllMetric(gameId, mid), enc, 0);
      addTarget(K.lbDailyMetric(gameId, mid, ymd), enc, EXP_DAILY);
      addTarget(K.lbWeeklyMetric(gameId, mid, wk), enc, EXP_WEEKLY);

      if (finalRunType === 'paid') {
        addTarget(K.lbAllPaidMetric(gameId, mid), enc, 0);
        addTarget(K.lbDailyPaidMetric(gameId, mid, ymd), enc, EXP_DAILY);
        addTarget(K.lbWeeklyPaidMetric(gameId, mid, wk), enc, EXP_WEEKLY);
      }
    }

    // Fetch existing scores to do best-of updates without requiring Redis ZADD GT support.
    const existing = targets.length ? await R.pipeline(targets.map((t) => ['ZSCORE', t.key, addrLc])) : [];
    const bestOfCmds = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const prevRaw = existing[i];
      const prev = prevRaw == null ? null : Number(prevRaw);
      if (prev == null || !isFinite(prev) || t.score > prev) {
        bestOfCmds.push(['ZADD', t.key, t.score, addrLc]);
      }
      if (t.expireSec > 0) bestOfCmds.push(['EXPIRE', t.key, t.expireSec]);
    }

    const actD = K.actDaily(ymd);
    const actW = K.actWeekly(wk);
    const actA = K.actAll();

    const audit = JSON.stringify({
      t: 'run_submit',
      ts: runRec.submittedAt,
      gameId,
      runId,
      score,
      durationMs,
      runType: finalRunType,
      xpEarned,
    });

    const cmds = [
      ['DEL', runKey],
      ['LPUSH', runsKey, JSON.stringify(runRec)],
      ['LTRIM', runsKey, 0, 49],
      ['HSET', bestKey, gameId, newBest],
      ['HSET', pKey, 'xp', newXp, 'level', newLevel, 'lastActiveAt', runRec.submittedAt],
      ...bestOfCmds,
      // Activity is paid-only; weekly/all-time rollups are new for weekly payouts & future UI.
      ['ZINCRBY', actD, actInc, addrLc],
      ['ZINCRBY', actW, actInc, addrLc],
      ['ZINCRBY', actA, actInc, addrLc],
      ['EXPIRE', actD, EXP_DAILY],
      ['EXPIRE', actW, EXP_WEEKLY],
      ['LPUSH', auditKey, audit],
      ['LTRIM', auditKey, 0, 99],
    ];

    await R.pipeline(cmds);

    const state = await U.getState(address);
    await bump('run_submit', 200);
    return res.status(200).json({
      ok: true,
      address,
      gameId,
      runId,
      score,
      durationMs,
      runType: finalRunType,
      xpEarned,
      state,
    });
  } catch (e) {
    if (e && e.code === 'RATE_LIMIT') {
      try {
        await bump('run_submit', 429);
      } catch {}
      return res.status(429).json({ error: 'rate_limited', limit: e.limit, windowSec: e.windowSec });
    }
    try {
      await bump('run_submit', 500);
    } catch {}
    return res.status(500).json({ error: 'server_error' });
  }
}
