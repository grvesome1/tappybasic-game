// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { Redis } from '@upstash/redis';

let _client = null;

function hasEnv(name) {
  return !!(process.env && process.env[name] && String(process.env[name]).trim());
}

function getClient() {
  if (_client) return _client;
  _client = Redis.fromEnv();
  return _client;
}

export function enabled() {
  // Support both Upstash and Vercel KV envs (both are Upstash REST-compatible).
  return (
    hasEnv('UPSTASH_REDIS_REST_URL') &&
    hasEnv('UPSTASH_REDIS_REST_TOKEN')
  ) || (
    hasEnv('KV_REST_API_URL') &&
    hasEnv('KV_REST_API_TOKEN')
  ) || (
    hasEnv('KV_REST_URL') &&
    hasEnv('KV_REST_TOKEN')
  );
}

function toArg(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return String(v);
  return String(v);
}

export async function cmd(command, ...args) {
  const redis = getClient();
  const out = await redis.sendCommand([String(command).toUpperCase(), ...args.map(toArg)]);
  return out;
}

export async function pipeline(commands) {
  const redis = getClient();
  const cmds = (commands || []).map((c) => (Array.isArray(c) ? c.map(toArg) : [toArg(c)]));
  const p = redis.pipeline(cmds);
  const results = await p.exec();
  // Normalize to ioredis-like tuples used in code: [err, result]
  return (results || []).map((r) => [null, r]);
}

function parseZWithScores(arr) {
  const out = [];
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < arr.length; i += 2) {
    out.push({ value: String(arr[i] ?? ''), score: Number(arr[i + 1] ?? 0) });
  }
  return out;
}

export async function zrevrangeWithScores(key, start, stop) {
  const arr = await cmd('ZREVRANGE', key, start, stop, 'WITHSCORES');
  return parseZWithScores(arr);
}

export async function zrangeWithScores(key, start, stop) {
  const arr = await cmd('ZRANGE', key, start, stop, 'WITHSCORES');
  return parseZWithScores(arr);
}

export async function zrevrank(key, member) {
  const r = await cmd('ZREVRANK', key, member);
  return r == null ? null : Number(r);
}

export async function zrank(key, member) {
  const r = await cmd('ZRANK', key, member);
  return r == null ? null : Number(r);
}

export async function zscore(key, member) {
  const r = await cmd('ZSCORE', key, member);
  return r == null ? null : Number(r);
}

export async function exists(key) {
  const r = await cmd('EXISTS', key);
  return Number(r || 0) > 0;
}

export async function hset(key, obj) {
  const flat = [];
  for (const [k, v] of Object.entries(obj || {})) flat.push(k, toArg(v));
  if (!flat.length) return 0;
  return cmd('HSET', key, ...flat);
}

export async function hmget(key, fields) {
  return cmd('HMGET', key, ...(fields || []));
}

export async function hgetall(key) {
  const arr = await cmd('HGETALL', key);
  const out = {};
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < arr.length; i += 2) {
    const k = String(arr[i] ?? '');
    if (!k) continue;
    out[k] = String(arr[i + 1] ?? '');
  }
  return out;
}
