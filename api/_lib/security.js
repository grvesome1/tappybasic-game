// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { parseCookies } from './util.js';
import { readSession } from './session.js';

export function isAddress(a) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(a || ''));
}

export function sameOrigin(req) {
  const o = req?.headers?.origin ? String(req.headers.origin) : '';
  const h = req?.headers?.host ? String(req.headers.host) : '';
  if (!o || !h) return true; // allow non-browser calls (cron, curl)
  try {
    const u = new URL(o);
    return u.host === h;
  } catch {
    return false;
  }
}

export function bearerToken(req) {
  const h = req?.headers?.authorization ? String(req.headers.authorization) : '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1]).trim() : '';
}

export function queryParam(req, name) {
  const q = req?.query || {};
  if (q && q[name] != null) return String(q[name]);
  try {
    const u = new URL(String(req?.url || ''), 'http://localhost');
    return u.searchParams.get(name) || '';
  } catch {
    return '';
  }
}

export function isVercelCron(req) {
  // Vercel Cron sets this header.
  const h = req?.headers?.['x-vercel-cron'] ?? req?.headers?.['X-Vercel-Cron'];
  return String(h || '').toLowerCase() === '1' || String(h || '').toLowerCase() === 'true';
}

export async function getSessionAddress(req) {
  const cookies = parseCookies(req);
  const s = readSession(cookies);
  return s && s.address ? String(s.address) : '';
}
