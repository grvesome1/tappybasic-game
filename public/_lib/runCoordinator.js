// built by gruesøme
// sig(b64)=YnVpbHQgYnkgZ3J1ZXPDuG1l

/**
 * RunCoordinator (runtime ESM)
 * Narrow interface:
 * - requestRun({ gameId, desiredRunType }) => { granted:boolean, payload }
 * - completeRun({ gameId, runId, metrics, durationMs, metricId, metricValue }) => void
 */

function safeStr(v) {
  return (typeof v === 'string') ? v : '';
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export class RunCoordinator {
  constructor(hooks) {
    this.hooks = hooks || {};
  }

  async requestRun(req) {
    const gameId = safeStr(req?.gameId);
    const desiredRunType = safeStr(req?.desiredRunType) || 'paid';

    const h = this.hooks;

    try {
      const sim = !!(h.isSimulateMode && h.isSimulateMode());
      if (!sim) {
        const connected = !!(h.isWalletConnected && h.isWalletConnected());
        if (!connected) return { granted: false, payload: { gameId, reason: 'not_connected' } };

        const requirePoh = !!(h.isPohRequired && h.isPohRequired());
        const pohOk = !!(h.isPohVerified && h.isPohVerified());
        if (requirePoh && !pohOk) return { granted: false, payload: { gameId, reason: 'poh_required' } };
      }

      if (typeof h.requestRunImpl !== 'function') {
        return { granted: false, payload: { gameId, reason: 'not_supported' } };
      }

      return await h.requestRunImpl({ gameId, desiredRunType });
    } catch (e) {
      return { granted: false, payload: { gameId, reason: 'error', error: safeStr(e?.message) } };
    }
  }

  async completeRun(req) {
    const gameId = safeStr(req?.gameId);
    const runId = safeStr(req?.runId);
    const durationMs = Math.max(0, Math.floor(safeNum(req?.durationMs) || 0));

    const metrics = isObj(req?.metrics) ? req.metrics : null;
    const metricId = safeStr(req?.metricId);
    const metricValue = safeNum(req?.metricValue);

    const h = this.hooks;

    if (typeof h.completeRunImpl !== 'function') {
      return { ok: false, error: 'not_supported' };
    }

    return await h.completeRunImpl({
      gameId,
      runId,
      durationMs,
      metrics,
      metricId,
      metricValue
    });
  }
}
