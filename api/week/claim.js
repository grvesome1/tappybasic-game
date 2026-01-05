// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { parseCookies, readJson } from '../_lib/util.js';
import { readSession } from '../_lib/session.js';
import { checkPoh } from '../_lib/poh.js';
import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';
import { ipFromReq, enforce, rlKey } from '../_lib/rate.js';
import { sameOrigin } from '../_lib/security.js';
import { bump } from '../_lib/metrics.js';
import { isPayoutExcluded } from '../_lib/payoutExclusion.js';

async function getLastSettledYw() {
  const arr = await R.cmd('LRANGE', K.weeksList(), 0, 0);
  if (Array.isArray(arr) && arr.length) return String(arr[0] || '');
  return '';
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!R.enabled()) return res.status(503).json({ error: 'redis_not_configured' });

    if (!sameOrigin(req)) {
      await bump('week_claim', 403);
      return res.status(403).json({ error: 'bad_origin' });
    }

    const ip = ipFromReq(req);
    await enforce({ key: rlKey('week:claim:ip', ip), limit: 40, windowSec: 3600 });

    const cookies = parseCookies(req);
    const s = readSession(cookies);
    if (!s || !s.address) return res.status(401).json({ error: 'not_authenticated' });

    const address = String(s.address);
    await enforce({ key: rlKey('week:claim:addr', address.toLowerCase()), limit: 15, windowSec: 3600 });
    const addrLc = address.toLowerCase();

    if (isPayoutExcluded(addrLc)) {
      await bump('week_claim', 403);
      return res.status(403).json({ error: 'excluded_from_payouts' });
    }

    if (!s.demo) {
      let ok = false;
      try {
        ok = await checkPoh(address);
      } catch {
        ok = false;
      }
      if (!ok) return res.status(403).json({ error: 'poh_required' });
    }

    const body = await readJson(req).catch(() => ({}));
    let yw = String(body.yw || '').trim();
    if (!yw) yw = await getLastSettledYw();
    if (!yw) return res.status(404).json({ error: 'no_settled_week' });

    const claimsKey = K.weekClaims(yw);
    const claimedKey = K.weekClaimed(yw);

    const raw = await R.cmd('HGET', claimsKey, addrLc);
    if (!raw) {
      await R.cmd('HINCRBY', K.profile(address), 'txCount', 1);
      await R.cmd('HSET', K.profile(address), 'lastActiveAt', new Date().toISOString());
      await bump('week_claim', 200);
      return res.status(200).json({ ok: true, yw, address, amountUsd: 0, record: null, claimed: true, note: 'no_rewards' });
    }

    const already = await R.cmd('SISMEMBER', claimedKey, addrLc);
    if (already) return res.status(409).json({ error: 'already_claimed' });

    let rec = null;
    try {
      rec = JSON.parse(String(raw));
    } catch {
      rec = null;
    }

    const audit = JSON.stringify({
      t: 'week_claim',
      ts: new Date().toISOString(),
      yw,
      amountCents: rec ? Number(rec.totalCents || 0) : 0,
    });

    await R.pipeline([
      ['SADD', claimedKey, addrLc],
      ['HINCRBY', K.profile(address), 'txCount', 1],
      ['HSET', K.profile(address), 'lastActiveAt', new Date().toISOString()],
      ['LPUSH', K.audit(address), audit],
      ['LTRIM', K.audit(address), 0, 99],
    ]);

    const cents = rec ? Math.max(0, Number(rec.totalCents || 0)) : 0;
    await bump('week_claim', 200);

    return res.status(200).json({
      ok: true,
      yw,
      address,
      claimed: true,
      amountUsd: Number((cents / 100).toFixed(2)),
      record: rec,
    });
  } catch (e) {
    if (e && e.code === 'RATE_LIMIT') {
      try {
        await bump('week_claim', 429);
      } catch {}
      return res.status(429).json({ error: 'rate_limited', limit: e.limit, windowSec: e.windowSec });
    }
    try {
      await bump('week_claim', 500);
    } catch {}
    return res.status(500).json({ error: 'server_error' });
  }
}
