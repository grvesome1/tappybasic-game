// Lightweight helpers shared across Vercel serverless handlers.

export function parseCookies(req) {
  const header = (req && req.headers && (req.headers.cookie || req.headers.Cookie)) ? String(req.headers.cookie || req.headers.Cookie) : '';
  const out = {};
  if (!header) return out;
  const parts = header.split(';');
  for (const part of parts) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export async function readJson(req, { maxBytes = 256 * 1024 } = {}) {
  // Vercel (and some local dev runners) may already populate req.body.
  if (req && req.body != null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
  }

  const chunks = [];
  let total = 0;
  await new Promise((resolve, reject) => {
    req.on('data', (c) => {
      total += c.length;
      if (total > maxBytes) {
        reject(new Error('body_too_large'));
        try {
          req.destroy();
        } catch {}
        return;
      }
      chunks.push(c);
    });
    req.on('end', resolve);
    req.on('error', reject);
  });

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
