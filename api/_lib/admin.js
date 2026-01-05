// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

/**
 * Admin address allowlist (server-side).
 *
 * Env precedence:
 * 1) GA_ADMIN_ADDRS (comma/space separated list)
 * 2) ARCADE_ADMIN_ADDRS
 * 3) GA_ADMIN_WALLET
 * 4) ECON_PAYOUT_EXCLUDE_ADDRS (fallback, not recommended)
 *
 * Notes:
 * - Normalize to lowercase.
 * - Keep this *server-only*. Frontend can hardcode too, but server must enforce.
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

const _RAW =
  process.env.GA_ADMIN_ADDRS ||
  process.env.ARCADE_ADMIN_ADDRS ||
  process.env.GA_ADMIN_WALLET ||
  '';

let _ADMIN = parseAddrList(_RAW);

if (!_ADMIN.length) {
  // Fallback only (helps local dev when people forget env vars).
  _ADMIN = parseAddrList(process.env.ECON_PAYOUT_EXCLUDE_ADDRS || '');
}

const _ADMIN_SET = new Set(_ADMIN);

export function adminAddrs() {
  return _ADMIN.slice();
}

export function isAdmin(addr) {
  return _ADMIN_SET.has(normAddr(addr));
}

export function normAddress(addr) {
  return normAddr(addr);
}
