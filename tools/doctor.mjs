// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

import { loadDotEnvLocal } from './_lib/loadDotEnvLocal.mjs';

loadDotEnvLocal();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import * as R from '../api/_lib/redis.js';

function ok(label) {
  process.stdout.write(`[OK] ${label}\n`);
}
function warn(label) {
  process.stdout.write(`[WARN] ${label}\n`);
}
function fail(label) {
  process.stdout.write(`[FAIL] ${label}\n`);
}

async function ping(path) {
  const url = new URL(path, BASE_URL).toString();
  const res = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { url, status: res.status, ok: res.ok, data };
}

function readTextSafe(rel) {
  try {
    const p = path.join(process.cwd(), rel);
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

function sandboxHasAllowSameOrigin(html) {
  const s = String(html || '');
  const i = s.indexOf('sandbox="');
  if (i === -1) return null;
  const j = s.indexOf('"', i + 9);
  if (j === -1) return null;
  const attrs = s.slice(i + 9, j);
  return attrs.split(/\s+/g).includes('allow-same-origin');
}

async function main() {
  process.stdout.write(`Doctor: ${BASE_URL}\n`);

  // Env sanity
  const info = R.envInfo();
  const wcPid = String(process.env.WALLETCONNECT_PROJECT_ID || '').trim();

  if (info.canWrite) ok('Redis/KV REST env detected (read+write)');
  else if (info.canRead) warn('Redis/KV REST env detected (read-only; sessions will be disabled)');
  else if (info.hasTcpUrl) warn('KV_URL/REDIS_URL detected (TCP) but REST vars missing (sessions will be disabled)');
  else warn('Redis/KV env missing (sessions will be disabled)');
  if (info.notes) warn(info.notes);

  // Connectivity check (never prints secrets).
  if (info.canRead) {
    try {
      const r = R.client({ allowReadOnly: true });
      const key = `__doctor_kv__:${crypto.randomBytes(8).toString('hex')}`;
      await r.get(key);
      if (info.canWrite) {
        await r.set(key, '1');
        await r.del(key);
        ok('Redis/KV connectivity ok (read+write)');
      } else {
        ok('Redis/KV connectivity ok (read)');
      }
    } catch (e) {
      warn(`Redis/KV connectivity check failed: ${e?.message || e}`);
    }
  }

  if (wcPid) ok('WALLETCONNECT_PROJECT_ID set');
  else warn('WALLETCONNECT_PROJECT_ID not set (WalletConnect QR may fail)');

  // Endpoint checks
  try {
    const cfg = await ping('/api/config');
    if (cfg.ok && cfg.data && cfg.data.ok) ok('/api/config');
    else fail(`/api/config (${cfg.status})`);
  } catch (e) {
    fail(`/api/config fetch failed: ${e?.message || e}`);
  }

  try {
    const sess = await ping('/api/session');
    if (sess.ok && sess.data && sess.data.ok) ok('/api/session');
    else fail(`/api/session (${sess.status})`);
  } catch (e) {
    fail(`/api/session fetch failed: ${e?.message || e}`);
  }

  try {
    const tel = await ping('/api/telemetry');
    if (tel.status !== 404) ok('/api/telemetry');
    else fail('/api/telemetry (404)');
  } catch (e) {
    warn(`/api/telemetry fetch failed: ${e?.message || e}`);
  }

  try {
    const health = await ping('/api/health');
    if (health.ok) ok('/api/health');
    else warn(`/api/health (${health.status})`);
  } catch {
    warn('/api/health not reachable');
  }

  // Session cookie sanity: we rely on SameSite=Lax + same-origin iframes.
  // If the dashboard iframe is sandboxed without allow-same-origin, cookies can behave unexpectedly.
  const dashHtml = readTextSafe('public/index.html');
  const hasAso = sandboxHasAllowSameOrigin(dashHtml);
  if (hasAso === false) {
    warn('Dashboard iframe sandbox missing allow-same-origin (sessions use SameSite=Lax)');
  } else if (hasAso === true) {
    ok('Dashboard iframe sandbox includes allow-same-origin');
  } else {
    warn('Could not detect dashboard iframe sandbox attribute');
  }

  process.stdout.write('Done.\n');
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + '\n');
  process.exit(1);
});
