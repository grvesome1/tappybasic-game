// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import * as R from './redis.js';

export function ipFromReq(req) {
  const xf = req?.headers?.['x-forwarded-for'] ? String(req.headers['x-forwarded-for']) : '';
  if (xf) return xf.split(',')[0].trim();
  const xr = req?.headers?.['x-real-ip'] ? String(req.headers['x-real-ip']) : '';
  if (xr) return xr.trim();
  return '0.0.0.0';
}

export function rlKey(prefix, id) {
  return `ga:rl:${String(prefix)}:${String(id || '')}`;
}

export async function enforce({ key, limit, windowSec }) {
  limit = Math.max(1, Math.floor(Number(limit || 0)));
  windowSec = Math.max(1, Math.floor(Number(windowSec || 0)));
  if (!R.enabled()) return;

  const n = await R.cmd('INCR', key);
  if (Number(n) === 1) {
    await R.cmd('EXPIRE', key, windowSec);
  }
  if (Number(n) > limit) {
    const err = new Error('rate_limited');
    err.code = 'RATE_LIMIT';
    err.limit = limit;
    err.windowSec = windowSec;
    throw err;
  }
}
