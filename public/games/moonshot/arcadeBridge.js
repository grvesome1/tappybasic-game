// built by gruesøme — SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f
/**
 * Minimal postMessage bridge used by embedded Arcade games.
 * Parent (arcade shell) is authoritative for:
 * - run grants
 * - balance / PRO status
 * - run submission to backend
 */
export function createArcadeBridge(opts = {}) {
  const embedded = window.parent && window.parent !== window;
  let refOrigin = null;
  try {
    if (document.referrer) refOrigin = new URL(document.referrer).origin;
  } catch (_) {
    refOrigin = null;
  }
  const targetOrigin = refOrigin || '*';

  const handlers = new Set();

  function post(type, payload) {
    if (!embedded) return;
    window.parent.postMessage({ type, payload }, targetOrigin);
  }

  function on(fn) {
    handlers.add(fn);
    return () => handlers.delete(fn);
  }

  function onMessage(ev) {
    const d = ev?.data;
    if (!d || typeof d.type !== 'string') return;
    if (refOrigin && ev.origin !== refOrigin) return;
    const payload = d.payload;
    for (const fn of handlers) {
      try {
        fn(d.type, payload, ev);
      } catch (_) {}
    }
  }

  window.addEventListener('message', onMessage);

  return {
    embedded,
    targetOrigin,
    post,
    on,
  };
}
