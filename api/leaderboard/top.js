// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';
import * as Sec from '../_lib/security.js';
import * as G from '../_lib/games.js';
import * as U from '../_lib/user.js';

function intParam(q, k, d) {
  const v = q && q[k] != null ? Number(q[k]) : NaN;
  return Number.isFinite(v) ? v : d;
}

function sParam(q, k, d) {
  const v = q && q[k] != null ? String(q[k]) : '';
  return v || d;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

    if (!R.enabled()) return res.status(503).json({ error: 'redis_not_configured' });

    const board = sParam(req.query, 'board', 'skill'); // skill | activity
    const period = sParam(req.query, 'period', 'daily'); // daily | weekly | all
    const eligible = intParam(req.query, 'eligible', 0) ? 1 : 0;
    const limit = Math.min(200, Math.max(1, intParam(req.query, 'limit', 50)));
    const gameId = sParam(req.query, 'gameId', '');
    const metricId = sParam(req.query, 'metric', 'score');

    // Optional "you" enrichment (requires cookie session)
    const address = String((await Sec.getSessionAddress(req)) || '').toLowerCase();

    let key = '';
    let metricMeta = null;
    let desc = true; // true -> higher is better
    let canYou = Sec.isAddress(address);

    if (board === 'activity') {
      if (period === 'weekly') key = K.actWeekly(K.utcWeekKey());
      else if (period === 'all') key = K.actAll();
      else key = K.actDaily(K.utcYmd());
    } else {
      const game = G.byId(gameId);
      if (!game) return res.status(400).json({ error: 'bad_game' });

      const metric = (game.metrics || []).find(m => m.id === metricId) || (game.metrics || [])[0];
      if (!metric) return res.status(400).json({ error: 'bad_metric' });
      metricMeta = metric;
      desc = metric.kind !== 'asc'; // asc => lower is better

      if (period === 'weekly') key = K.lbWeeklyMetric(gameId, K.utcWeekKey(), metric.id, eligible);
      else if (period === 'all') key = K.lbAllMetric(gameId, metric.id, eligible);
      else key = K.lbDailyMetric(gameId, K.utcYmd(), metric.id, eligible);
    }

    // Fetch ZSET range
    const range = desc ? await R.zrevrangeWithScores(key, 0, limit - 1) : await R.zrangeWithScores(key, 0, limit - 1);

    const entries = [];
    for (let i = 0; i < range.length; i++) {
      const it = range[i];
      const addr = String(it.value || '').toLowerCase();
      const scoreEnc = Number(it.score || 0);

      let value = scoreEnc;
      if (board !== 'activity') {
        // Decode values for asc metrics (stored as 1e15 - value)
        if (metricMeta && metricMeta.kind === 'asc') value = 1e15 - scoreEnc;
      }

      entries.push({
        rank: i + 1,
        address: addr,
        score: Math.max(0, value),
      });
    }

    // Enrich entries with public identity (nickname/avatar gated by PRO active + SBT locked)
    const idMap = await U.getPublicIdentityMany(entries.map(e => e.address).concat(canYou ? [address] : []));
    const entriesOut = entries.map(e => {
      const id = idMap[e.address] || {};
      return {
        ...e,
        displayName: id.displayName || U.shortAddr(e.address),
        nickname: id.nickname || null,
        avatarPng: id.avatarPng || null,
        level: (id.level != null) ? id.level : null,
      };
    });

    let you = null;
    if (canYou) {
      let youEnc = desc ? await R.zrevrank(key, address) : await R.zrank(key, address);
      if (youEnc != null) {
        let youScoreEnc = await R.zscore(key, address);
        youScoreEnc = Number(youScoreEnc || 0);

        let youScore = youScoreEnc;
        if (board !== 'activity') {
          if (metricMeta && metricMeta.kind === 'asc') youScore = 1e15 - youScoreEnc;
        }

        const id = idMap[address] || {};
        you = {
          rank: Number(youEnc) + 1,
          address,
          score: Math.max(0, youScore),
          displayName: id.displayName || U.shortAddr(address),
          nickname: id.nickname || null,
          avatarPng: id.avatarPng || null,
          level: (id.level != null) ? id.level : null,
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
