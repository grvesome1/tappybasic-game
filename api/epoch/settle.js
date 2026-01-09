// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import crypto from 'node:crypto';

import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';
import * as X from '../_lib/exclusions.js';
import { GAMES, DEFAULTS } from '../_lib/games.js';
import { bearerToken, isVercelCron, queryParam } from '../_lib/security.js';
import { bump } from '../_lib/metrics.js';

function clamp(n, a, b) {
  n = Number(n);
  if (!isFinite(n)) n = a;
  return Math.max(a, Math.min(b, n));
}

function ymdUtc(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function ymdYesterdayUtc() {
  const d = new Date();
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1, 0, 0, 0));
  return ymdUtc(prev);
}


function dateFromYmdUtc(ymd) {
  const s = String(ymd || '');
  if (!/^\d{8}$/.test(s)) return new Date();
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

function weekKeyFromDateUtc(d) {
  // ISO week key: YYYYWww (UTC)
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  const y = date.getUTCFullYear();
  const w = String(weekNo).padStart(2, '0');
  return String(y) + 'W' + w;
}

function weekKeyFromYmdUtc(ymd) {
  return weekKeyFromDateUtc(dateFromYmdUtc(ymd));
}

function normalizeMetrics(cfg) {
  const list = Array.isArray(cfg?.metrics) ? cfg.metrics : [];
  if (list.length) return list;
  return [{ id: 'score', label: 'Score', kind: 'score', dir: 'desc', format: 'int', src: 'score', payoutWeight: 1.0 }];
}

function payoutMetrics(cfg) {
  const metrics = normalizeMetrics(cfg);
  const positive = metrics.filter((m) => Number(m?.payoutWeight || 0) > 0);
  if (positive.length) return positive;
  const defId = String(cfg?.defaultMetric || 'score');
  const def = metrics.find((m) => String(m?.id || '') === defId) || metrics[0];
  return def ? [{ ...def, payoutWeight: 1.0 }] : [{ id: 'score', payoutWeight: 1.0 }];
}
function parseHgetallNum(arr) {
  const out = {};
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < arr.length; i += 2) {
    const k = String(arr[i] ?? '');
    const v = Number(arr[i + 1] ?? 0);
    if (!k) continue;
    out[k] = Math.max(0, v);
  }
  return out;
}

function parseHgetallStr(arr) {
  const out = {};
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < arr.length; i += 2) {
    const k = String(arr[i] ?? '');
    const v = String(arr[i + 1] ?? '');
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

function parseZWithScores(arr) {
  const out = [];
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < arr.length; i += 2) {
    const member = String(arr[i] ?? '').toLowerCase();
    const score = Number(arr[i + 1] ?? 0);
    if (!member) continue;
    out.push({ member, score: Math.max(0, score) });
  }
  return out;
}

function distribute(poolCents, entries, weightFn) {
  poolCents = Math.max(0, Math.floor(Number(poolCents) || 0));
  if (!poolCents || !entries || !entries.length) return {};
  const weights = entries.map((e, i) => Math.max(0, Number(weightFn(e, i)) || 0));
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return {};
  const out = {};
  let allocated = 0;
  for (let i = 0; i < entries.length; i++) {
    const addr = entries[i].member;
    const cents = Math.floor(poolCents * (weights[i] / sumW));
    if (cents > 0) out[addr] = (out[addr] || 0) + cents;
    allocated += cents;
  }
  let rem = poolCents - allocated;
  let i = 0;
  while (rem > 0 && i < entries.length) {
    const addr = entries[i].member;
    out[addr] = (out[addr] || 0) + 1;
    rem -= 1;
    i += 1;
    if (i >= entries.length) i = 0;
  }
  return out;
}

function addClaim(map, addr, field, cents, extra) {
  cents = Math.max(0, Math.floor(Number(cents) || 0));
  if (!cents) return;
  addr = String(addr || '').toLowerCase();
  if (!addr) return;
  if (!map[addr]) {
    map[addr] = { totalCents: 0, skillCents: 0, activityCents: 0, proCents: 0, lotteryCents: 0, byGame: {} };
  }
  map[addr][field] = (map[addr][field] || 0) + cents;
  map[addr].totalCents += cents;
  if (extra && extra.gameId) {
    const gid = String(extra.gameId);
    map[addr].byGame[gid] = (map[addr].byGame[gid] || 0) + cents;
  }
}

