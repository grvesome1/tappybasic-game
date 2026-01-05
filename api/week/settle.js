// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';
import * as X from '../_lib/exclusions.js';
import { GAMES, DEFAULTS } from '../_lib/games.js';
import { isVercelCron, bearerToken } from '../_lib/security.js';
import { bump } from '../_lib/metrics.js';

function clamp(n, a, b) {
  n = Number(n) || 0;
  return Math.max(a, Math.min(b, n));
}

function weekKeyUtc(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  const y = date.getUTCFullYear();
  const w = String(weekNo).padStart(2, '0');
  return String(y) + 'W' + w;
}

function ymdFromDateUtc(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function isoWeekStartUtc(yw) {
  // Returns Monday 00:00 UTC for ISO week key YYYYWww
  const m = String(yw || '').match(/^(\d{4})W(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);

  // ISO week 1 is the week with Jan 4 in it.
  const jan4 = new Date(Date.UTC(year, 0, 4, 0, 0, 0));
  const dayNum = jan4.getUTCDay() || 7; // 1..7
  const week1Mon = new Date(Date.UTC(year, 0, 4 - (dayNum - 1), 0, 0, 0));
  const start = new Date(week1Mon.getTime() + (week - 1) * 7 * 86400000);
  return start;
}

function ymdsForWeek(yw) {
  const start = isoWeekStartUtc(yw);
  if (!start) return [];
  const out = [];
  for (let i = 0; i < 7; i++) out.push(ymdFromDateUtc(new Date(start.getTime() + i * 86400000)));
  return out;
}

function parseHgetallNum(arr) {
  const out = {};
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < arr.length; i += 2) {
    const k = String(arr[i] ?? '');
    const v = Number(arr[i + 1] ?? 0);
    if (!k) continue;
    out[k] = isFinite(v) ? v : 0;
  }
  return out;
}

function parseZWithScores(arr) {
  const out = [];
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < arr.length; i += 2) {
    const member = String(arr[i] ?? '');
    const score = Number(arr[i + 1] ?? 0);
    if (!member) continue;
    out.push({ member, score: isFinite(score) ? score : 0 });
  }
  return out;
}

function distribute(poolCents, entries, weightFn) {
  const out = {};
  if (!poolCents || !entries.length) return out;
  const weights = entries.map((e, i) => Math.max(0, Number(weightFn(e, i) || 0)));
  const totalW = weights.reduce((a, b) => a + b, 0);
  if (totalW <= 0) return out;

  let remaining = Math.max(0, Math.floor(poolCents));
  for (let i = 0; i < entries.length; i++) {
    const addr = entries[i].member;
    const share = i === entries.length - 1 ? remaining : Math.floor((poolCents * weights[i]) / totalW);
    remaining -= share;
    if (share > 0) out[addr] = (out[addr] || 0) + share;
  }
  return out;
}

function addClaim(claims, addr, field, cents, extra) {
  addr = String(addr || '').toLowerCase();
  cents = Math.max(0, Math.floor(Number(cents || 0)));
  if (!addr || !cents) return;
  if (!claims[addr]) {
    claims[addr] = { totalCents: 0, skillCents: 0, activityCents: 0, proCents: 0, lotteryCents: 0, byGame: {} };
  }
  claims[addr][field] = (claims[addr][field] || 0) + cents;
  claims[addr].totalCents += cents;

  if (extra && extra.gameId) {
    const gid = String(extra.gameId);
    claims[addr].byGame[gid] = (claims[addr].byGame[gid] || 0) + cents;
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
      for (let j = 0; j < raw.length; j += 2) obj[String(raw[j])] = String(raw[j + 1] ?? '');
    }
    out[addrs[i]] = obj;
  }
  return out;
}

function isProActive(tier, expIso) {
  const t = String(tier || 'none');
  if (t === 'lifetime') return { active: true, tier: 'lifetime' };
  if (t !== 'monthly' && t !== 'yearly') return { active: false, tier: 'none' };
  const exp = String(expIso || '');
  if (!exp) return { active: false, tier: 'none' };
  const ms = Date.parse(exp);
  if (!isFinite(ms)) return { active: false, tier: 'none' };
  if (Date.now() > ms) return { active: false, tier: 'none' };
  return { active: true, tier: t };
}

function proMult(tier) {
  if (tier === 'lifetime') return 1.25;
  if (tier === 'yearly') return 1.1;
  if (tier === 'monthly') return 1.0;
  return 1.0;
}

function normalizeMetrics(cfg) {
  const list = Array.isArray(cfg?.metrics) ? cfg.metrics : [];
  if (list.length) return list;
  return [{ id: 'score', payoutWeight: 1.0 }];
}

