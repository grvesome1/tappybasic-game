// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { parseCookies } from '../_lib/util.js';
import { readSession } from '../_lib/session.js';
import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';
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
    const score = Number(arr[i + 1] ?? 0);
    if (!member) continue;
    out.push({ member, score: Math.max(0, score) });
  }
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    if (!R.enabled()) return res.status(200).json({ ok: false, error: 'redis_not_configured' });

    const ip = ipFromReq(req);
    await enforce({ key: rlKey('lb:top:ip', ip), limit: 600, windowSec: 60 });

    const url = new URL(req.url, 'http://localhost');
    const gameId = String(url.searchParams.get('gameId') || '').trim();
    const period = String(url.searchParams.get('period') || 'daily').trim();
    const eligible = String(url.searchParams.get('eligible') || '0').trim() === '1';

    if (!gameId || !GAMES[gameId]) return res.status(400).json({ error: 'bad_game' });

    const cookies = parseCookies(req);
    const s = readSession(cookies);
    const address = s && s.address ? String(s.address) : '';
    const addrLc = address ? address.toLowerCase() : '';

    const ymd = ymdUtc();
    const wk = weekKeyUtc();

    let key = eligible ? K.lbDailyPaid(gameId, ymd) : K.lbDaily(gameId, ymd);
    if (period === 'weekly') key = eligible ? K.lbWeeklyPaid(gameId, wk) : K.lbWeekly(gameId, wk);
    if (period === 'all') key = eligible ? K.lbAllPaid(gameId) : K.lbAll(gameId);

    const raw = await R.cmd('ZREVRANGE', key, 0, 19, 'WITHSCORES');
    const items = parseWithScores(raw);

    let you = null;
    if (addrLc) {
      const youScore = await R.cmd('ZSCORE', key, addrLc);
      if (youScore != null) {
        const r = await R.cmd('ZREVRANK', key, addrLc);
        you = {
          rank: r == null ? null : Number(r) + 1,
          score: Math.max(0, Number(youScore || 0)),
        };
      }
    }

    const entries = items.map((it, idx) => ({ rank: idx + 1, address: it.member, score: it.score }));
    await bump('leaderboard_top', 200);

    return res.status(200).json({ ok: true, eligible, gameId, period, key, entries, you });
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
