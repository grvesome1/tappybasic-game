// Minimal cookie session reader.
//
// Expected shape (best-effort):
// { address: '0x...', demo?: boolean }

function tryParseJson(str) {
  try {
    const v = JSON.parse(String(str));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function tryParseBase64Json(str) {
  try {
    const raw = Buffer.from(String(str), 'base64').toString('utf8');
    return tryParseJson(raw);
  } catch {
    return null;
  }
}

export function readSession(cookies) {
  const c = cookies && typeof cookies === 'object' ? cookies : {};
  const candidates = [
    c.ga_session,
    c.ga_sess,
    c.arcade_session,
    c.session,
  ].filter(Boolean);

  for (const val of candidates) {
    const s = String(val);
    // Common formats we accept:
    // - JSON
    // - b64:<base64(JSON)>
    // - base64(JSON)
    let parsed = tryParseJson(s);
    if (!parsed && s.startsWith('b64:')) parsed = tryParseBase64Json(s.slice(4));
    if (!parsed) parsed = tryParseBase64Json(s);
    if (parsed && parsed.address) {
      return {
        address: String(parsed.address),
        demo: !!parsed.demo,
      };
    }
  }

  return null;
}
