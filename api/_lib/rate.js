// Very small in-memory rate limiter.
// In serverless this is best-effort (may reset between invocations), but it keeps
// local dev and small deployments safe enough without requiring Redis.

const BUCKETS = new Map();

export function rlKey(prefix, id) {
  return String(prefix || 'rl') + ':' + String(id || '');
}

export function ipFromReq(req) {
  const h = (req && req.headers) ? req.headers : {};
  const xff = h['x-forwarded-for'] || h['X-Forwarded-For'];
  if (xff) return String(xff).split(',')[0].trim();
  const realIp = h['x-real-ip'] || h['X-Real-Ip'];
  if (realIp) return String(realIp).trim();
  return (req && req.socket && req.socket.remoteAddress) ? String(req.socket.remoteAddress) : '0.0.0.0';
}

export async function enforce({ key, limit, windowSec }) {
  const k = String(key || '');
  const lim = Math.max(1, Number(limit || 1));
  const winMs = Math.max(1, Math.floor(Number(windowSec || 1) * 1000));
  const now = Date.now();

  const cur = BUCKETS.get(k);
  if (!cur || now >= cur.resetAt) {
    BUCKETS.set(k, { count: 1, resetAt: now + winMs });
    return true;
  }

  cur.count += 1;
  if (cur.count > lim) {
    const err = new Error('rate_limited');
    err.code = 'RATE_LIMIT';
    err.limit = lim;
    err.windowSec = Math.floor(winMs / 1000);
    throw err;
  }

  return true;
}
