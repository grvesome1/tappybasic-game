// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { isAddress } from './security.js';

let _cacheRaw = null;
let _cacheSet = new Set();

function normalizeAddr(a) {
  return String(a || '').trim().toLowerCase();
}

export function getExcludedPayoutAddrs() {
  const raw = String(process.env.ECON_PAYOUT_EXCLUDE_ADDRS || '').trim();
  if (raw === _cacheRaw) return _cacheSet;

  const parts = raw
    .split(/[\s,]+/g)
    .map(normalizeAddr)
    .filter(Boolean);

  const out = new Set();
  for (const p of parts) {
    if (!isAddress(p)) continue;
    out.add(p);
  }

  _cacheRaw = raw;
  _cacheSet = out;
  return _cacheSet;
}

export function isPayoutExcluded(addr) {
  const a = normalizeAddr(addr);
  if (!isAddress(a)) return false;
  return getExcludedPayoutAddrs().has(a);
}
