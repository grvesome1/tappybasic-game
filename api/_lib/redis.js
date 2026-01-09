import { Redis } from '@upstash/redis';
import { createClient as createTcpRedisClient } from 'redis';

let _redisWrite = null;
let _redisRead = null;
let _redisTcp = null;
let _redisTcpConnectPromise = null;

function resolveConfig({ allowReadOnly = false } = {}) {
  const restUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const writeToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  const readOnlyToken = process.env.KV_REST_API_READ_ONLY_TOKEN || '';
  const tcpUrl = process.env.KV_URL || process.env.REDIS_URL || '';

  const url = String(restUrl || '').trim();
  const tcp = String(tcpUrl || '').trim();
  const token = String(writeToken || '').trim() || (allowReadOnly ? String(readOnlyToken || '').trim() : '');
  const readOnly = !String(writeToken || '').trim() && !!(allowReadOnly && String(readOnlyToken || '').trim());

  const canReadRest = !!(url && (String(writeToken || '').trim() || (allowReadOnly && String(readOnlyToken || '').trim())));
  const canWriteRest = !!(url && String(writeToken || '').trim());
  const canReadTcp = !!tcp;
  const canWriteTcp = !!tcp;

  return {
    url: url || null,
    token: token || null,
    tcpUrl: tcp || null,
    readOnly,
    canRead: canReadRest || canReadTcp,
    canWrite: canWriteRest || canWriteTcp,
    canReadRest,
    canWriteRest,
    canReadTcp,
    canWriteTcp,
  };
}

export function envInfo() {
  const cfg = resolveConfig({ allowReadOnly: true });
  const hasRestUrl = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  const hasWriteToken = !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
  const hasReadOnlyToken = !!process.env.KV_REST_API_READ_ONLY_TOKEN;
  const hasTcpUrl = !!(process.env.KV_URL || process.env.REDIS_URL);

  let kind = 'none';
  if (cfg.canReadRest) kind = 'upstash-rest';
  else if (cfg.canReadTcp) kind = 'redis-tcp-url';

  return {
    kind,
    hasRestUrl,
    hasWriteToken,
    hasReadOnlyToken,
    hasTcpUrl,
    canRead: cfg.canRead,
    canWrite: cfg.canWrite,
    readOnly: cfg.readOnly,
    notes:
      hasTcpUrl && !cfg.canReadRest
        ? 'KV_URL/REDIS_URL detected (TCP). REST vars (KV_REST_API_* or UPSTASH_REDIS_REST_*) not set; falling back to TCP.'
        : null,
  };
}

// enabled() remains "write-enabled" (sessions and most mutations require writes).
export function enabled() {
  return resolveConfig({ allowReadOnly: false }).canWrite;
}

export function enabledReadOnlyOk() {
  return resolveConfig({ allowReadOnly: true }).canRead;
}

async function ensureTcpConnected() {
  if (_redisTcp && _redisTcpConnectPromise) return _redisTcpConnectPromise;
  if (!_redisTcp) return null;
  if (_redisTcp.isOpen) {
    _redisTcpConnectPromise = Promise.resolve();
    return _redisTcpConnectPromise;
  }

  _redisTcpConnectPromise = _redisTcp.connect();
  try {
    await _redisTcpConnectPromise;
  } catch (e) {
    _redisTcpConnectPromise = null;
    throw e;
  }
  return _redisTcpConnectPromise;
}

export function client({ allowReadOnly = false } = {}) {
  const cfg = resolveConfig({ allowReadOnly });

  // Prefer REST when configured.
  if (cfg.url && cfg.token) {
    if (!cfg.readOnly) {
      if (_redisWrite) return _redisWrite;
      _redisWrite = new Redis({ url: cfg.url, token: cfg.token });
      return _redisWrite;
    }

    if (_redisRead) return _redisRead;
    _redisRead = new Redis({ url: cfg.url, token: cfg.token });
    return _redisRead;
  }

  // Fallback: TCP Redis URL.
  if (cfg.tcpUrl) {
    if (_redisTcp) return _redisTcp;
    _redisTcp = createTcpRedisClient({ url: cfg.tcpUrl });
    // Ensure errors don't crash silently in long-lived dev.
    _redisTcp.on('error', () => {});
    // Start connection eagerly; cmd()/pipeline() will await if needed.
    ensureTcpConnected().catch(() => {});
    return _redisTcp;
  }

  return null;
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
  const r = client({ allowReadOnly: true });
  if (!r) throw new Error('redis_not_configured');

  // If this is a TCP client, ensure connection before issuing commands.
  const isTcp = typeof r.sendCommand === 'function' && typeof r.isOpen === 'boolean';
  if (isTcp) await ensureTcpConnected();

  const up = String(op || '').toUpperCase();

  // For TCP clients, enforce read-only if we only have REST read-only config.
  // (TCP URLs don't have a separate read-only token concept here.)
  const cfg = resolveConfig({ allowReadOnly: true });
  const enforceReadOnly = cfg.canReadRest && !cfg.canWriteRest && !cfg.canWriteTcp;
  if (enforceReadOnly) {
    const writeOps = new Set(['SET', 'DEL', 'EXPIRE', 'HSET', 'LPUSH', 'LTRIM', 'SADD', 'ZADD', 'ZINCRBY']);
    if (writeOps.has(up)) throw new Error('redis_read_only');
  }

  if (isTcp) {
    // Keep behaviors consistent with REST mode:
    // - HSET accepts pairs
    // - ZREVRANGE always returns WITHSCORES flat array
    // - Unknown commands fall back to raw sendCommand
    const asStr = (v) => String(v ?? '');

    if (up === 'HSET') {
      const key = asStr(args[0]);
      const rest = args.slice(1);
      const flat = [];
      for (let i = 0; i + 1 < rest.length; i += 2) flat.push(asStr(rest[i]), asStr(rest[i + 1]));
      return r.sendCommand(['HSET', key, ...flat]);
    }

    if (up === 'ZREVRANGE') {
      const a = stripWithScores(args);
      const key = asStr(a[0]);
      const start = asStr(a[1] ?? 0);
      const stop = asStr(a[2] ?? 0);
      return r.sendCommand(['ZREVRANGE', key, start, stop, 'WITHSCORES']);
    }

    return r.sendCommand([up, ...args.map(asStr)]);
  }

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
