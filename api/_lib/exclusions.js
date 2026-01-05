// built by gruesøme — SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f
/**
 * Payout exclusions / house wallets
 * - Use ECON_PAYOUT_EXCLUDE_ADDRS env var (comma/space separated)
 * - Addresses are case-insensitive, stored lowercased
 */

function normAddr(a) {
  return String(a || '').trim().toLowerCase();
}

function parseAddrList(raw) {
  return String(raw || '')
    .split(/[,\s]+/g)
    .map((x) => normAddr(x))
    .filter(Boolean);
}

const _EXCLUDED = parseAddrList(process.env.ECON_PAYOUT_EXCLUDE_ADDRS);
const _EXCLUDED_SET = new Set(_EXCLUDED);

export function excludedAddrs() {
  return _EXCLUDED.slice();
}

export function isExcluded(addr) {
  return _EXCLUDED_SET.has(normAddr(addr));
}

export function filterExcluded(entries, addrField = 'addr') {
  if (!Array.isArray(entries) || !_EXCLUDED.length) return Array.isArray(entries) ? entries : [];
  return entries.filter((e) => !isExcluded(e?.[addrField] || e?.address || e?.wallet || e?.addr));
}
