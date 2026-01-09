// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { getSession } from '../_lib/session.js';
import { checkPoh } from '../_lib/poh.js';
import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';
import * as X from '../_lib/exclusions.js';

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

function nextUtcMondayIso() {
  const d = new Date();
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  const dayNum = date.getUTCDay() || 7; // 1..7
  const daysToNextMon = 8 - dayNum;
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysToNextMon, 0, 0, 0));
  return next.toISOString();
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

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    const s = await getSession(req);

    const authenticated = !!(s && s.address);
    const address = authenticated ? String(s.address) : '';
    const addrLc = address ? address.toLowerCase() : '';

    let pohVerified = false;
    if (authenticated) {
      if (s.demo) pohVerified = true;
      else if (typeof s.pohVerified === 'boolean') pohVerified = !!s.pohVerified;
      else {
        try {
          pohVerified = await checkPoh(address);
        } catch {
          pohVerified = false;
        }
      }
    }

    const curWeek = weekKeyUtc();

    if (!R.enabled()) {
      return res.status(200).json({
        ok: true,
        redisEnabled: false,
        currentWeekYw: curWeek,
        nextWeekAtUtc: nextUtcMondayIso(),
        lastSettledYw: '',
        lastWeekSummary: null,
        weekClaimable: null,
        curWeekPotCents: 0,
        authenticated,
        address,
        pohVerified,
      });
    }

    const lastYw = await getLastSettledYw();

    let lastWeekSummary = null;
    if (lastYw) {
      const sum = await R.cmd('HGETALL', K.weekSummary(lastYw));
      if (Array.isArray(sum) && sum.length) lastWeekSummary = parseHgetallStr(sum);
    }

    let weekClaimable = null;
    if (authenticated && lastYw) {
      const raw = await R.cmd('HGET', K.weekClaims(lastYw), addrLc);
      const claimed = await R.cmd('SISMEMBER', K.weekClaimed(lastYw), addrLc);
      const rec = raw ? safeJsonParse(raw, null) : null;
      weekClaimable = { yw: lastYw, claimed: !!claimed, record: rec };
    }

    let curWeekPotCents = 0;
    try {
      const p = await R.cmd('GET', K.weekPot(curWeek));
      curWeekPotCents = p == null ? 0 : Math.max(0, Number(p || 0));
    } catch {
      curWeekPotCents = 0;
    }

    return res.status(200).json({
      ok: true,
      redisEnabled: true,
      currentWeekYw: curWeek,
      nextWeekAtUtc: nextUtcMondayIso(),
      lastSettledYw: lastYw,
      lastWeekSummary,
      weekClaimable,
      curWeekPotCents,
      authenticated,
      address,
      pohVerified,
    });
  } catch {
    return res.status(500).json({ error: 'server_error' });
  }
}
