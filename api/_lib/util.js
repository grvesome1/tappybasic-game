// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

export function parseCookies(req) {
  const header = (req && req.headers && (req.headers.cookie || req.headers.Cookie)) ? String(req.headers.cookie || req.headers.Cookie) : '';
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) return;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  });
  return out;
}

export async function readJson(req) {
  if (req && req.body != null) {
    if (typeof req.body === 'object') return req.body;
    try {
      return JSON.parse(String(req.body));
    } catch {
      return {};
    }
  }

  const chunks = [];
  await new Promise((resolve) => {
    req.on('data', (c) => chunks.push(c));
    req.on('end', resolve);
    req.on('error', resolve);
  });

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
