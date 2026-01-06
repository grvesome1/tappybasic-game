# EMBEDDING

<!-- built by gruesøme -->
<!-- sig(b64)=YnVpbHQgYnkgZ3J1ZXPDuG1l -->

## How to add a new game (checklist)
1) Create a folder: `public/games/<id>/` with an `index.html`.
2) Add one entry to `public/arcade-games.json`:
   - `id`, `embedUrl` (or `url`), `name` (or `title`)
   - `defaultMetric`
   - `metrics` (array of metric objects; ids are used as the generic IDs)
   - Optional policies:
     - `runTypePolicy`: `"free" | "paid" | "promoOnly"` (default `"paid"`)
     - `sandboxPolicy`: `"strict" | "relaxed"` (default `"strict"`)
     - `allowList`: `string[]` of inbound message types (optional)
3) Done: no additional Arcade-side code changes should be required.

## PostMessage contract (game ↔ arcade)

### Game → Arcade
- `ARCADE:READY` `{ gameId, version, metricsVersion }`
  - Send once after game boot.
- `ARCADE:REQUEST_RUN` `{ gameId, desiredRunType }`
  - Arcade will reply with either `ARCADE:RUN_GRANTED` or `ARCADE:RUN_DENIED`.
- `ARCADE:RUN_RESULT` `{ gameId, runId, durationMs, metrics, metricId?, metricValue? }`
  - `metrics` is a generic map (ids must match catalog metric ids).

### Arcade → Game
- `ARCADE:SYNC` `{ address, credits:{paid,promo}, membership, avatar }`
  - Arcade is authoritative; only these fields are sent.
- `ARCADE:RUN_GRANTED` `{ gameId, runId, runType, cost:{paidAC,promoAC} }`
- `ARCADE:RUN_DENIED` `{ gameId, reason }`

## Minimal game-side bridge stub
```html
<script>
  const GAME_ID = 'my-game';

  function post(type, payload){
    window.parent.postMessage({ type, payload }, window.location.origin);
  }

  // 1) READY
  post('ARCADE:READY', { gameId: GAME_ID, version: '1', metricsVersion: '1' });

  // 2) Request a run
  async function requestRun(){
    post('ARCADE:REQUEST_RUN', { gameId: GAME_ID, desiredRunType: 'paid' });
  }

  // 3) Wait for RUN_GRANTED before starting
  let granted = null;
  window.addEventListener('message', (ev) => {
    if (ev.origin !== window.location.origin) return;
    const m = ev.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'ARCADE:RUN_GRANTED') {
      granted = m.payload;
      // start your gameplay loop now
    }
    if (m.type === 'ARCADE:SYNC') {
      // optional: update UI with credits/address
    }
  });

  // 4) Submit result when complete
  function submitResult(score, durationMs){
    if (!granted) return;
    post('ARCADE:RUN_RESULT', {
      gameId: GAME_ID,
      runId: granted.runId,
      durationMs,
      metricId: 'score',
      metricValue: score,
      metrics: { score }
    });
  }
</script>
```

## Troubleshooting
- Origin rejected: game must be served from the same origin as the arcade (default CSP is `frame-src 'self'`).
- Missing READY: arcade will not SYNC until it receives `ARCADE:READY`.
- Run gating: game must not start until `ARCADE:RUN_GRANTED` is received.
- If you see `RUN_DENIED`:
  - `not_connected`: connect wallet (or enable Simulate Arcade in dev).
  - `poh_required`: PoH gate enabled but not verified.
  - `no_funds`: buy credits or use promo.
