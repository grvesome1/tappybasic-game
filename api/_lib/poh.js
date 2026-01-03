// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

// Proof of Humanity check.
// Default: permissive if no endpoint configured, so the system remains usable.

function hasEnv(name) {
  return !!(process.env && process.env[name] && String(process.env[name]).trim());
}

export async function checkPoh(address) {
  address = String(address || '').trim();

  if (hasEnv('POH_BYPASS') && String(process.env.POH_BYPASS).trim() === '1') return true;

  const base = hasEnv('POH_API_URL') ? String(process.env.POH_API_URL).trim() : '';
  if (!base) return true;

  try {
    const u = new URL(base);
    u.searchParams.set('address', address);
    const res = await fetch(String(u), { method: 'GET', headers: { 'accept': 'application/json' } });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    // Accept a few common shapes
    if (typeof data.verified === 'boolean') return data.verified;
    if (data.poh && typeof data.poh.verified === 'boolean') return data.poh.verified;
    if (typeof data.ok === 'boolean' && typeof data.pohVerified === 'boolean') return data.ok && data.pohVerified;
    return false;
  } catch {
    return false;
  }
}
