// Session helpers.
//
// Supported cookie formats:
// - sid:<opaqueId>  (preferred; stored in Redis)
// - (legacy/insecure) JSON / base64(JSON) if SESSION_ALLOW_INSECURE_COOKIE=1
//
// Expected resolved shape:
// { address: '0x...', demo?: boolean, pohVerified?: boolean, signature?: string, sid?: string }

import crypto from 'node:crypto';
import * as R from './redis.js';
import * as K from './keys.js';
import { parseCookies } from './util.js';

function tryParseJson(str) {
  try {
    const v = JSON.parse(String(str));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function tryParseBase64Json(str) {
  try {
    const raw = Buffer.from(String(str), 'base64').toString('utf8');
    return tryParseJson(raw);
  } catch {
    return null;
  }
}

export function readSession(cookies) {
  const c = cookies && typeof cookies === 'object' ? cookies : {};
  const candidates = [
    c.ga_session,
    c.ga_sess,
    c.arcade_session,
    c.session,
  ].filter(Boolean);

  for (const val of candidates) {
    const s = String(val);

    // Preferred: opaque session id
    if (s.startsWith('sid:')) {
      const sid = s.slice(4).trim();
      if (sid) return { sid };
      continue;
    }

    // Legacy formats (unsafe unless explicitly enabled)
    if (process.env.SESSION_ALLOW_INSECURE_COOKIE !== '1') continue;
    // Common formats we accept:
    // - JSON
    // - b64:<base64(JSON)>
    // - base64(JSON)
    let parsed = tryParseJson(s);
    if (!parsed && s.startsWith('b64:')) parsed = tryParseBase64Json(s.slice(4));
    if (!parsed) parsed = tryParseBase64Json(s);
    if (parsed && parsed.address) {
      return {
        address: String(parsed.address),
        demo: !!parsed.demo,
      };
    }
  }

  return null;
}

export function newSessionId() {
  // 32 bytes -> 64 hex chars
  return crypto.randomBytes(32).toString('hex');
}

export async function loadSessionById(sid) {
  if (!sid) return null;
  if (!R.enabled()) return null;
  try {
    const raw = await R.cmd('GET', K.sess(String(sid)));
    if (!raw) return null;
    const parsed = tryParseJson(raw);
    if (!parsed || !parsed.address) return null;
    return {
      sid: String(sid),
      address: String(parsed.address),
      demo: !!parsed.demo,
      pohVerified: !!parsed.pohVerified,
      signature: parsed.signature ? String(parsed.signature) : null,
      createdAt: parsed.createdAt ? Number(parsed.createdAt) : null,
    };
  } catch {
    return null;
  }
}

export async function getSession(req) {
  const cookies = parseCookies(req);
  const s = readSession(cookies);
  if (!s) return null;
  if (s.sid) return loadSessionById(s.sid);
  return s;
}

export async function storeSession({ sid, address, demo = false, pohVerified = false, signature = null, ttlSeconds = 60 * 60 * 24 * 7 }) {
  if (!R.enabled()) throw new Error('redis_not_configured');
  const id = String(sid || '');
  const addr = String(address || '');
  if (!id || !addr) throw new Error('bad_session');
  const rec = {
    address: addr,
    demo: !!demo,
    pohVerified: !!pohVerified,
    signature: signature ? String(signature) : null,
    createdAt: Date.now(),
  };
  await R.cmd('SET', K.sess(id), JSON.stringify(rec));
  await R.cmd('EXPIRE', K.sess(id), Number(ttlSeconds || 0));
  return rec;
}
