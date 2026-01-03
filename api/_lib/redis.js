import { Redis } from '@upstash/redis';

let _redis = null;

function getConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

export function enabled() {
  const { url, token } = getConfig();
  return !!(url && token);
}

export function client() {
  if (_redis) return _redis;
  const { url, token } = getConfig();
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

function lowerCmd(op) {
  return String(op || '').toLowerCase();
}

function stripWithScores(args) {
  const out = Array.isArray(args) ? args.slice() : [];
  if (out.length && String(out[out.length - 1]).toUpperCase() === 'WITHSCORES') out.pop();
  return out;
}

export async function cmd(op, ...args) {
  const r = client();
  if (!r) throw new Error('redis_not_configured');
  const up = String(op || '').toUpperCase();

  // Prefer specialized methods for reliability.
  if (up === 'GET') return r.get(String(args[0] || ''));
  if (up === 'SET') return r.set(String(args[0] || ''), args[1]);
  if (up === 'DEL') return r.del(...args);
  if (up === 'EXPIRE') return r.expire(String(args[0] || ''), Number(args[1] || 0));

  if (up === 'HGET') return r.hget(String(args[0] || ''), String(args[1] || ''));
  if (up === 'HGETALL') return r.hgetall(String(args[0] || ''));
  if (up === 'HSET') {
    const key = String(args[0] || '');
    const rest = args.slice(1);
    const obj = {};
    for (let i = 0; i + 1 < rest.length; i += 2) obj[String(rest[i])] = rest[i + 1];
    return r.hset(key, obj);
  }

  if (up === 'LPUSH') return r.lpush(String(args[0] || ''), args[1]);
  if (up === 'LTRIM') return r.ltrim(String(args[0] || ''), Number(args[1] || 0), Number(args[2] || 0));
  if (up === 'LRANGE') return r.lrange(String(args[0] || ''), Number(args[1] || 0), Number(args[2] || -1));

  if (up === 'SADD') return r.sadd(String(args[0] || ''), String(args[1] || ''));
  if (up === 'SISMEMBER') return r.sismember(String(args[0] || ''), String(args[1] || ''));

  if (up === 'ZADD') {
    const key = String(args[0] || '');
    const score = Number(args[1] || 0);
    const member = String(args[2] || '');
    return r.zadd(key, { score, member });
  }
  if (up === 'ZSCORE') return r.zscore(String(args[0] || ''), String(args[1] || ''));
  if (up === 'ZREVRANK') return r.zrevrank(String(args[0] || ''), String(args[1] || ''));
  if (up === 'ZINCRBY') return r.zincrby(String(args[0] || ''), Number(args[1] || 0), String(args[2] || ''));
  if (up === 'ZREVRANGE') {
    const a = stripWithScores(args);
    const key = String(a[0] || '');
    const start = Number(a[1] || 0);
    const stop = Number(a[2] || 0);
    // Upstash supports either zrevrange or zrange({ rev: true }).
    if (typeof r.zrevrange === 'function') {
      return r.zrevrange(key, start, stop, { withScores: true });
    }
    return r.zrange(key, start, stop, { rev: true, withScores: true });
  }

  // Fallback: attempt to call a same-named method if it exists.
  const m = lowerCmd(op);
  if (m && typeof r[m] === 'function') return r[m](...args);

  throw new Error('unsupported_redis_cmd:' + String(op));
}

export async function pipeline(cmds) {
  const r = client();
  if (!r) throw new Error('redis_not_configured');
  if (!Array.isArray(cmds) || !cmds.length) return [];

  // Prefer Upstash pipeline when available.
  if (typeof r.pipeline === 'function') {
    const p = r.pipeline();
    for (const item of cmds) {
      if (!Array.isArray(item) || !item.length) continue;
      const op = String(item[0] || '').toUpperCase();
      const args = item.slice(1);

      if (op === 'ZADD') p.zadd(String(args[0] || ''), { score: Number(args[1] || 0), member: String(args[2] || '') });
      else if (op === 'HSET') {
        const key = String(args[0] || '');
        const rest = args.slice(1);
        const obj = {};
        for (let i = 0; i + 1 < rest.length; i += 2) obj[String(rest[i])] = rest[i + 1];
        p.hset(key, obj);
      } else if (op === 'ZREVRANGE') {
        const a = stripWithScores(args);
        if (typeof p.zrevrange === 'function') p.zrevrange(String(a[0] || ''), Number(a[1] || 0), Number(a[2] || 0), { withScores: true });
        else p.zrange(String(a[0] || ''), Number(a[1] || 0), Number(a[2] || 0), { rev: true, withScores: true });
      } else {
        const m = lowerCmd(op);
        if (m && typeof p[m] === 'function') p[m](...args);
        else {
          // Fallback to immediate execution if pipeline lacks the method.
          // eslint-disable-next-line no-await-in-loop
          await cmd(op, ...args);
        }
      }
    }
    return p.exec();
  }

  // Last-resort sequential execution.
  const out = [];
  for (const item of cmds) {
    if (!Array.isArray(item) || !item.length) continue;
    // eslint-disable-next-line no-await-in-loop
    out.push(await cmd(item[0], ...item.slice(1)));
  }
  return out;
}
