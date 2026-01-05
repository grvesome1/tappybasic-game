export function sameOrigin(req) {
  const h = (req && req.headers) ? req.headers : {};
  const origin = h.origin || h.Origin;
  const host = h.host || h.Host;
  if (!origin) return true; // allow server-to-server + curl
  if (!host) return true;

  try {
    const o = new URL(String(origin));
    return o.host === String(host);
  } catch {
    return false;
  }
}

export function isAddress(addr) {
  const s = String(addr || '').trim();
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

export function bearerToken(req) {
  const h = (req && req.headers) ? req.headers : {};
  const auth = h.authorization || h.Authorization;
  if (!auth) return '';
  const s = String(auth);
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || '').trim() : '';
}

export function queryParam(req, name) {
  try {
    const u = new URL(req.url, 'http://localhost');
    return u.searchParams.get(String(name || ''));
  } catch {
    return null;
  }
}

export function isVercelCron(req) {
  const h = (req && req.headers) ? req.headers : {};
  const cron = h['x-vercel-cron'] || h['X-Vercel-Cron'];
  if (String(cron || '') === '1') return true;

  // Local/dev override
  const qp = queryParam(req, 'cron');
  if (qp === '1' || qp === 'true') return true;

  return false;
}
