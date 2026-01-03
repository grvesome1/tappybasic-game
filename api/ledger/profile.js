// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import * as Sec from '../_lib/security.js';
import * as U from '../_lib/user.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!Sec.sameOrigin(req)) return res.status(403).json({ error: 'forbidden' });

    const address = String((req.query && req.query.address) || '').toLowerCase();
    if (!Sec.isAddress(address)) return res.status(400).json({ error: 'bad_address' });

    const patch = (req.body && req.body.patch) ? req.body.patch : {};
    if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'bad_patch' });

    // Split identity fields (set-once) from normal profile patch.
    const identity = {};
    if (patch.nickname != null) identity.nickname = patch.nickname;
    if (patch.avatarPng != null) identity.avatarPng = patch.avatarPng;
    if (patch.avatarTokenId != null) identity.avatarTokenId = patch.avatarTokenId;

    const hasIdentity = Object.keys(identity).length > 0;

    // Apply normal patch first (pro tier/exp, etc).
    await U.setProfile(address, patch);

    if (hasIdentity) {
      const r = await U.setPublicIdentity(address, identity);
      if (!r.ok) return res.status(400).json(r);
      return res.status(200).json({ ok: true, state: r.state });
    }

    return res.status(200).json({ ok: true, state: await U.getState(address) });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}
