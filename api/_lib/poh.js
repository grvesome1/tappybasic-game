// PoH verification helper.
//
// Uses Linea PoH API. Can be overridden for demos with POH_ALLOW_ALL=1.

const POH_API = 'https://poh-api.linea.build/poh/v2/YOUR_ADDRESS';
const POH_SIGNER_API = 'https://poh-signer-api.linea.build/poh/v2/YOUR_ADDRESS';

function boolFromAny(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (['true', 'yes', 'y', 'ok', 'pass', 'verified', 'success'].includes(s)) return true;
  if (['false', 'no', 'n', 'fail', 'failed', 'denied', 'unverified', '0'].includes(s)) return false;
  return null;
}

function readVerified(obj) {
  if (obj == null) return null;
  if (typeof obj !== 'object') return boolFromAny(obj);
  const keys = ['verified', 'isVerified', 'isPoh', 'poh', 'human', 'isHuman', 'pass', 'success', 'ok'];
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const b = boolFromAny(obj[k]);
      if (b !== null) return b;
    }
  }
  const nests = ['data', 'result', 'payload', 'response'];
  for (const n of nests) {
    if (obj[n] && typeof obj[n] === 'object') {
      const b = readVerified(obj[n]);
      if (b !== null) return b;
    }
  }
  return null;
}

function readSignature(obj) {
  if (!obj) return null;
  if (typeof obj === 'string') {
    const s = obj.trim();
    return (s.startsWith('0x') && s.length > 40) ? s : null;
  }
  if (typeof obj !== 'object') return null;
  const keys = ['signature', 'sig'];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.startsWith('0x') && v.length > 40) return v;
  }
  const nests = ['data', 'result', 'payload', 'response'];
  for (const n of nests) {
    const s = readSignature(obj[n]);
    if (s) return s;
  }
  return null;
}

async function fetchJsonWithTimeout(url, timeoutMs = 3500) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'accept': 'application/json' }, signal: ac.signal });
    let data = null;
    const ct = String(res.headers.get('content-type') || '');
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch { data = null; }
    } else {
      try {
        const txt = await res.text();
        try { data = JSON.parse(txt); } catch { data = txt; }
      } catch { data = null; }
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

export async function checkPoh(address) {
  if (process.env.POH_ALLOW_ALL === '1') return true;
  const addr = String(address || '').trim();
  if (!addr || !addr.startsWith('0x') || addr.length < 10) return false;
  try {
    const url = POH_API.replace('YOUR_ADDRESS', addr);
    const r = await fetchJsonWithTimeout(url, Number(process.env.POH_TIMEOUT_MS || 3500));
    const v = readVerified(r.data);
    return v === true;
  } catch {
    return false;
  }
}

export async function fetchPohSignerSignature(address) {
  const addr = String(address || '').trim();
  if (!addr || !addr.startsWith('0x') || addr.length < 10) return null;
  try {
    const url = POH_SIGNER_API.replace('YOUR_ADDRESS', addr);
    const r = await fetchJsonWithTimeout(url, Number(process.env.POH_TIMEOUT_MS || 3500));
    return readSignature(r.data) || (typeof r.data === 'string' ? readSignature(r.data) : null);
  } catch {
    return null;
  }
}
