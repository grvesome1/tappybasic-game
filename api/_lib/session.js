// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

function isAddress(a) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(a || ''));
}

function safeJsonParse(s) {
  try {
    return JSON.parse(String(s || ''));
  } catch {
    return null;
  }
}

// Minimal cookie session reader.
// Supports:
// - ga_session: JSON string or base64url(JSON) with { address, demo }
// - ga_addr: raw address (fallback)
export function readSession(cookies) {
  cookies = cookies || {};

  const demo = String(cookies.ga_demo || '').trim() === '1';

  const raw = cookies.ga_session ? String(cookies.ga_session) : '';
  if (raw) {
    const asJson = safeJsonParse(raw);
    if (asJson && isAddress(asJson.address)) return { address: String(asJson.address), demo: !!asJson.demo };

    // base64url(JSON)
    try {
      const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const decoded = Buffer.from(padded, 'base64').toString('utf8');
      const obj = safeJsonParse(decoded);
      if (obj && isAddress(obj.address)) return { address: String(obj.address), demo: !!obj.demo };
    } catch {}
  }

  const addr = cookies.ga_addr ? String(cookies.ga_addr) : '';
  if (isAddress(addr)) return { address: addr, demo };

  return demo ? { address: null, demo: true } : null;
}
