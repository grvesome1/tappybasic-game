// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { verifyMessage } from 'ethers';
import { readJson, parseCookies } from '../_lib/util.js';
import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';
import { checkPoh, fetchPohSignerSignature } from '../_lib/poh.js';
import { newSessionId, storeSession } from '../_lib/session.js';

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

async function loadNonce(req) {
  const cookies = parseCookies(req);
  const raw = String(cookies.ga_nonce || '').trim();
  if (!raw.startsWith('nid:')) return null;
  const nid = raw.slice(4).trim();
  if (!nid) return null;

  const saved = await R.cmd('GET', K.nonce(nid));
  if (!saved) return null;

  let parsed = null;
  try { parsed = JSON.parse(String(saved)); } catch { parsed = null; }
  if (!parsed || !parsed.nonce || !parsed.message) return null;

  return { nid, ...parsed };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!R.enabled()) return res.status(503).json({ error: 'redis_not_configured' });

    const body = await readJson(req);
    const address = body && body.address ? String(body.address).trim() : '';
    const signature = body && body.signature ? String(body.signature).trim() : '';
    const message = body && body.message ? String(body.message) : '';

    if (!isHexAddr(address)) return res.status(400).json({ error: 'bad_address' });
    if (!signature || !signature.startsWith('0x')) return res.status(400).json({ error: 'bad_signature' });
    if (!message) return res.status(400).json({ error: 'bad_message' });

    const nonceRec = await loadNonce(req);
    if (!nonceRec) return res.status(403).json({ error: 'missing_nonce' });

    // Require exact message match to prevent signing a different statement.
    if (String(nonceRec.message) !== String(message)) return res.status(403).json({ error: 'message_mismatch' });
    if (nonceRec.address && String(nonceRec.address).toLowerCase() !== address.toLowerCase()) {
      return res.status(403).json({ error: 'address_mismatch' });
    }

    let recovered = '';
    try {
      recovered = String(verifyMessage(message, signature));
    } catch {
      recovered = '';
    }

    if (!recovered || recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(403).json({ error: 'signature_invalid' });
    }

    // Optional PoH requirement for session creation.
    const requirePoh = process.env.SESSION_REQUIRE_POH === '1';
    let pohVerified = false;
    let pohSignature = null;

    if (requirePoh) {
      pohVerified = await checkPoh(address);
      if (!pohVerified) return res.status(403).json({ error: 'poh_required' });
      pohSignature = await fetchPohSignerSignature(address);
    }

    const sid = newSessionId();
    const ttlSeconds = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 7);
    await storeSession({ sid, address, pohVerified, signature: pohSignature, ttlSeconds });

    // One-time nonce: burn it.
    try { await R.cmd('DEL', K.nonce(nonceRec.nid)); } catch { /* ignore */ }

    const isHttps = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    const secure = isHttps || process.env.COOKIE_SECURE === '1';

    res.setHeader('Set-Cookie', [
      cookieString('ga_session', `sid:${sid}`, {
        httpOnly: true,
        secure,
        sameSite: 'Lax',
        path: '/',
        maxAge: ttlSeconds,
      }),
      cookieString('ga_nonce', '', {
        httpOnly: true,
        secure,
        sameSite: 'Lax',
        path: '/',
        maxAge: 0,
      }),
    ]);

    return res.status(200).json({
      ok: true,
      authenticated: true,
      address,
      pohVerified,
      hasSignature: !!pohSignature,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: (e && e.message) ? String(e.message) : 'error',
    });
  }
}
