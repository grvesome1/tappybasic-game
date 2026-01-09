// Minimal compatibility stub.
// The original Moonshot build referenced a heavier VFX module here.
// This stub preserves runtime behavior without blocking gameplay.

export class Wormhole3D {
	constructor(THREE, opts = {}) {
		this.THREE = THREE;
		this.opts = opts;
		this.group = new THREE.Group();
		this.group.name = 'Wormhole3D';
	}

	update() {
		// no-op
	}
}
