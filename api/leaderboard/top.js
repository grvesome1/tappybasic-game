// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { getSession } from '../_lib/session.js';
import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';
import * as X from '../_lib/exclusions.js';
import { GAMES } from '../_lib/games.js';
import { ipFromReq, enforce, rlKey } from '../_lib/rate.js';
import { bump } from '../_lib/metrics.js';

function ymdUtc() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function weekKeyUtc() {
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

function parseWithScores(arr) {
  const out = [];
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < arr.length; i += 2) {
    const member = String(arr[i] ?? '');
    const scoreEnc = Number(arr[i + 1] ?? 0);
    if (!member) continue;
    out.push({ member, scoreEnc: isFinite(scoreEnc) ? scoreEnc : 0 });
  }
  return out;
}

function normalizeMetrics(cfg) {
  const list = Array.isArray(cfg?.metrics) ? cfg.metrics : [];
  if (list.length) return list;
  return [{ id: 'score', label: 'Score', kind: 'score', dir: 'desc', format: 'int', src: 'score', payoutWeight: 1.0 }];
}

function findMetric(cfg, metricId) {
  const list = normalizeMetrics(cfg);
  const want = String(metricId || '').trim();
  if (!want) return list[0] || null;
  return list.find((m) => String(m?.id || '') === want) || (list[0] || null);
}

function decodeScore(metricCfg, scoreEnc) {
  const dir = String(metricCfg?.dir || 'desc');
  const n = Number(scoreEnc || 0);
  if (!isFinite(n)) return 0;
  const v = dir === 'asc' ? -n : n;
  return Math.max(0, Math.floor(v));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    if (!R.enabled()) return res.status(200).json({ ok: false, error: 'redis_not_configured' });

    const ip = ipFromReq(req);
    await enforce({ key: rlKey('lb:top:ip', ip), limit: 600, windowSec: 60 });

    const url = new URL(req.url, 'http://localhost');
    const board = String(url.searchParams.get('board') || 'skill').trim(); // 'skill' | 'activity'
    const period = String(url.searchParams.get('period') || 'daily').trim(); // 'daily' | 'weekly' | 'all'
    const eligible = String(url.searchParams.get('eligible') || '0').trim() === '1';
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)));

    const s = await getSession(req);
    const address = s && s.address ? String(s.address) : '';
    const addrLc = address ? address.toLowerCase() : '';

    const ymd = ymdUtc();
    const wk = weekKeyUtc();

    let key = '';
    let metric = null;
    let metricId = '';
    let gameId = '';
    let cfg = null;

    if (board === 'activity') {
      // Global paid activity (AC spent) leaderboards.
      key = K.actDaily(ymd);
      if (period === 'weekly') key = K.actWeekly(wk);
      if (period === 'all') key = K.actAll();
    } else {
      gameId = String(url.searchParams.get('gameId') || '').trim();
      if (!gameId || !GAMES[gameId]) return res.status(400).json({ error: 'bad_game' });
      cfg = GAMES[gameId];

      metricId = String(url.searchParams.get('metric') || cfg.defaultMetric || 'score').trim();
      metric = findMetric(cfg, metricId);
      metricId = metric ? String(metric.id || 'score') : 'score';

      // Metric-aware keys (preferred). Fall back to legacy keys if needed.
      if (metric) {
        key = eligible ? K.lbDailyPaidMetric(gameId, metricId, ymd) : K.lbDailyMetric(gameId, metricId, ymd);
        if (period === 'weekly') key = eligible ? K.lbWeeklyPaidMetric(gameId, metricId, wk) : K.lbWeeklyMetric(gameId, metricId, wk);
        if (period === 'all') key = eligible ? K.lbAllPaidMetric(gameId, metricId) : K.lbAllMetric(gameId, metricId);
      } else {
        key = eligible ? K.lbDailyPaid(gameId, ymd) : K.lbDaily(gameId, ymd);
        if (period === 'weekly') key = eligible ? K.lbWeeklyPaid(gameId, wk) : K.lbWeekly(gameId, wk);
        if (period === 'all') key = eligible ? K.lbAllPaid(gameId) : K.lbAll(gameId);
      }
    }

    const raw = await R.cmd('ZREVRANGE', key, 0, limit - 1, 'WITHSCORES');
    const items = parseWithScores(raw);

    let you = null;
    if (addrLc) {
      const youScoreEnc = await R.cmd('ZSCORE', key, addrLc);
      if (youScoreEnc != null) {
        const r = await R.cmd('ZREVRANK', key, addrLc);
        you = {
          rank: r == null ? null : Number(r) + 1,
          scoreEnc: Number(youScoreEnc || 0),
          score: board === 'activity' ? Math.max(0, Number(youScoreEnc || 0)) : decodeScore(metric, youScoreEnc),
        };
      }
    }

    const entries = items.map((it, idx) => ({
      rank: idx + 1,
      address: it.member,
      scoreEnc: it.scoreEnc,
      score: board === 'activity' ? Math.max(0, Number(it.scoreEnc || 0)) : decodeScore(metric, it.scoreEnc),
    }));

    await bump('leaderboard_top', 200);

    return res.status(200).json({
      ok: true,
      board,
      eligible,
      gameId: gameId || null,
      metric: metric ? { id: metricId, label: String(metric.label || metricId), kind: String(metric.kind || ''), dir: String(metric.dir || 'desc'), format: String(metric.format || 'int') } : null,
      period,
      key,
      entries,
      you,
    });
  } catch (e) {
    if (e && e.code === 'RATE_LIMIT') {
      return res.status(429).json({ error: 'rate_limited', limit: e.limit, windowSec: e.windowSec });
    }
    try {
      await bump('leaderboard_top', 500);
    } catch {}
    return res.status(500).json({ error: 'server_error' });
  }
}
