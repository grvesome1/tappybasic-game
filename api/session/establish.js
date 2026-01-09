// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

// Establish a server session.
//
// POST /api/session/establish
// Body: { address }
// Sets: ga_session=sid:<sid>; HttpOnly

import { readJson } from '../_lib/util.js';
import { checkPoh, fetchPohSignerSignature } from '../_lib/poh.js';
import { newSessionId, storeSession } from '../_lib/session.js';
import * as R from '../_lib/redis.js';

function isHexAddr(a) {
  const s = String(a || '').trim();
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

function cookieString(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value))}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.secure) parts.push('Secure');
  if (typeof opts.maxAge === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`);
  return parts.join('; ');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!R.enabled()) return res.status(503).json({ error: 'redis_not_configured' });

    const body = await readJson(req);
    const address = body && body.address ? String(body.address) : '';

    if (!isHexAddr(address)) return res.status(400).json({ error: 'bad_address' });

    // Server-authoritative PoH check.
    const pohOk = await checkPoh(address);
    if (!pohOk) return res.status(403).json({ error: 'poh_required' });

    // Fetch signer proof (optional, but useful for downstream contract claims).
    const signature = await fetchPohSignerSignature(address);

    const sid = newSessionId();
    const ttlSeconds = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 7);
    await storeSession({ sid, address, pohVerified: true, signature, ttlSeconds });

    const isHttps = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    const secure = isHttps || process.env.COOKIE_SECURE === '1';

    res.setHeader('Set-Cookie', cookieString('ga_session', `sid:${sid}`, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: ttlSeconds,
    }));

    return res.status(200).json({
      ok: true,
      authenticated: true,
      address,
      pohVerified: true,
      hasSignature: !!signature,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: (e && e.message) ? String(e.message) : 'error',
    });
  }
}
