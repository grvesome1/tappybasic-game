// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import * as R from './redis.js';

export async function bump(name, codeOrBy = 1) {
  try {
    if (!R.enabled()) return;
    const n = String(name || 'event');
    const by = Math.max(1, Math.floor(Number(codeOrBy || 1)));
    await R.cmd('INCRBY', `ga:metrics:${n}`, by);
    // keep for ~30d
    await R.cmd('EXPIRE', `ga:metrics:${n}`, 60 * 60 * 24 * 30);
  } catch {
    // best-effort only
  }
}