async function getProfiles(addrs) {
  if (!addrs.length) return {};
  const cmds = [];
  for (const a of addrs) cmds.push(['HGETALL', K.profile(a)]);
  const res = await R.pipeline(cmds);
  const out = {};
  for (let i = 0; i < addrs.length; i++) {
    const raw = res[i];
    const obj = {};
    if (Array.isArray(raw)) {
      for (let j = 0; j < raw.length; j += 2) obj[String(raw[j])] = String(raw[j + 1]);
    }
    out[String(addrs[i]).toLowerCase()] = obj;
  }
  return out;
}

function isProActive(proTier, proExpRaw) {
  const tier = String(proTier || 'none');
  if (!tier || tier === 'none') return { active: false, tier: 'none' };
  if (tier === 'lifetime') return { active: true, tier };
  const ms = Number(proExpRaw || 0);
  if (!isFinite(ms) || ms <= 0) return { active: true, tier };
  return { active: Date.now() < ms, tier };
}

function proMult(tier) {
  if (tier === 'prime') return 1.5;
  if (tier === 'lifetime') return 2.0;
  if (tier === 'mini') return 1.0;
  return 1.0;
}

function hashSeedHex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function makeRng(seedStr) {
  const h = crypto.createHash('sha256').update(seedStr).digest();
  let x = (h.readUInt32BE(0) ^ 0xa5a5a5a5) >>> 0;
  return () => {
    x ^= (x << 13) >>> 0;
    x ^= (x >>> 17) >>> 0;
    x ^= (x << 5) >>> 0;
    return (x >>> 0) / 4294967296;
  };
}

