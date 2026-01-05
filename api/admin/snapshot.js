// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

/**
 * Admin Snapshot (data spine)
 * - Admin-only endpoint for 3D map + ops monitoring.
 * - NO UI, just JSON.
 *
 * Route: GET /api/admin/snapshot
 *
 * Security:
 * - Requires a valid session cookie (same as other /api/* endpoints).
 * - Requires the session address to be in GA_ADMIN_ADDRS allowlist.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parseCookies } from '../_lib/util.js';
import { readSession } from '../_lib/session.js';
import { checkPoh } from '../_lib/poh.js';
import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';
import * as X from '../_lib/exclusions.js';
import * as A from '../_lib/admin.js';

function ymdUtc(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function weekKeyUtc(d = new Date()) {
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

function nextUtcMidnightIso() {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0));
  return next.toISOString();
}

function nextUtcMondayIso() {
  const d = new Date();
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  const dayNum = date.getUTCDay() || 7; // 1..7 (Mon..Sun)
  const daysToNextMon = 8 - dayNum;
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysToNextMon, 0, 0, 0));
  return next.toISOString();
}

async function getLastSettledYmd() {
  const arr = await R.cmd('LRANGE', K.epochsList(), 0, 0);
  if (Array.isArray(arr) && arr.length) return String(arr[0] || '');
  return '';
}

async function getLastSettledYw() {
  const arr = await R.cmd('LRANGE', K.weeksList(), 0, 0);
  if (Array.isArray(arr) && arr.length) return String(arr[0] || '');
  return '';
}

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(String(str));
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
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

function maskAddr(a) {
  const s = String(a || '');
  if (!s) return '';
  if (s.length <= 12) return s;
  return s.slice(0, 6) + '…' + s.slice(-4);
}

async function readJson(relPath, fallback) {
  try {
    const p = path.join(process.cwd(), relPath);
    if (!fs.existsSync(p)) return fallback;
    const raw = await fs.promises.readFile(p, 'utf8');
    return safeJsonParse(raw, fallback);
  } catch {
    return fallback;
  }
}

function normalizeGames(gamesJson) {
  if (Array.isArray(gamesJson)) return gamesJson;
  if (gamesJson && Array.isArray(gamesJson.games)) return gamesJson.games;
  return [];
}

function normalizeMetricsLib(libJson) {
  if (Array.isArray(libJson)) return libJson;
  if (libJson && Array.isArray(libJson.metrics)) return libJson.metrics;
  return [];
}

function pick(obj, keys) {
  const o = {};
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) o[k] = obj[k];
  }
  return o;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

    const cookies = parseCookies(req);
    const s = readSession(cookies);
    const authenticated = !!(s && s.address);
    const address = authenticated ? String(s.address) : '';
    const addrLc = address ? address.toLowerCase() : '';

    if (!authenticated) return res.status(401).json({ error: 'not_authenticated' });
    if (!A.isAdmin(addrLc)) {
      return res.status(403).json({
        error: 'admin_only',
        address: maskAddr(address),
      });
    }

    if (!R.enabled()) return res.status(503).json({ error: 'redis_not_configured' });

    let pohVerified = false;
    if (authenticated && !s.demo) {
      try {
        pohVerified = await checkPoh(address);
      } catch {
        pohVerified = false;
      }
    } else {
      pohVerified = true;
    }

    const nowIso = new Date().toISOString();
    const today = ymdUtc();
    const curWeek = weekKeyUtc();

    const lastYmd = await getLastSettledYmd();
    const lastYw = await getLastSettledYw();

    // --- Summaries (latest settled) ---
    let lastSummary = null;
    let lastLotteryWinners = [];
    if (lastYmd) {
      const sum = await R.cmd('HGETALL', K.epochSummary(lastYmd));
      if (Array.isArray(sum) && sum.length) {
        const o = parseHgetallStr(sum);
        lastSummary = o;
        if (o.lotteryWinnersJson) {
          const parsed = safeJsonParse(o.lotteryWinnersJson, []);
          if (Array.isArray(parsed)) lastLotteryWinners = parsed;
        }
      }
    }

    let lastWeekSummary = null;
    if (lastYw) {
      const sum = await R.cmd('HGETALL', K.weekSummary(lastYw));
      if (Array.isArray(sum) && sum.length) lastWeekSummary = parseHgetallStr(sum);
    }

    // --- Claims (latest settled) ---
    let claimable = null;
    if (lastYmd) {
      const raw = await R.cmd('HGET', K.epochClaims(lastYmd), addrLc);
      const claimed = await R.cmd('SISMEMBER', K.epochClaimed(lastYmd), addrLc);
      const rec = raw ? safeJsonParse(raw, null) : null;
      claimable = { ymd: lastYmd, claimed: !!claimed, record: rec };
    }

    let weekClaimable = null;
    if (lastYw) {
      const raw = await R.cmd('HGET', K.weekClaims(lastYw), addrLc);
      const claimed = await R.cmd('SISMEMBER', K.weekClaimed(lastYw), addrLc);
      const rec = raw ? safeJsonParse(raw, null) : null;
      weekClaimable = { yw: lastYw, claimed: !!claimed, record: rec };
    }

    // --- Activity ---
    let todayActScore = 0;
    let todayTickets = 0;
    let weekActScore = 0;

    const z = await R.cmd('ZSCORE', K.actDaily(today), addrLc);
    todayActScore = z == null ? 0 : Math.max(0, Number(z || 0));
    if (todayActScore > 0) todayTickets = Math.max(1, Math.floor(Math.sqrt(todayActScore)));

    const wz = await R.cmd('ZSCORE', K.actWeekly(curWeek), addrLc);
    weekActScore = wz == null ? 0 : Math.max(0, Number(wz || 0));

    // --- Pots ---
    let curWeekPotCents = 0;
    try {
      const p = await R.cmd('GET', K.weekPot(curWeek));
      curWeekPotCents = p == null ? 0 : Math.max(0, Number(p || 0));
    } catch {
      curWeekPotCents = 0;
    }

    // --- Catalog (filesystem) ---
    const gamesJson = await readJson('public/arcade-games.json', null);
    const metricsJson = await readJson('public/arcade-metrics-library.json', null);

    const games = normalizeGames(gamesJson);
    const metricsLib = normalizeMetricsLib(metricsJson);

    const libSet = new Set(metricsLib.map((m) => String(m?.id || '').trim()).filter(Boolean));

    const byType = {};
    const econGames = [];
    const missingSpendCaps = [];
    const metricsMissingFromLibrary = [];
    const gamesMissingDefaultMetric = [];

    for (const g of games) {
      const id = String(g?.id || g?.gameId || '').trim();
      if (!id) continue;

      const type = String(g?.type || g?.genre || (Array.isArray(g?.tags) ? g.tags[0] : '') || 'unknown').trim();
      byType[type] = (byType[type] || 0) + 1;

      if (g?.usesCreditsInRun) {
        econGames.push(id);
        const cap = Number(g?.rankedSpendCapAC || 0);
        if (!isFinite(cap) || cap <= 0) missingSpendCaps.push(id);
      }

      const def = String(g?.defaultMetric || '').trim();
      if (!def) gamesMissingDefaultMetric.push(id);

      const mlist = Array.isArray(g?.metrics) ? g.metrics : [];
      for (const m of mlist) {
        const mid = String(m?.id || '').trim();
        if (!mid) continue;
        if (!libSet.has(mid)) metricsMissingFromLibrary.push({ gameId: id, metricId: mid });
      }
    }

    // Dedupe missing metrics list
    const missingKey = new Set();
    const missingUniq = [];
    for (const x of metricsMissingFromLibrary) {
      const k = x.gameId + '::' + x.metricId;
      if (missingKey.has(k)) continue;
      missingKey.add(k);
      missingUniq.push(x);
    }

    // --- Admin transparency ---
    const excluded = X.excludedAddrs ? X.excludedAddrs() : [];
    const payoutExcluded = X.isExcluded ? X.isExcluded(addrLc) : false;

    // weekly reserve default (documented)
    const weeklyReservePct = Math.max(0, Math.min(50, Number(process.env.ECON_WEEKLY_RESERVE_PCT || 15)));

    return res.status(200).json({
      ok: true,
      spineVersion: 'admin-snapshot-v1',
      nowIso,
      todayYmd: today,
      currentWeekYw: curWeek,

      admin: {
        address,
        addressMasked: maskAddr(address),
        pohVerified,
        payoutExcluded,
        allowlistCount: A.adminAddrs().length,
      },

      exclusions: {
        count: excluded.length,
        addrs: excluded,
      },

      economy: {
        weeklyReservePct,
      },

      epoch: {
        nextEpochAtUtc: nextUtcMidnightIso(),
        lastSettledYmd: lastYmd,
        lastSummary,
        lastLotteryWinners,
        claimable,
      },

      week: {
        nextWeekAtUtc: nextUtcMondayIso(),
        lastSettledYw: lastYw,
        lastWeekSummary,
        weekClaimable,
        curWeekPotCents,
      },

      activity: {
        todayActScore,
        todayTickets,
        weekActScore,
      },

      catalog: {
        gamesCount: games.length,
        metricsCount: metricsLib.length,
        byType,
        economyGames: econGames,
        guardrails: {
          missingSpendCaps,
          gamesMissingDefaultMetric,
          metricsMissingFromLibrary: missingUniq.slice(0, 200),
        },
      },
    });
  } catch {
    return res.status(500).json({ error: 'server_error' });
  }
}
