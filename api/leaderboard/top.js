// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';
import * as Sec from '../_lib/security.js';
import * as G from '../_lib/games.js';
import * as U from '../_lib/user.js';
import * as ME from '../_lib/metricEngine.js';
import { getExcludedPayoutAddrs } from '../_lib/payoutExclusion.js';

function intParam(q, k, d) {
  const v = q && q[k] != null ? Number(q[k]) : NaN;
  return Number.isFinite(v) ? v : d;
}

function sParam(q, k, d) {
  const v = q && q[k] != null ? String(q[k]) : '';
  return v || d;
}

function ymdUtc() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return String(y) + m + day;
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

function resolveGame(gameId) {
  if (!gameId) return null;
  if (typeof G.byId === 'function') return G.byId(gameId);
  if (G.GAMES && typeof G.GAMES === 'object') return G.GAMES[gameId] || null;
  return null;
}

function resolveMetric(game, metricId) {
  const list = Array.isArray(game?.metrics) ? game.metrics : [];
  const fallback = { id: 'score', label: 'Score', dir: 'desc', format: 'int', src: 'score' };

  if (!list.length) return { meta: fallback, list: [fallback] };

  const want = String(metricId || '').trim();
  const defId = String(game?.defaultMetric || '').trim();
  const pick =
    (want && list.find(m => String(m?.id || '') === want)) ||
    (defId && list.find(m => String(m?.id || '') === defId)) ||
    list[0] ||
    fallback;

  return { meta: pick, list };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

    const q = req.query || {};
    const board = sParam(q, 'board', 'skill'); // skill|activity
    const period = sParam(q, 'period', 'daily'); // daily|weekly|all
    const eligible = String(sParam(q, 'eligible', '0')) === '1';
    const limit = Math.max(1, Math.min(200, intParam(q, 'limit', 50)));

    const address = String((await Sec.getSessionAddress(req)) || '').toLowerCase();
    const canYou = Sec.isAddress(address);

    const excluded = getExcludedPayoutAddrs();

    let key = '';
    let metricMeta = null;

    if (board === 'activity') {
      const ymd = ymdUtc();
      const wk = weekKeyUtc();
      if (period === 'weekly') key = K.actWeekly(wk);
      else if (period === 'all') key = K.actAll();
      else key = K.actDaily(ymd);
    } else {
      const gameId = String(sParam(q, 'gameId', '')).trim();
      if (!gameId) return res.status(400).json({ error: 'missing_gameId' });

      const game = resolveGame(gameId);
      if (!game) return res.status(400).json({ error: 'bad_game' });

      const metricId = String(sParam(q, 'metric', '')).trim();
      const resolved = resolveMetric(game, metricId);
      metricMeta = resolved.meta;

      const ymd = ymdUtc();
      const wk = weekKeyUtc();
      const mid = String(metricMeta?.id || 'score').trim() || 'score';

      if (period === 'weekly') key = eligible ? K.lbWeeklyPaidMetric(gameId, mid, wk) : K.lbWeeklyMetric(gameId, mid, wk);
      else if (period === 'all') key = eligible ? K.lbAllPaidMetric(gameId, mid) : K.lbAllMetric(gameId, mid);
      else key = eligible ? K.lbDailyPaidMetric(gameId, mid, ymd) : K.lbDailyMetric(gameId, mid, ymd);
    }

    // Fetch ZSET range (values are always stored "higher-is-better")
    const range = await R.zrevrangeWithScores(key, 0, limit - 1);

    const entries = [];
    for (let i = 0; i < range.length; i++) {
      const it = range[i];
      const addr = String(it.value || '').toLowerCase();
      const scoreEnc = Number(it.score || 0);

      let value = scoreEnc;
      if (board !== 'activity') {
        value = ME.decode(metricMeta || { id: 'score', dir: 'desc' }, scoreEnc);
      }

      entries.push({
        rank: i + 1,
        address: addr,
        score: Math.max(0, Math.floor(Number(value || 0))),
      });
    }

    // Enrich entries with public identity (nickname/avatar gated by PRO active + SBT locked)
    const wantAddrs = entries.map(e => e.address);
    if (canYou) wantAddrs.push(address);
    const forceShowAddrs = new Set(entries.filter(e => excluded.has(e.address)).map(e => e.address));
    if (canYou && excluded.has(address)) forceShowAddrs.add(address);
    const idMap = await U.getPublicIdentityMany(wantAddrs, { forceShowAddrs });

    const entriesOut = entries.map(e => {
      const id = idMap[e.address] || {};
      const payoutEligible = !excluded.has(e.address);
      return {
        ...e,
        displayName: id.displayName || U.shortAddr(e.address),
        nickname: id.nickname || null,
        avatarPng: id.avatarPng || null,
        level: (id.level != null) ? id.level : null,
        payoutEligible,
        badge: payoutEligible ? null : 'ADMIN',
      };
    });

    let you = null;
    if (canYou) {
      const youEnc = await R.zrevrank(key, address);
      if (youEnc != null) {
        let youScoreEnc = await R.zscore(key, address);
        youScoreEnc = Number(youScoreEnc || 0);

        let youScore = youScoreEnc;
        if (board !== 'activity') youScore = ME.decode(metricMeta || { id: 'score', dir: 'desc' }, youScoreEnc);

        const id = idMap[address] || {};
        const payoutEligible = !excluded.has(address);
        you = {
          rank: Number(youEnc) + 1,
          address,
          score: Math.max(0, Math.floor(Number(youScore || 0))),
          displayName: id.displayName || U.shortAddr(address),
          nickname: id.nickname || null,
          avatarPng: id.avatarPng || null,
          level: (id.level != null) ? id.level : null,
          payoutEligible,
          badge: payoutEligible ? null : 'ADMIN',
        };
      }
    }

    return res.status(200).json({
      ok: true,
      board,
      period,
      eligible,
      key,
      metric: metricMeta,
      entries: entriesOut,
      you,
    });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}
