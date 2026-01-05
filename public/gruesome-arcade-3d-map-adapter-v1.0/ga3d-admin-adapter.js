/* built by gruesøme */
/* sig(enc:xor-0x5A,utf8,hex)=382f33362e7a38237a3d282f3f29a2373f */

/**
 * Compatibility shim:
 * - Summary v2.4 expects: /gruesome-arcade-3d-map-adapter-v1.0/ga3d-admin-adapter.js
 * - Iteration 4.3 ships: /gruesome-arcade-metrics-map-adapter-v1.0/adminSnapshotAdapter.js
 *
 * This file re-exports the expected API:
 *   getAdminSnapshot()
 *   snapshotToGraph(snapshot)
 */

import { fetchAdminSnapshot, snapshotToGraph } from '/gruesome-arcade-metrics-map-adapter-v1.0/adminSnapshotAdapter.js';

export async function getAdminSnapshot(){
  return await fetchAdminSnapshot();
}

export { snapshotToGraph };
