// built by gruesøme
// sig(b64)=YnVpbHQgYnkgZ3J1ZXPDuG1l

/**
 * Universal Game Embed Adapter (runtime ESM)
 * - Standalone (no build step)
 * - Strict postMessage origin validation
 * - Catalog-driven iframe sandbox + allowlist
 */

export const standardBridgeMessageTypes = Object.freeze({
  READY: 'ARCADE:READY',
  SYNC: 'ARCADE:SYNC',
  REQUEST_RUN: 'ARCADE:REQUEST_RUN',
  RUN_GRANTED: 'ARCADE:RUN_GRANTED',
  RUN_DENIED: 'ARCADE:RUN_DENIED',
  RUN_RESULT: 'ARCADE:RUN_RESULT'
});

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function safeStr(v) {
  return (typeof v === 'string') ? v : '';
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function validateMessageOrigin(origin, allowedOrigins) {
  const o = safeStr(origin);
  if (!o) return false;

  const list = Array.isArray(allowedOrigins) ? allowedOrigins : [];
  for (const a of list) {
    if (!a) continue;
    if (o === a) return true;
  }
  return false;
}

function resolveUrl(url) {
  const u = safeStr(url);
  if (!u) return null;
  try {
    return new URL(u, window.location.origin);
  } catch {
    return null;
  }
}

function sandboxForPolicy(policy) {
  const p = safeStr(policy) || 'strict';

  // Minimal defaults that keep same-origin games working without granting extras.
  if (p === 'relaxed') {
    return [
      'allow-scripts',
      'allow-same-origin',
      'allow-forms',
      'allow-pointer-lock',
      'allow-popups',
      'allow-downloads'
    ].join(' ');
  }

  // strict
  return [
    'allow-scripts',
    'allow-same-origin'
  ].join(' ');
}

function normalizePayload(msg) {
  if (!isObj(msg)) return {};

  // Prefer explicit payload field.
  if (isObj(msg.payload)) return msg.payload;

  // Back-compat: allow payload fields at top level.
  const out = {};
  for (const [k, v] of Object.entries(msg)) {
    if (k === 'type' || k === 'channel') continue;
    out[k] = v;
  }
  return out;
}

function validateReadyPayload(payload) {
  if (!isObj(payload)) return { ok: false, error: 'ready_payload_not_object' };
  const gameId = safeStr(payload.gameId);
  const version = safeStr(payload.version);
  const metricsVersion = safeStr(payload.metricsVersion);

  // gameId is strongly recommended but tolerated for legacy READY.
  return { ok: true, value: { gameId, version, metricsVersion } };
}

function validateRequestRunPayload(payload) {
  if (!isObj(payload)) return { ok: false, error: 'request_run_payload_not_object' };
  const gameId = safeStr(payload.gameId);
  const desiredRunType = safeStr(payload.desiredRunType) || 'paid';
  if (!gameId) return { ok: false, error: 'request_run_missing_gameId' };
  return { ok: true, value: { gameId, desiredRunType } };
}

function validateRunResultPayload(payload) {
  if (!isObj(payload)) return { ok: false, error: 'run_result_payload_not_object' };
  const gameId = safeStr(payload.gameId);
  const runId = safeStr(payload.runId);
  const durationMs = safeNum(payload.durationMs) ?? 0;

  const metrics = isObj(payload.metrics) ? payload.metrics : null;
  const metricId = safeStr(payload.metricId);
  const metricValue = safeNum(payload.metricValue);

  if (!gameId) return { ok: false, error: 'run_result_missing_gameId' };

  // Allow legacy "score" payloads.
  const legacyScore = safeNum(payload.score);

  return {
    ok: true,
    value: {
      gameId,
      runId,
      durationMs: Math.max(0, Math.floor(durationMs || 0)),
      metrics,
      metricId,
      metricValue,
      legacyScore
    }
  };
}

export function createGameFrameController(options) {
  const iframe = options?.iframe || null;
  if (!iframe) throw new Error('createGameFrameController: missing iframe');

  let game = options?.game || null;
  let mounted = false;
  let ready = false;

  const onReady = (typeof options?.onReady === 'function') ? options.onReady : null;
  const onSync = (typeof options?.onSync === 'function') ? options.onSync : null;
  const onRequestRun = (typeof options?.onRequestRun === 'function') ? options.onRequestRun : null;
  const onRunResult = (typeof options?.onRunResult === 'function') ? options.onRunResult : null;
  const onError = (typeof options?.onError === 'function') ? options.onError : null;

  const getSyncPayload = (typeof options?.getSyncPayload === 'function') ? options.getSyncPayload : null;

  function allowedMessageTypes() {
    const allowList = Array.isArray(game?.allowList) ? game.allowList : null;
    if (allowList && allowList.length) return new Set(allowList.map(String));

    // Default: accept standard ARCADE contract.
    return new Set(Object.values(standardBridgeMessageTypes));
  }

  function currentTargetOrigin() {
    const u = resolveUrl(game?.url || game?.embedUrl || game?.path || '');
    return u ? u.origin : '';
  }

  function emitError(code, details) {
    const err = { code: String(code || 'error'), details: details ?? null };
    try { onError && onError(err); } catch {}
  }

  function mount(nextGame) {
    if (nextGame) game = nextGame;

    const u = resolveUrl(game?.url || game?.embedUrl || game?.path || '');
    if (!u) {
      emitError('mount_invalid_url', { url: game?.url || game?.embedUrl || game?.path || '' });
      return false;
    }

    // Apply sandbox per policy.
    try {
      iframe.setAttribute('sandbox', sandboxForPolicy(game?.sandboxPolicy || 'strict'));
    } catch {}

    ready = false;
    mounted = true;

    try {
      iframe.setAttribute('src', u.href);
    } catch {
      emitError('mount_failed', { href: u.href });
      return false;
    }

    return true;
  }

  function unmount() {
    mounted = false;
    ready = false;
    try { iframe.setAttribute('src', 'about:blank'); } catch {}
  }

  function send(type, payload) {
    const t = safeStr(type);
    if (!t) return false;

    const origin = currentTargetOrigin();
    if (!origin) {
      emitError('send_missing_target_origin', { type: t });
      return false;
    }

    const msg = { type: t, payload: isObj(payload) ? payload : (payload ?? {}) };

    try {
      iframe.contentWindow?.postMessage(msg, origin);
      return true;
    } catch (e) {
      emitError('send_failed', { type: t, error: safeStr(e?.message) });
      return false;
    }
  }

  function sync() {
    if (!getSyncPayload) return false;

    let payload = null;
    try { payload = getSyncPayload(game); } catch (e) {
      emitError('sync_payload_failed', { error: safeStr(e?.message) });
      return false;
    }

    if (!isObj(payload)) {
      emitError('sync_payload_invalid', null);
      return false;
    }

    const ok = send(standardBridgeMessageTypes.SYNC, payload);
    try { onSync && onSync({ gameId: safeStr(game?.id), payload }); } catch {}
    return ok;
  }

  function handleMessageEvent(ev) {
    const data = ev?.data;
    if (!isObj(data)) return false;

    const type = safeStr(data.type);
    if (!type) return false;

    // Only handle ARCADE:* messages.
    if (!type.startsWith('ARCADE:')) return false;

    // Only trust messages from the active iframe.
    try {
      if (iframe.contentWindow && ev.source !== iframe.contentWindow) return true;
    } catch {
      return true;
    }

    // Strict origin validation.
    const expected = currentTargetOrigin();
    if (!validateMessageOrigin(ev.origin, [expected])) {
      emitError('origin_rejected', { got: ev.origin, expected });
      return true;
    }

    // Catalog allowlist.
    const allow = allowedMessageTypes();
    if (!allow.has(type)) {
      emitError('type_not_allowed', { type });
      return true;
    }

    const payload = normalizePayload(data);

    if (type === standardBridgeMessageTypes.READY) {
      const v = validateReadyPayload(payload);
      if (!v.ok) {
        emitError('ready_invalid', { error: v.error });
        return true;
      }
      ready = true;
      try { onReady && onReady({
        gameId: v.value.gameId || safeStr(game?.id),
        version: v.value.version,
        metricsVersion: v.value.metricsVersion,
        origin: expected
      }); } catch {}
      return true;
    }

    if (type === standardBridgeMessageTypes.REQUEST_RUN) {
      const v = validateRequestRunPayload(payload);
      if (!v.ok) {
        emitError('request_run_invalid', { error: v.error });
        return true;
      }
      try { onRequestRun && onRequestRun(v.value); } catch {}
      return true;
    }

    if (type === standardBridgeMessageTypes.RUN_RESULT) {
      const v = validateRunResultPayload(payload);
      if (!v.ok) {
        emitError('run_result_invalid', { error: v.error });
        return true;
      }
      try { onRunResult && onRunResult(v.value); } catch {}
      return true;
    }

    // Other ARCADE:* messages are ignored by default.
    return true;
  }

  function getState() {
    return {
      mounted,
      ready,
      gameId: safeStr(game?.id),
      targetOrigin: currentTargetOrigin()
    };
  }

  return Object.freeze({
    mount,
    unmount,
    send,
    sync,
    handleMessageEvent,
    getState
  });
}