function payoutMetrics(cfg) {
  const metrics = normalizeMetrics(cfg);
  const positive = metrics.filter((m) => Number(m?.payoutWeight || 0) > 0);
  if (positive.length) return positive;
  const defId = String(cfg?.defaultMetric || 'score');
  const def = metrics.find((m) => String(m?.id || '') === defId) || metrics[0];
  return def ? [{ ...def, payoutWeight: 1.0 }] : [{ id: 'score', payoutWeight: 1.0 }];
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    if (!R.enabled()) return res.status(503).json({ error: 'redis_not_configured' });
    if (!isVercelCron(req) && !bearerToken(req)) {
      await bump('week_settle', 401);
      return res.status(401).json({ error: 'unauthorized' });
    }

    const url = new URL(req.url, 'http://localhost');
    const curWeek = weekKeyUtc();
    const defaultYw = weekKeyUtc(new Date(Date.now() - 7 * 86400000));
    let yw = String(url.searchParams.get('yw') || defaultYw).trim();

    if (!/^\d{4}W\d{2}$/.test(yw)) return res.status(400).json({ error: 'bad_week' });
    if (yw >= curWeek) return res.status(400).json({ error: 'week_must_be_past' });

    const sumKey = K.weekSummary(yw);
    const already = await R.cmd('HGET', sumKey, 'settledAt');
    if (already) {
      await bump('week_settle', 200);
      return res.status(200).json({ ok: true, yw, already: true });
    }

    const potRaw = await R.cmd('GET', K.weekPot(yw));
    const potCents0 = Math.max(0, Math.floor(Number(potRaw || 0)));

    let skillPool = Math.floor(potCents0 * 0.55);
    let activityPool = Math.floor(potCents0 * 0.35);
    let proPool = Math.max(0, potCents0 - skillPool - activityPool);

    const eligibleGames = Object.entries(GAMES)
      .filter(([, cfg]) => !!cfg.payoutEligible)
      .map(([gid]) => gid);

    const ymds = ymdsForWeek(yw);
    const spendCmds = ymds.map((d) => ['HGETALL', K.spentDay(d)]);
    const spendRes = spendCmds.length ? await R.pipeline(spendCmds) : [];

    const spendWeek = {};
    for (let i = 0; i < spendRes.length; i++) {
      const daySpend = parseHgetallNum(spendRes[i]);
      for (const [gid, v] of Object.entries(daySpend)) {
        spendWeek[gid] = (spendWeek[gid] || 0) + Math.max(0, Number(v || 0));
      }
    }

    const totalSpentAC = Object.values(spendWeek).reduce((a, b) => a + Math.max(0, Number(b || 0)), 0);
    const spentEligibleAC = eligibleGames.reduce((sum, gid) => sum + (spendWeek[gid] || 0), 0);

    if (spentEligibleAC <= 0) {
      activityPool += skillPool;
      skillPool = 0;
    }

    const claims = {};

    const skillTopN = clamp(process.env.ECON_SKILL_TOP || 25, 5, 100);
    const pow = clamp(process.env.ECON_RANK_POW || 1.25, 1.05, 1.8);

    const skillFetchExtra = clamp(process.env.ECON_SKILL_FETCH_EXTRA || 100, 0, 500);
    const actFetchExtra = clamp(process.env.ECON_ACTIVITY_FETCH_EXTRA || 500, 0, 5000);

    for (const gid of eligibleGames) {
      const gameSpent = spendWeek[gid] || 0;
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
        let lbKey = K.lbWeeklyPaidMetric(gid, metricId, yw);
        let raw = await R.cmd('ZREVRANGE', lbKey, 0, (skillTopN + skillFetchExtra) - 1, 'WITHSCORES');
        let top = parseZWithScores(raw);

        const defId = String(gameCfg.defaultMetric || 'score');
        if (!top.length && metricId === defId) {
          lbKey = K.lbWeeklyPaid(gid, yw);
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
    const actKey = K.actWeekly(yw);
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

    const claimKv = [];
    for (const [addr, rec] of Object.entries(claims)) {
      const out = {
        yw,
        address: addr,
        totalCents: rec.totalCents,
        totalUsd: Number((rec.totalCents / 100).toFixed(2)),
        skillCents: rec.skillCents,
        activityCents: rec.activityCents,
        proCents: rec.proCents,
        lotteryCents: 0,
        byGame: rec.byGame,
      };
      claimKv.push(addr, JSON.stringify(out));
    }

    const participants = Object.keys(claims).length;
    const settledAt = new Date().toISOString();

    const weekStartYmd = ymds.length ? ymds[0] : '';
    const weekEndYmd = ymds.length ? ymds[ymds.length - 1] : '';

    const sumKv = [
      'yw',
      yw,
      'settledAt',
      settledAt,
      'potCents',
      String(potCents0),
      'skillPoolCents',
      String(skillPool),
      'activityPoolCents',
      String(activityPool),
      'proPoolCents',
      String(proPool),
      'totalSpentAC',
      String(Math.round(totalSpentAC)),
      'spentEligibleAC',
      String(Math.round(spentEligibleAC)),
      'weekStartYmd',
      weekStartYmd,
      'weekEndYmd',
      weekEndYmd,
      'participants',
      String(participants),
      'acUsd',
      String(DEFAULTS.acUsd),
    ];

    const claimsKey = K.weekClaims(yw);
    const claimedKey = K.weekClaimed(yw);
    const listKey = K.weeksList();

    const cmds = [
      ['HSET', sumKey, ...sumKv],
      ['LPUSH', listKey, yw],
      ['LTRIM', listKey, 0, 119],
      ['EXPIRE', sumKey, 60 * 60 * 24 * 365],
      ['EXPIRE', claimsKey, 60 * 60 * 24 * 365],
      ['EXPIRE', claimedKey, 60 * 60 * 24 * 365],
    ];

    if (claimKv.length) cmds.push(['HSET', claimsKey, ...claimKv]);

    await R.pipeline(cmds);

    await bump('week_settle', 200);
    return res.status(200).json({
      ok: true,
      yw,
      already: false,
      summary: {
        yw,
        settledAt,
        potCents: potCents0,
        skillPoolCents: skillPool,
        activityPoolCents: activityPool,
        proPoolCents: proPool,
        participants,
        weekStartYmd,
        weekEndYmd,
      },
    });
  } catch (e) {
    try {
      await bump('week_settle', 500);
    } catch {}
    const msg = e && e.message ? String(e.message) : '';
    return res.status(500).json({ error: 'server_error', msg });
  }
}
