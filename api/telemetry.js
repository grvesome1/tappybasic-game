// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

// Minimal telemetry sink.
// - OPTIONS -> 204
// - POST -> 204 (drains body up to a small limit)
// - GET -> 204
// Never throws; always responds quickly.

function safeEnd204(res) {
  try {
    res.statusCode = 204;
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  } catch {
    try { res.end(); } catch {}
  }
}

async function drainBody(req, { maxBytes = 16 * 1024 } = {}) {
  // If a platform already parsed the body, don't re-read.
  if (req && req.body != null) return;

  await new Promise((resolve) => {
    let total = 0;
    function done() {
      try { req.off('data', onData); } catch {}
      try { req.off('end', onEnd); } catch {}
      try { req.off('error', onErr); } catch {}
      resolve();
    }
    function onErr() { done(); }
    function onEnd() { done(); }
    function onData(chunk) {
      try {
        total += chunk ? chunk.length : 0;
        if (total > maxBytes) {
          try { req.destroy(); } catch {}
          done();
        }
      } catch {
        done();
      }
    }

    try {
      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onErr);
    } catch {
      done();
    }
  });
}

export default async function handler(req, res) {
  try {
    const method = String(req?.method || 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      return safeEnd204(res);
    }

    if (method === 'POST') {
      // Drain/ignore payload, respond 204.
      await drainBody(req);
      return safeEnd204(res);
    }

    if (method === 'GET') {
      return safeEnd204(res);
    }

    return safeEnd204(res);
  } catch {
    return safeEnd204(res);
  }
}
