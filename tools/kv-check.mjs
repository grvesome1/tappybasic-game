// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import crypto from 'node:crypto';
import { loadDotEnvLocal } from './_lib/loadDotEnvLocal.mjs';
import * as R from '../api/_lib/redis.js';

loadDotEnvLocal();

function log(line) {
  process.stdout.write(String(line || '') + '\n');
}

async function main() {
  const info = R.envInfo();

  if (!info.canRead) {
    log('[kv-check] not configured');
    if (info.notes) log(`[kv-check] note: ${info.notes}`);
    process.exit(2);
  }

  const c = R.client({ allowReadOnly: true });
  if (!c) {
    log('[kv-check] failed to create client');
    process.exit(2);
  }

  // Never print URLs/tokens. Only report which capability is available.
  log(`[kv-check] kind=${info.kind} canWrite=${info.canWrite ? 'yes' : 'no'} readOnly=${info.readOnly ? 'yes' : 'no'}`);

  // Read check (works for read-only tokens).
  const probeKey = `__kv_check__:${crypto.randomBytes(8).toString('hex')}`;
  await c.get(probeKey);

  if (!info.canWrite) {
    log('[kv-check] ok (read)');
    return;
  }

  // Write check (bounded and ephemeral).
  const value = crypto.randomBytes(6).toString('hex');
  await c.set(probeKey, value);
  const got = await c.get(probeKey);
  if (String(got || '') !== value) throw new Error('write_read_mismatch');
  await c.del(probeKey);
  log('[kv-check] ok (read+write)');
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + '\n');
  process.exit(1);
});
