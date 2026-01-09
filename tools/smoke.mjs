// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { loadDotEnvLocal } from './_lib/loadDotEnvLocal.mjs';

loadDotEnvLocal();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function getJson(path) {
  const url = new URL(path, BASE_URL).toString();
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { url, status: res.status, ok: res.ok, data };
}

async function main() {
  const cfg = await getJson('/api/config');
  if (!(cfg.ok && cfg.data && cfg.data.ok)) throw new Error(`config_failed:${cfg.status}`);

  const sess = await getJson('/api/session');
  if (!(sess.ok && sess.data && sess.data.ok)) throw new Error(`session_failed:${sess.status}`);

  const tel = await getJson('/api/telemetry');
  if (tel.status === 404) throw new Error('telemetry_404');

  process.stdout.write('smoke ok\n');
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + '\n');
  process.exit(1);
});
