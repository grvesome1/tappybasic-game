// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import crypto from 'node:crypto';
import { parseCookies } from '../_lib/util.js';
import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';

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

function getOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim().toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

function chainId() {
  const n = Number(process.env.LINEA_CHAIN_ID || 59141);
  return Number.isFinite(n) ? n : 59141;
}

function makeMessage({ nonce, origin, address, chainIdNum }) {
  // Minimal EIP-191 "personal_sign" message with a server nonce.
  // Stored and verified verbatim server-side.
  const now = new Date().toISOString();
  const uri = origin || 'https://gruesome.arcade';
  const addr = address ? String(address) : '';

  return [
    "gruesøme's arcade",
    '',
    `URI: ${uri}`,
    `Version: 1`,
    `Chain ID: ${chainIdNum}`,
    addr ? `Address: ${addr}` : undefined,
    `Nonce: ${nonce}`,
    `Issued At: ${now}`,
  ].filter(Boolean).join('\n');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    if (!R.enabled()) return res.status(503).json({ error: 'redis_not_configured' });

    const url = new URL(req.url, 'https://x');
    const address = String(url.searchParams.get('address') || '').trim();
    if (address && !isHexAddr(address)) return res.status(400).json({ error: 'bad_address' });

    const nid = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    const ttlSeconds = Number(process.env.SESSION_NONCE_TTL_SECONDS || 10 * 60);

    const origin = getOrigin(req);
    const chainIdNum = chainId();
    const message = makeMessage({ nonce, origin, address: address || null, chainIdNum });

    const rec = {
      nonce,
      message,
      address: address || null,
      origin: origin || null,
      chainId: chainIdNum,
      createdAt: Date.now(),
    };

    await R.cmd('SET', K.nonce(nid), JSON.stringify(rec));
    await R.cmd('EXPIRE', K.nonce(nid), ttlSeconds);

    const cookies = parseCookies(req);
    // Overwrite any previous nonce cookie.
    const isHttps = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    const secure = isHttps || process.env.COOKIE_SECURE === '1';

    res.setHeader('Set-Cookie', cookieString('ga_nonce', `nid:${nid}`, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: ttlSeconds,
    }));

    return res.status(200).json({
      ok: true,
      redisEnabled: true,
      ttlSeconds,
      chainId: chainIdNum,
      message,
      // Debug-friendly; safe because nonce must still be signed + verified.
      nonce,
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: (e && e.message) ? String(e.message) : 'error',
    });
  }
}
