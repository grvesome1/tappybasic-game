// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import * as R from './redis.js';
import * as K from './keys.js';

function nowIso() { return new Date().toISOString(); }

function isTruthy(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function sbtLocked() {
  // When PRO_SBT_UNLOCKED is truthy, SBT behavior is considered "unlocked"/tradeable.
  // Public nickname/avatar visibility is intended only while ACTIVE + SBT-locked.
  return !isTruthy(process.env.PRO_SBT_UNLOCKED);
}

export function shortAddr(addr) {
  const a = String(addr || '');
  if (a.length <= 12) return a;
  return a.slice(0, 6) + '…' + a.slice(-4);
}

export function isProActive(profile) {
  try {
    const tier = String(profile?.proTier || 'none');
    const exp = String(profile?.proExp || '');
    if (!tier || tier === 'none') return false;
    if (!exp) return false;
    const t = Date.parse(exp);
    if (!Number.isFinite(t)) return false;
    return t > Date.now();
  } catch {
    return false;
  }
}

export function canShowPublicIdentity(profile) {
  return isProActive(profile) && sbtLocked();
}

export async function ensureUser(address) {
  const exists = await R.exists(K.profile(address));
  if (!exists) {
    await R.hset(K.profile(address), {
      proTier: 'none',
      proExp: null,
      xp: 0,
      level: 1,
      lastActiveAt: nowIso(),

      // Public identity (optional; set-once)
      nickname: null,
      nicknameSetAt: null,
      avatarPng: null,
      avatarTokenId: null,
      avatarSetAt: null,
    });
  }
}

export async function getState(address) {
  await ensureUser(address);
  const p = await R.hgetall(K.profile(address));

  // Normalize numeric-ish fields
  p.xp = Number(p.xp || 0);
  p.level = Number(p.level || 1);

  return p;
}

export async function setProfile(address, patch) {
  // Backward-compatible patch (no validation, used by internal flows).
  patch = patch || {};
  await ensureUser(address);

  // Never allow direct overwrite of identity fields through this function.
  const denied = new Set(['nickname', 'nicknameSetAt', 'avatarPng', 'avatarTokenId', 'avatarSetAt']);
  const safe = {};
  for (const [k, v] of Object.entries(patch)) {
    if (denied.has(k)) continue;
    safe[k] = v;
  }

  if (Object.keys(safe).length === 0) return getState(address);
  safe.lastActiveAt = nowIso();
  await R.hset(K.profile(address), safe);
  return getState(address);
}

export function validateNickname(nickname) {
  const s = String(nickname || '').trim();
  if (s.length < 2) return { ok: false, reason: 'too_short' };
  if (s.length > 20) return { ok: false, reason: 'too_long' };
  // Allow: letters/numbers/space/_-.
  if (!/^[a-zA-Z0-9 _\-\.]+$/.test(s)) return { ok: false, reason: 'invalid_chars' };
  // Avoid pure spaces
  if (!/[a-zA-Z0-9]/.test(s)) return { ok: false, reason: 'no_alnum' };
  return { ok: true, value: s };
}

export function validateAvatarPng(url) {
  const s = String(url || '').trim();
  if (!s) return { ok: false, reason: 'missing' };
  if (s.length > 512) return { ok: false, reason: 'too_long' };
  if (!(s.startsWith('ipfs://') || s.startsWith('https://') || s.startsWith('http://'))) {
    return { ok: false, reason: 'bad_scheme' };
  }
  return { ok: true, value: s };
}

export async function setPublicIdentity(address, patch) {
  patch = patch || {};
  await ensureUser(address);

  const fields = await R.hmget(K.profile(address), ['nickname', 'avatarPng']);
  const currentNick = fields?.[0] || null;
  const currentAvatar = fields?.[1] || null;

  const updates = {};
  const t = nowIso();

  if (patch.nickname != null) {
    if (currentNick) return { ok: false, error: 'nickname_locked' };
    const v = validateNickname(patch.nickname);
    if (!v.ok) return { ok: false, error: 'nickname_invalid', reason: v.reason };
    updates.nickname = v.value;
    updates.nicknameSetAt = t;
  }

  if (patch.avatarPng != null) {
    if (currentAvatar) return { ok: false, error: 'avatar_locked' };
    const v = validateAvatarPng(patch.avatarPng);
    if (!v.ok) return { ok: false, error: 'avatar_invalid', reason: v.reason };
    updates.avatarPng = v.value;
    updates.avatarSetAt = t;
  }

  if (patch.avatarTokenId != null) {
    // Token id is informational. Only set alongside avatarPng.
    updates.avatarTokenId = String(patch.avatarTokenId);
  }

  if (Object.keys(updates).length === 0) return { ok: true, state: await getState(address) };
  updates.lastActiveAt = t;

  await R.hset(K.profile(address), updates);
  return { ok: true, state: await getState(address) };
}

export async function getPublicIdentityMany(addresses) {
  const addrs = Array.from(new Set((addresses || []).map(a => String(a || '').toLowerCase()).filter(Boolean))).slice(0, 250);
  if (addrs.length === 0) return {};

  const pipe = [];
  for (const a of addrs) {
    pipe.push(['HMGET', K.profile(a), 'nickname', 'avatarPng', 'proTier', 'proExp', 'level']);
  }
  const rows = await R.pipeline(pipe);

  const out = {};
  for (let i = 0; i < addrs.length; i++) {
    const a = addrs[i];
    const r = Array.isArray(rows?.[i]?.[1]) ? rows[i][1] : null;
    const nickname = r ? r[0] : null;
    const avatarPng = r ? r[1] : null;
    const proTier = r ? r[2] : 'none';
    const proExp = r ? r[3] : null;
    const level = r ? Number(r[4] || 1) : 1;

    const profile = { proTier, proExp };
    const show = canShowPublicIdentity(profile);

    out[a] = {
      displayName: (show && nickname) ? nickname : shortAddr(a),
      nickname: show ? (nickname || null) : null,
      avatarPng: show ? (avatarPng || null) : null,
      proActive: isProActive(profile),
      level,
      // Expose flags for UI messaging/debug (not sensitive)
      show,
      sbtLocked: sbtLocked(),
    };
  }
  return out;
}

export async function setPro(address, tier, expIso) {
  await ensureUser(address);
  await R.hset(K.profile(address), {
    proTier: tier,
    proExp: expIso,
    lastActiveAt: nowIso(),
  });
  return getState(address);
}