function pickWeightedUnique(entries, k, rng) {
  const pool = (entries || [])
    .map((e) => ({
      member: e.member,
      score: Math.max(0, Number(e.score || 0)),
      w: Math.sqrt(Math.max(0, Number(e.score || 0))),
    }))
    .filter((e) => e.w > 0);

  const out = [];
  k = Math.max(0, Math.floor(Number(k) || 0));
  for (let t = 0; t < k && pool.length; t++) {
    const sumW = pool.reduce((a, b) => a + b.w, 0);
    if (sumW <= 0) break;
    let r = rng() * sumW;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

function prizesFor(poolCents, n) {
  poolCents = Math.max(0, Math.floor(Number(poolCents) || 0));
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (!poolCents || !n) return [];
  if (n === 1) return [poolCents];

  const out = new Array(n).fill(0);
  if (n === 2) {
    out[0] = Math.floor(poolCents * 0.6);
    out[1] = poolCents - out[0];
    return out;
  }

  out[0] = Math.floor(poolCents * 0.35);
  out[1] = Math.floor(poolCents * 0.2);
  out[2] = Math.floor(poolCents * 0.15);
  let used = out[0] + out[1] + out[2];
  let rem = poolCents - used;

  const rest = n - 3;
  if (rest <= 0) {
    out[2] += rem;
    return out;
  }

  const each = Math.floor(rem / rest);
  for (let i = 3; i < n; i++) out[i] = each;
  used += each * rest;
  rem = poolCents - used;

  let i = 0;
  while (rem > 0) {
    const idx = 3 + (i % rest);
    out[idx] += 1;
    rem -= 1;
    i += 1;
  }
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    if (!R.enabled()) return res.status(503).json({ error: 'redis_not_configured' });

    const url = new URL(req.url, 'http://localhost');
    const ymdParam = String(url.searchParams.get('ymd') || '').trim();
    const ymd = ymdParam || ymdYesterdayUtc();
    const today = ymdUtc();

    if (!/^\d{8}$/.test(ymd)) return res.status(400).json({ error: 'bad_ymd' });
    if (ymd >= today) return res.status(400).json({ error: 'epoch_must_be_past' });

    const cronOk = isVercelCron(req);
    const secret = String(process.env.CRON_SECRET || process.env.EPOCH_SETTLE_SECRET || '').trim();
    if (!cronOk) {
      if (!secret) {
        await bump('epoch_settle', 403);
        return res.status(403).json({ error: 'cron_secret_required' });
      }
      const q = String(url.searchParams.get('key') || url.searchParams.get('token') || '').trim();
      const b = bearerToken(req);
      if (q !== secret && b !== secret) {
        await bump('epoch_settle', 401);
        return res.status(401).json({ error: 'unauthorized' });
      }
    }

    const sumKey = K.epochSummary(ymd);
    const existing = await R.cmd('HGET', sumKey, 'settledAt');
    if (existing) {
      const raw = await R.cmd('HGETALL', sumKey);
      await bump('epoch_settle', 200);
      return res.status(200).json({ ok: true, ymd, already: true, summary: parseHgetallStr(raw) });
    }

    const spendRaw = await R.cmd('HGETALL', K.spentDay(ymd));
    const spend = parseHgetallNum(spendRaw);
    const totalSpentAC = Object.values(spend).reduce((a, b) => a + b, 0);

    const yw = weekKeyFromYmdUtc(ymd);

    const takePct = clamp(process.env.ECON_TAKE_PCT || 12, 0, 35) / 100;
    const grossCents = Math.round(totalSpentAC * DEFAULTS.acUsd * 100);
    const potCents0 = Math.max(0, Math.floor(grossCents * (1 - takePct)));
    const opsCents0 = Math.max(0, grossCents - potCents0);

    // Weekly reserve is carved out of the daily pot (after take). This funds weekly payouts.
    const reservePct = clamp(process.env.ECON_WEEKLY_RESERVE_PCT || 15, 0, 50) / 100;
    const weekReserveCents = Math.max(0, Math.floor(potCents0 * reservePct));
    const potCents = Math.max(0, potCents0 - weekReserveCents);

    let skillPool = Math.floor(potCents * 0.55);
    let activityPool = Math.floor(potCents * 0.35);
    let proPool = Math.max(0, potCents - skillPool - activityPool);

    const eligibleGames = Object.entries(GAMES)
      .filter(([, cfg]) => !!cfg.payoutEligible)
      .map(([gid]) => gid);

    const spentEligibleAC = eligibleGames.reduce((sum, gid) => sum + (spend[gid] || 0), 0);

    if (spentEligibleAC <= 0) {
      activityPool += skillPool;
      skillPool = 0;
    }

    const lotteryPct = clamp(process.env.ECON_LOTTERY_PCT || 8, 0, 25) / 100;
    let lotteryPool = Math.floor(activityPool * lotteryPct);
    activityPool = Math.max(0, activityPool - lotteryPool);

    const claims = {};

    const skillTopN = clamp(process.env.ECON_SKILL_TOP || 25, 5, 100);
    const pow = clamp(process.env.ECON_RANK_POW || 1.25, 1.05, 1.8);

    const skillFetchExtra = clamp(process.env.ECON_SKILL_FETCH_EXTRA || 100, 0, 500);
    const actFetchExtra = clamp(process.env.ECON_ACTIVITY_FETCH_EXTRA || 500, 0, 5000);

    for (const gid of eligibleGames) {
      const gameSpent = spend[gid] || 0;
      if (!gameSpent || !skillPool) continue;
      const denom = Math.max(1, spentEligibleAC);
      const gameSkillPool = Math.floor(skillPool * (gameSpent / denom));
      if (gameSkillPool <= 0) continue;

      const gameCfg = GAMES[gid] || {};
      const metrics = payoutMetrics(gameCfg);
      const wSum = metrics.reduce((a, m) => a + Math.max(0, Number(m.payoutWeight || 0)), 0) || 1;

      let allocated = 0;
      for (let mi = 0; mi < metrics.length; mi++) {
        const m = metrics[mi];
        const w = Math.max(0, Number(m.payoutWeight || 0)) || 0;
        let metricPool = mi === metrics.length - 1 ? Math.max(0, gameSkillPool - allocated) : Math.floor(gameSkillPool * (w / wSum));
        allocated += metricPool;
        if (metricPool <= 0) continue;

        const metricId = String(m.id || 'score');
        let lbKey = K.lbDailyPaidMetric(gid, metricId, ymd);
        let raw = await R.cmd('ZREVRANGE', lbKey, 0, (skillTopN + skillFetchExtra) - 1, 'WITHSCORES');
        let top = parseZWithScores(raw);

        // Backward-compatible fallback for the default metric (old leaderboard key)
        const defId = String(gameCfg.defaultMetric || 'score');
        if (!top.length && metricId === defId) {
          lbKey = K.lbDailyPaid(gid, ymd);
          raw = await R.cmd('ZREVRANGE', lbKey, 0, (skillTopN + skillFetchExtra) - 1, 'WITHSCORES');
          top = parseZWithScores(raw);
        }

        const topEligible = X.filterExcluded(top, 'member').slice(0, skillTopN);
        if (!topEligible.length) continue;

        const payouts = distribute(metricPool, topEligible, (_, i) => 1 / Math.pow(i + 1, pow));
        for (const [addr, cents] of Object.entries(payouts)) addClaim(claims, addr, 'skillCents', cents, { gameId: gid });
      }
    }

    const actTopN = clamp(process.env.ECON_ACT_TOP || 2000, 25, 5000);
    const actKey = K.actDaily(ymd);
    const actRaw = await R.cmd('ZREVRANGE', actKey, 0, (actTopN + actFetchExtra) - 1, 'WITHSCORES');
    const actTop = parseZWithScores(actRaw).filter((e) => (e.score || 0) > 0);
    const actTopEligible = X.filterExcluded(actTop, 'member').slice(0, actTopN);

    const actPayouts = distribute(activityPool, actTopEligible, (e) => Math.sqrt(Math.max(0, e.score || 0)));
    for (const [addr, cents] of Object.entries(actPayouts)) addClaim(claims, addr, 'activityCents', cents);

    const activeAddrs = actTopEligible.map((x) => x.member);
    const profiles = activeAddrs.length ? await getProfiles(activeAddrs) : {};
    const proEntries = actTopEligible
      .map((e) => {
        const p = profiles[e.member] || {};
        const st = isProActive(p.proTier, p.proExp);
        if (!st.active) return null;
        const mult = proMult(st.tier);
        return { member: e.member, score: e.score, mult };
      })
      .filter(Boolean);

    const proPayouts = distribute(proPool, proEntries, (e) => Math.sqrt(Math.max(0, e.score || 0)) * (e.mult || 1));
    for (const [addr, cents] of Object.entries(proPayouts)) addClaim(claims, addr, 'proCents', cents);

    const participantsAct = actTopEligible.length;
    const minPrizeCents = clamp(process.env.ECON_LOTTERY_MIN_PRIZE_CENTS || 25, 1, 500);
    const maxWinnersByPot = lotteryPool > 0 ? Math.max(1, Math.floor(lotteryPool / minPrizeCents)) : 0;

    let winnersCount = 0;
    if (lotteryPool > 0 && participantsAct > 0) {
      winnersCount = clamp(Math.ceil(participantsAct / 50), 1, 25);
      if (participantsAct >= 50) winnersCount = Math.max(winnersCount, 3);
      winnersCount = Math.min(winnersCount, participantsAct);
      winnersCount = Math.min(winnersCount, maxWinnersByPot);
    }

    const lotteryWinners = [];
    const lotterySeedMaterial = `${ymd}|${grossCents}|${potCents0}|${participantsAct}|${String(process.env.LOTTERY_SEED_SECRET || '').trim()}`;
    const lotterySeed = hashSeedHex(lotterySeedMaterial).slice(0, 16);

    if (winnersCount > 0) {
      const rng = makeRng(lotterySeedMaterial);
      const picks = pickWeightedUnique(actTopEligible, winnersCount, rng);
      const prizes = prizesFor(lotteryPool, picks.length);

      for (let i = 0; i < picks.length; i++) {
        const addr = picks[i].member;
        const cents = Math.max(0, Math.floor(Number(prizes[i] || 0)));
        if (!cents) continue;
        addClaim(claims, addr, 'lotteryCents', cents);
        lotteryWinners.push({
          address: addr,
          prizeCents: cents,
          prizeUsd: Number((cents / 100).toFixed(2)),
          weightScore: Math.max(0, Number(picks[i].score || 0)),
        });
      }
    }

    const claimKv = [];
    for (const [addr, rec] of Object.entries(claims)) {
      const out = {
        ymd,
        address: addr,
        totalCents: rec.totalCents,
        totalUsd: Number((rec.totalCents / 100).toFixed(2)),
        skillCents: rec.skillCents,
        activityCents: rec.activityCents,
        proCents: rec.proCents,
        lotteryCents: rec.lotteryCents,
        byGame: rec.byGame,
      };
      claimKv.push(addr, JSON.stringify(out));
    }

    const participants = Object.keys(claims).length;
    const settledAt = new Date().toISOString();

    const sumKv = [
      'ymd',
      ymd,
      'settledAt',
      settledAt,
      'totalSpentAC',
      String(Math.round(totalSpentAC)),
      'grossCents',
      String(grossCents),
      'potCents',
      String(potCents),
      'potCentsBeforeReserve',
      String(potCents0),
      'weekReservePct',
      String(reservePct),
      'weekReserveCents',
      String(weekReserveCents),
      'weekKey',
      String(yw),
      'opsCents',
      String(opsCents0),
      'takePct',
      String(takePct),
      'skillPoolCents',
      String(skillPool),
      'activityPoolCents',
      String(activityPool),
      'proPoolCents',
      String(proPool),
      'lotteryPoolCents',
      String(lotteryPool),
      'lotteryPct',
      String(lotteryPct),
      'lotteryMinPrizeCents',
      String(minPrizeCents),
      'lotteryWinnersCount',
      String(lotteryWinners.length),
      'lotterySeed',
      String(lotterySeed),
      'lotteryWinnersJson',
      JSON.stringify(lotteryWinners),
      'participants',
      String(participants),
    ];

    const claimsKey = K.epochClaims(ymd);
    const claimedKey = K.epochClaimed(ymd);
    const listKey = K.epochsList();

    const cmds = [
      ['HSET', sumKey, ...sumKv],
      ['LPUSH', listKey, ymd],
      ['LTRIM', listKey, 0, 59],
      ['EXPIRE', sumKey, 60 * 60 * 24 * 180],
      ['EXPIRE', claimsKey, 60 * 60 * 24 * 180],
      ['EXPIRE', claimedKey, 60 * 60 * 24 * 180],
    ];


    // Roll daily weekly-reserve into the current ISO-week pot (in cents)
    if (weekReserveCents > 0) {
      cmds.push(['INCRBY', K.weekPot(yw), weekReserveCents]);
      cmds.push(['EXPIRE', K.weekPot(yw), 60 * 60 * 24 * 240]);
    }

    if (claimKv.length) cmds.push(['HSET', claimsKey, ...claimKv]);

    await R.pipeline(cmds);

    await bump('epoch_settle', 200);
    return res.status(200).json({
      ok: true,
      ymd,
      already: false,
      summary: {
        ymd,
        settledAt,
        totalSpentAC,
        grossCents,
        potCents: potCents,
        potCentsBeforeReserve: potCents0,
        weekReserveCents,
        weekKey: yw,
        opsCents: opsCents0,
        takePct,
        skillPoolCents: skillPool,
        activityPoolCents: activityPool,
        proPoolCents: proPool,
        lotteryPoolCents: lotteryPool,
        lotteryWinnersCount: lotteryWinners.length,
        participants,
      },
      lotteryWinners,
    });
  } catch (e) {
    try {
      await bump('epoch_settle', 500);
    } catch {}
    const msg = e && e.message ? String(e.message) : '';
    return res.status(500).json({ error: 'server_error', msg });
  }
}
