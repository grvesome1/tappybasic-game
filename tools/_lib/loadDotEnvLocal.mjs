// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import fs from 'node:fs';
import path from 'node:path';

function parseEnvFile(text) {
  const out = {};
  for (const rawLine of String(text || '').split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let val = line.slice(eq + 1);
    // Strip surrounding quotes if present.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function loadDotEnvLocal({ cwd = process.cwd(), files = ['.env.local', '.env.development.local'] } = {}) {
  for (const f of files) {
    try {
      const p = path.join(cwd, f);
      if (!fs.existsSync(p)) continue;
      const kv = parseEnvFile(fs.readFileSync(p, 'utf8'));
      for (const [k, v] of Object.entries(kv)) {
        if (process.env[k] == null) process.env[k] = v;
      }
    } catch {
      // best-effort
    }
  }
}
