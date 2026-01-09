// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

// Session status endpoint.
//
// GET /api/session
// Returns: { ok, authenticated, address, pohVerified, redisEnabled }

import { getSession } from '../_lib/session.js';
import { checkPoh } from '../_lib/poh.js';
import * as R from '../_lib/redis.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

    const s = await getSession(req);
    const authenticated = !!(s && s.address);
    const address = authenticated ? String(s.address) : '';

    let pohVerified = false;
    if (authenticated) {
      if (s.demo) pohVerified = true;
      else if (typeof s.pohVerified === 'boolean') pohVerified = !!s.pohVerified;
      else {
        try { pohVerified = await checkPoh(address); } catch { pohVerified = false; }
      }
    }

    return res.status(200).json({
      ok: true,
      redisEnabled: R.enabled(),
      authenticated,
      address,
      pohVerified,
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      redisEnabled: R.enabled(),
      authenticated: false,
      address: '',
      pohVerified: false,
      error: (e && e.message) ? String(e.message) : 'error',
    });
  }
}
