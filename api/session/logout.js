// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { parseCookies } from '../_lib/util.js';
import * as R from '../_lib/redis.js';
import * as K from '../_lib/keys.js';

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
    if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ error: 'method_not_allowed' });

    const cookies = parseCookies(req);
    const raw = String(cookies.ga_session || '').trim();
    const sid = raw.startsWith('sid:') ? raw.slice(4).trim() : '';

    if (sid && R.enabled()) {
      try { await R.cmd('DEL', K.sess(sid)); } catch { /* ignore */ }
    }

    const isHttps = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    const secure = isHttps || process.env.COOKIE_SECURE === '1';

    res.setHeader('Set-Cookie', cookieString('ga_session', '', {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: 0,
    }));

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: (e && e.message) ? String(e.message) : 'error',
    });
  }
}
