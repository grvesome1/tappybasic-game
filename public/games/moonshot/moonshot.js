// Moonshot 3D prototype
// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f
const __moonshotReducedMotion = (() => {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    return false;
  }
})();
// Minimal Three.js scene that mimics Moonshot-style movement

const __moonshotDebug = (() => {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
})();

import { createArcadeBridge } from './arcadeBridge.js';

// Arcade iframe bridge (authoritative economy lives in parent)
// built by gruesøme — SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f
const __ARCADE = createArcadeBridge({ gameId: 'moonshot' });
const __EMBEDDED = __ARCADE.embedded;

const __RUN = {
  active: false,
  runId: '',
  startMs: 0,
  pendingFlap: false,
  pendingStart: false,
};

if (__EMBEDDED) {
  __ARCADE.post('ARCADE:READY', { gameId: 'moonshot' });
  __ARCADE.on((type, payload) => {
    if (type === 'ARCADE:SYNC') {
      // optional: parent can push balances/xp/etc
      window.__ARCADE_SYNC = payload || {};
      return;
    }
    if (type === 'ARCADE:RUN_DENIED') {
      // Parent is authoritative. Do not start.
      __RUN.active = false;
      __RUN.runId = '';
      __RUN.startMs = 0;
      __RUN.pendingFlap = false;
      __RUN.pendingStart = false;
      try {
        const code = String(payload?.reason || 'run_denied');
        const msg = (
          code === 'not_connected' ? 'Connect wallet (or enable Simulate Arcade) to start.' :
          code === 'poh_required' ? 'POH verification required to start.' :
          code === 'no_funds' ? 'Not enough Credits to start.' :
          code === 'run_in_progress' ? 'Finish the current run first.' :
          (code || 'Run denied')
        );
        setCenterMessage(msg, true);
      } catch {}
      return;
    }
    if (type === 'ARCADE:RUN_GRANTED') {
      const rid = String(payload?.runId || '');
      if (!rid) return;
      __RUN.active = true;
      __RUN.runId = rid;
      __RUN.startMs = performance.now();

      // Start (or restart) immediately on grant.
      if (!game.started || game.over) startGame();

      // Apply deferred input intent.
      if (__RUN.pendingFlap) {
        __RUN.pendingFlap = false;
        flap();
      }
      __RUN.pendingStart = false;
      return;
    }
  });
}

function requestArcadeRun() {
  if (!__EMBEDDED) return true;
  if (__RUN.active) return true;

  let desiredRunType = '';
  try {
    const sync = (window.__ARCADE_SYNC && typeof window.__ARCADE_SYNC === 'object') ? window.__ARCADE_SYNC : {};
    desiredRunType = String(sync.desiredRunType || sync.runType || '').trim();
    if (!desiredRunType && sync.usesCreditsInRun === false) desiredRunType = 'free';
  } catch {
    desiredRunType = '';
  }
  if (!desiredRunType) desiredRunType = 'paid';

  __ARCADE.post('ARCADE:REQUEST_RUN', { gameId: 'moonshot', desiredRunType });
  return false;
}

const __moonshotApiEnabled = (() => {
  try {
    return new URLSearchParams(window.location.search).get('api') === '1';
  } catch {
    return false;
  }
})();

const __moonshotForceMobile = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('mobile') === '1' || params.get('forceMobile') === '1';
  } catch {
    return false;
  }
})();

if (__moonshotDebug) {
  console.log(`[Moonshot] UI build 2025-12-25a | reducedMotion=${__moonshotReducedMotion}`);
}

import * as THREE from './vendor/three.module.js';
import { Wormhole3D } from './src/vfx/Wormhole3D.js';

let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
if (__moonshotForceMobile) isMobile = true;

let __moonshotPostScale = 1.0;
try {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('postScale');
  const v = raw != null ? parseFloat(raw) : NaN;
  if (Number.isFinite(v)) {
    __moonshotPostScale = Math.max(0.5, Math.min(1.0, v));
  } else {
    __moonshotPostScale = isMobile ? 0.85 : 1.0;
  }
} catch {
  __moonshotPostScale = isMobile ? 0.85 : 1.0;
}

const __tmpRocketWorldPos = new THREE.Vector3();
const __tmpTrailWorldPos = new THREE.Vector3();
const __tmpSlowWaveWorldPos = new THREE.Vector3();
const __tmpPowerupPos = new THREE.Vector3();
const __tmpPowerupBox = new THREE.Box3();

let __steerPointerId = null;

// Basic gameplay constants (mirroring feel from 2D game, adjustable)
// Gravity / flap tuned to track the 2D rocket closely
const GRAVITY = 0.25;
const FLAP_STRENGTH = -5.0;
// Slightly lower base speed so early game is more forgiving
const BASE_SPEED = 2.2;
const PIPE_INTERVAL = 1.4; // seconds between pipe spawns (baseline)
const PIPE_GAP = 30;       // world units (legacy; see dynamic gap ranges below)
const PIPE_WIDTH = 4;      // narrower candles so gaps feel less "in your face"

// Shared vertical playfield band used for both pipe gaps and
// loose powerups so everything lives in the same safe corridor.
const PLAYFIELD_MIN_Y = -24;
const PLAYFIELD_MAX_Y = 24;

// Desktop mouse-driven control band for mapping screen Y into
// world Y when steering with the mouse. Kept comfortably inside
// the vertical kill bounds so the cursor can traverse the full
// band without immediately hitting game over.
const MOUSE_TARGET_Y_MIN = -24;
const MOUSE_TARGET_Y_MAX = 24;

// Powerup tuning (seconds / chances)
// Keep the baseline chance modest so gaps don't almost always
// contain a pickup. Loose powerups are further gated by their
// own timer so combined spawn rate stays under control.
const POWERUP_MIN_SPAWN_CHANCE = 0.20;
const POWERUP_COOLDOWN = 4.2; // seconds after a spawn attempt
const GUN_DURATION = 6.0;
const SLOW_DURATION = 2.4;
// Wormhole triggers a short, milder slow-time burst (half strength).
const WORMHOLE_SLOW_DURATION = 1.2;
const DOUBLE_DURATION = 10.0;
const CECE_DURATION = 3.3;
const INVINC_DURATION = 3.5;
// Base auto-fire cadence for the Gun powerup.
// Slightly slower on desktop so it reads as pistol fire instead of a minigun.
const GUN_FIRE_INTERVAL = isMobile ? 0.26 : 0.26;

// Score-driven speed scaling adapted from the 2D game
const SPEED_INCREMENT_MIN = 0.035;
const SPEED_INCREMENT_MAX = 0.095;

let scene, camera, renderer;
let rocket;
let starsNear, starsMid, starsFar;
let renderTarget, postScene, postCamera, postMaterial, postQuad;
let slowWarpTime = 0;
let bulletGeometry, bulletHeadMaterial, bulletCasingMaterial;
let laserBulletGeometry, laserBulletMaterial;
let invincBeamGeometry, invincBeamMaterial;
let candleShellTexture;
let candlePulse = 1;
let candlePulsePhase = 0;

// Rocket VFX textures (built once at runtime).
let rocketFlameSpriteTex;
let rocketTrailSpriteTex;

// Premium procedural wormhole portal (singleton, mounted once).
let wormhole3D;

// Wormhole shared resources. These are built once and reused for
// every portal instance so the effect stays cheap even on mobile.
const WORMHOLE_QUALITY = (isMobile ? 'normal' : 'high');
let wormholeRingGeometry;
let wormholeRingMaterial;
let wormholeTunnelGeometry;
let wormholeTunnelMaterial;
let wormholeParticleGeometry;
let wormholeParticleMaterial;
let wormholeGlyphTexture;

// Per-frame wormhole "gravity" fields used to locally bend the
// starfield around active portals. Populated from updatePowerups
// and consumed by updateStarLayer so the effect stays cheap.
const activeWormholeLenses = [];
const tmpWormholePos = new THREE.Vector3();

function initWormholeResources() {
  const ringSegments = WORMHOLE_QUALITY === 'high' ? 80 : 52;
  const tubeSegments = WORMHOLE_QUALITY === 'high' ? 32 : 20;

  if (!wormholeRingGeometry) {
    wormholeRingGeometry = new THREE.TorusGeometry(1.4, 0.28, tubeSegments, ringSegments);
  }

  if (!wormholeTunnelGeometry) {
    // Short inner tunnel: slightly narrower than the ring, built
    // along the +Z axis so we can rotate/billboard as needed.
    const radiusTop = 0.95;
    const radiusBottom = 0.55;
    const height = 3.2;
    wormholeTunnelGeometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 28, 1, true);
    wormholeTunnelGeometry.rotateX(Math.PI / 2);
  }

  if (!wormholeGlyphTexture) {
    // Procedurally draw alien glyphs arranged in a ring that can
    // be scrolled/rotated as a texture.
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, size, size);
      ctx.translate(size / 2, size / 2);
      const glyphCount = 24;
      for (let i = 0; i < glyphCount; i++) {
        const angle = (i / glyphCount) * Math.PI * 2;
        const r = size * 0.33;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.random() * 0.6 - 0.3);
        const w = 6 + Math.random() * 4;
        const h = 10 + Math.random() * 6;
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.8 + Math.random() * 0.2;
        ctx.beginPath();
        ctx.moveTo(-w * 0.5, -h * 0.5);
        ctx.lineTo(w * 0.5, -h * 0.2);
        ctx.lineTo(-w * 0.2, h * 0.5);
        ctx.stroke();
        ctx.restore();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      wormholeGlyphTexture = tex;
    }
  }

  if (!wormholeRingMaterial) {
    // Event horizon ring with a simple fresnel-style rim driven
    // entirely in the fragment shader.
    const uniforms = {
      u_time: { value: 0 },
      u_intensity: { value: 1 },
      // Cooler inner teal with a vivid violet outer rim so the
      // horizon reads as high-energy rather than a flat glow.
      u_colorInner: { value: new THREE.Color(0x22d3ee) },
      u_colorOuter: { value: new THREE.Color(0xa855f7) },
      u_glyphTex: { value: wormholeGlyphTexture },
      u_glyphIntensity: { value: 0.0 },
    };
    wormholeRingMaterial = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float u_time;
        uniform float u_intensity;
        uniform vec3 u_colorInner;
        uniform vec3 u_colorOuter;
        uniform sampler2D u_glyphTex;
        uniform float u_glyphIntensity;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fres = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.4);

          // Radial coordinate around the torus tube; this lets us
          // build a thick, bright event horizon band with a softer
          // interior falloff.
          float radial = abs(vUv.y - 0.5);
          float innerFalloff = 1.0 - smoothstep(0.0, 0.26, radial);
          float outerFalloff = smoothstep(0.40, 0.16, radial);
          float ringMask = clamp(innerFalloff * outerFalloff, 0.0, 1.0);

          // High-frequency energy waves that chase each other around
          // the ring so it never looks static.
          float swirl1 = sin((vUv.x * 2.4 + u_time * 0.9) * 9.0);
          float swirl2 = cos((vUv.x * 3.1 - u_time * 0.7) * 5.0);
          float swirl = 0.6 * swirl1 + 0.4 * swirl2;

          // Fresnel-driven rim plus animated swirl define how much
          // of the outer violet band vs inner teal we see.
          float band = clamp(fres * 1.25 + swirl * 0.35, 0.0, 1.0);

          // Base horizon gradient.
          vec3 rimCol = mix(u_colorInner, u_colorOuter, band);

          // Subtle magenta accent that rides along the outer edge,
          // giving the portal a more cinematic "fuelled" look.
          vec3 accentCol = vec3(0.86, 0.52, 1.0);
          float accentMask = smoothstep(0.18, 0.38, radial);
          accentMask *= 0.45 + 0.55 * sin(u_time * 2.1 + vUv.x * 18.0);
          vec3 color = mix(rimCol, accentCol, clamp(accentMask, 0.0, 1.0));

          // Strengthen towards the camera-facing rim and keep a bit
          // of glow even in the softer interior.
          float glow = 0.32 + 0.78 * band;
          glow *= 0.4 + 0.6 * fres;
          color *= glow * u_intensity;

          // Glyphs sit on the outer third of the ring and scroll
          // slowly so they read as alien inscriptions, not noise.
          vec2 glyphUv = vec2(fract(vUv.x + u_time * 0.04), 0.5);
          vec3 glyphCol = texture2D(u_glyphTex, glyphUv).rgb;
          float glyphMask = smoothstep(0.22, 0.40, radial) * fres;
          float glyphStrength = u_glyphIntensity * glyphMask;
          color += glyphCol * glyphStrength * 1.1;

          float alpha = ringMask * (0.7 + 0.6 * band) * u_intensity;
          alpha = clamp(alpha, 0.0, 1.0);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
  }

  if (!wormholeTunnelMaterial) {
    const octaves = WORMHOLE_QUALITY === 'high' ? 3 : 2;
    const uniforms = {
      u_time: { value: 0 },
      u_intensity: { value: 1 },
      u_octaves: { value: octaves },
      u_color: { value: new THREE.Color(0x7dd3fc) },
    };
    wormholeTunnelMaterial = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          vUv = uv;
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float u_time;
        uniform float u_intensity;
        uniform int u_octaves;
        uniform vec3 u_color;
        varying vec2 vUv;
        varying vec3 vPos;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        float fbm(vec2 p) {
          float f = 0.0;
          float amp = 0.7;
          float freq = 1.0;
          for (int i = 0; i < 4; i++) {
            if (i >= u_octaves) break;
            f += noise(p * freq) * amp;
            freq *= 2.0;
            amp *= 0.5;
          }
          return f;
        }

        void main() {
          // Local cylindrical coordinates inside the tunnel.
          float r = length(vPos.xy);
          float z = vPos.z;
          float t = u_time * 0.7;

          // Scroll noise in a spiral along the bore so the tunnel
          // feels like it has depth and flowing energy.
          float angle = atan(vPos.y, vPos.x);
          vec2 p = vec2(angle / 6.2831 + t * 0.18, (z * 0.45) + t);
          float baseBands = fbm(p * 2.4);
          float streaks = fbm(vec2(p.x * 3.6, p.y * 5.2 + t * 0.6));

          // Near the entry, keep the tunnel more open; deeper in,
          // compress detail so it feels like you're falling toward
          // a dense focal point.
          float depthNorm = clamp((z + 1.6) / 3.2, 0.0, 1.0);
          float coreBoost = 1.0 - depthNorm;

          float edge = smoothstep(0.12, 0.0, r - 0.10);
          float energy = mix(baseBands, streaks, 0.55);
          energy *= edge;
          energy *= 0.55 + 0.9 * coreBoost;
          energy = clamp(energy, 0.0, 1.0);

          vec3 col = u_color * (0.22 + 1.15 * energy) * u_intensity;
          float alpha = energy * 0.78 * u_intensity * (0.6 + 0.4 * (1.0 - depthNorm));
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
  }

  if (!wormholeParticleGeometry) {
    const count = WORMHOLE_QUALITY === 'high' ? 820 : 420;
    const positions = new Float32Array(count * 3);
    const angles = new Float32Array(count);
    const radii = new Float32Array(count);
    const phases = new Float32Array(count);
    const rnd = (min, max) => min + Math.random() * (max - min);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(0.9, 2.4);
      const y = rnd(-0.7, 0.7);
      positions[i * 3 + 0] = Math.cos(a) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(a) * r;
      angles[i] = a;
      radii[i] = r;
      phases[i] = Math.random();
    }
    wormholeParticleGeometry = new THREE.BufferGeometry();
    wormholeParticleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    wormholeParticleGeometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
    wormholeParticleGeometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
    wormholeParticleGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  }

  if (!wormholeParticleMaterial) {
    const uniforms = {
      u_time: { value: 0 },
      u_intensity: { value: 1 },
      // Slightly brighter cyan so individual sparks read as
      // white-hot highlights when clustered.
      u_baseColor: { value: new THREE.Color(0x4adeff) },
    };
    wormholeParticleMaterial = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aAngle;
        attribute float aRadius;
        attribute float aPhase;
        uniform float u_time;
        varying float vLife;
        varying float vRadius;
        void main() {
          float t = u_time * 0.45 + aPhase * 6.2831;
          float spiral = aRadius * (0.52 + 0.48 * fract(t * 0.11));
          float angle = aAngle + t * 0.7;
          float x = cos(angle) * spiral;
          float y = position.y * 0.8;
          float z = sin(angle) * spiral;
          vec3 pos = vec3(x, y, z);
          vLife = fract(t * 0.4);
          vRadius = aRadius;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          float sizePulse = 1.0 + 0.35 * sin(t * 3.4);
          gl_PointSize = (3.0 + 5.0 * (1.0 - vLife)) * sizePulse;
        }
      `,
      fragmentShader: `
        uniform float u_intensity;
        uniform vec3 u_baseColor;
        varying float vLife;
        varying float vRadius;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          if (r > 0.5) discard;
          float falloff = pow(1.0 - smoothstep(0.0, 0.5, r), 1.4);
          float flicker = 0.7 + 0.3 * sin(vLife * 6.2831 * 2.1);
          // Nudge colour hotter near the inner radii so sparks
          // close to the horizon feel almost white.
          float radiusNorm = clamp((vRadius - 0.9) / (2.4 - 0.9), 0.0, 1.0);
          vec3 hotCol = mix(vec3(1.0, 0.98, 0.96), u_baseColor, radiusNorm);
          vec3 col = hotCol * (falloff * flicker * u_intensity * 1.2);
          float alpha = falloff * 0.9 * u_intensity;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
  }
}

// Bullet system tuning and shared scratch objects to avoid per-frame
// allocations in hot paths.
const MAX_BULLETS = 64;
const BULLET_SPEED = 52;
const BULLET_MAX_LIFE = 2.3;
let bulletPoolInitialised = false;
let nextBulletIndex = 0;
const tmpBulletBox = new THREE.Box3();
const tmpPipeBoxTop = new THREE.Box3();
const tmpPipeBoxBottom = new THREE.Box3();
const tmpRocketCollisionBox = new THREE.Box3();
const tmpRocketPickupBox = new THREE.Box3();
const tmpCeceBox = new THREE.Box3();

// Shared candle resources so the red obstacle columns can be built
// from a small set of geometries/materials instead of recreating
// them per spawn.
let candleCoreGeometry;
let candleShellGeometry;
let candleCapGeometry;
let candleHaloGeometry;
let candleCoreMaterial;
let candleShellMaterial;
let candleCapMaterial;
let candleHaloMaterial;
let candleRibGeometry;
let candleRibMaterial;
let candleMouthGeometry;
let candleMouthMaterial;

function initCandleResources() {
  if (!candleCoreGeometry || !candleShellGeometry || !candleCapGeometry || !candleHaloGeometry || !candleRibGeometry || !candleMouthGeometry) {
    const PIPE_DEPTH = 4;
    const baseHeight = 160;
    // Inner emissive core is slightly narrower than the visual
    // footprint so the hottest light feels inset.
    candleCoreGeometry = new THREE.BoxGeometry(PIPE_WIDTH * 0.64, baseHeight, PIPE_DEPTH * 0.7);
    // Outer shell defines the main collision footprint.
    candleShellGeometry = new THREE.BoxGeometry(PIPE_WIDTH, baseHeight, PIPE_DEPTH);
    // Cap hugging the gap edge.
    const capHeight = 10;
    candleCapGeometry = new THREE.BoxGeometry(PIPE_WIDTH * 0.9, capHeight, PIPE_DEPTH * 0.9);
    // Vertical halo slab that will be duplicated/rotated per
    // column so the glow reads from multiple angles.
    const haloHeight = capHeight * 1.4;
    candleHaloGeometry = new THREE.PlaneGeometry(PIPE_WIDTH * 1.2, haloHeight);
    // Thin structural rib segment reused along the column to
    // break up the silhouette and add depth without many tris.
    const ribHeight = 6;
    candleRibGeometry = new THREE.BoxGeometry(PIPE_WIDTH * 1.02, ribHeight, PIPE_DEPTH * 1.02);
    // Small inner flare at the reactor mouth so the hottest
    // energy feels like it jets out of the core.
    candleMouthGeometry = new THREE.SphereGeometry(PIPE_WIDTH * 0.32, 16, 16);
  }

  if (!candleShellTexture) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#090712';
      ctx.fillRect(0, 0, size, size);
      // Broad vertical burn bands
      ctx.fillStyle = '#311019';
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * size;
        const w = 4 + Math.random() * 10;
        ctx.globalAlpha = 0.12 + Math.random() * 0.18;
        ctx.fillRect(x, 0, w, size);
      }
      // Hotter streaks near the gap band.
      ctx.fillStyle = '#7f1d1d';
      for (let i = 0; i < 28; i++) {
        const x = Math.random() * size;
        const h = size * (0.3 + Math.random() * 0.2);
        const y = (size - h) * 0.5;
        ctx.globalAlpha = 0.18 + Math.random() * 0.16;
        ctx.fillRect(x, y, 2 + Math.random() * 3, h);
      }
      ctx.globalAlpha = 1;
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      candleShellTexture = tex;
    }
  }

  if (!candleCoreMaterial) {
    // Glowing inner energy spine for the reactor spires.
    candleCoreMaterial = new THREE.MeshStandardMaterial({
      color: 0x7f1d1d,
      emissive: 0xff4d4d,
      emissiveIntensity: 1.15,
      metalness: 0.4,
      roughness: 0.24,
    });
  }
  if (!candleShellMaterial) {
    // Dark outer spine casing that stays mostly matte so the
    // inner core and frames carry the glow.
    candleShellMaterial = new THREE.MeshStandardMaterial({
      color: 0x12070a,
      emissive: 0x3f0f1f,
      emissiveIntensity: 0.28,
      metalness: 0.7,
      roughness: 0.32,
      transparent: true,
      opacity: 0.96,
      map: candleShellTexture || null,
    });
  }
  if (!candleCapMaterial) {
    // Reactor mouth at the gap edge: hottest point.
    candleCapMaterial = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xffb347,
      emissiveIntensity: 1.15,
      metalness: 0.6,
      roughness: 0.2,
    });
  }
  if (!candleHaloMaterial) {
    // Thin additive halos around the mouth, used with color
    // variation per top/bottom to keep the field readable.
    candleHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // Keep glow color vivid under ACES filmic.
    candleHaloMaterial.toneMapped = false;
  }
  if (!candleRibMaterial) {
    // Structural frames/brackets that sit outside the core and
    // pick up a cooler teal accent so the red glow has contrast.
    candleRibMaterial = new THREE.MeshStandardMaterial({
      color: 0x09141a,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.95,
      metalness: 0.75,
      roughness: 0.3,
    });
  }
  if (!candleMouthMaterial) {
    candleMouthMaterial = new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0xfff7ed,
      emissiveIntensity: 1.4,
      metalness: 0.15,
      roughness: 0.1,
      transparent: true,
      opacity: 0.9,
    });
  }
}

// Shared hourglass resources (geometry/materials) reused for both
// the SLOW pickup and the in-flight slow indicator to keep memory
// footprint and allocations low.
let hourglassGlassGeometry;
let hourglassGlassMaterial;
let hourglassFrameTopGeometry;
let hourglassFrameSupportGeometry;
let hourglassFrameMaterial;
let hourglassSandTopGeometry;
let hourglassSandBottomGeometry;
let hourglassSandStreamGeometry;
let hourglassSandMaterial;
let hourglassFrameTexture;

function initHourglassResources() {
  if (!hourglassGlassGeometry) {
    // Lathe profile for a classic two-bulb hourglass with a
    // narrow throat at the centre.
    const pts = [];
    const halfHeight = 1.35;
    const bulbRadius = 0.75;
    const neckRadius = 0.18;

    // Bottom tip to lower bulb
    pts.push(new THREE.Vector2(0.02, -halfHeight));
    pts.push(new THREE.Vector2(neckRadius * 0.9, -halfHeight + 0.08));
    pts.push(new THREE.Vector2(bulbRadius * 0.95, -halfHeight + 0.55));
    pts.push(new THREE.Vector2(bulbRadius, -0.55));
    // Throat
    pts.push(new THREE.Vector2(neckRadius, -0.14));
    pts.push(new THREE.Vector2(neckRadius * 0.96, 0));
    pts.push(new THREE.Vector2(neckRadius, 0.14));
    // Upper bulb (mirror)
    pts.push(new THREE.Vector2(bulbRadius, 0.55));
    pts.push(new THREE.Vector2(bulbRadius * 0.95, halfHeight - 0.55));
    pts.push(new THREE.Vector2(neckRadius * 0.9, halfHeight - 0.08));
    pts.push(new THREE.Vector2(0.02, halfHeight));

    hourglassGlassGeometry = new THREE.LatheGeometry(pts, 64);
    hourglassGlassGeometry.computeVertexNormals();
  }

  if (!hourglassFrameTopGeometry) {
    hourglassFrameTopGeometry = new THREE.CircleGeometry(0.95, 32);
  }
  if (!hourglassFrameSupportGeometry) {
    hourglassFrameSupportGeometry = new THREE.CylinderGeometry(0.06, 0.06, 2.3, 12);
  }
  if (!hourglassSandTopGeometry) {
    hourglassSandTopGeometry = new THREE.ConeGeometry(0.55, 0.9, 22);
  }
  if (!hourglassSandBottomGeometry) {
    hourglassSandBottomGeometry = new THREE.ConeGeometry(0.7, 0.9, 22);
  }
  if (!hourglassSandStreamGeometry) {
    hourglassSandStreamGeometry = new THREE.CylinderGeometry(0.06, 0.02, 0.6, 10);
  }

  if (!hourglassGlassMaterial) {
    hourglassGlassMaterial = new THREE.MeshPhysicalMaterial({
      // Realistic clear glass (hourglass should read as an actual object,
      // not a neon ring). Keep only a very subtle cool tint.
      color: 0xe2e8f0,
      emissive: 0x0b1120,
      emissiveIntensity: 0.06,
      metalness: 0.0,
      roughness: 0.05,
      transmission: 0.97,
      ior: 1.5,
      thickness: 0.38,
      clearcoat: 0.2,
      clearcoatRoughness: 0.15,
    });
  }

  if (!hourglassFrameTexture) {
    // Simple brushed-metal style texture: vertical streaks.
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1f2933';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#4b5563';
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * size;
        ctx.globalAlpha = 0.14 + Math.random() * 0.12;
        ctx.fillRect(x, 0, 1 + Math.random(), size);
      }
      ctx.globalAlpha = 1;
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      hourglassFrameTexture = tex;
    }
  }

  if (!hourglassFrameMaterial) {
    hourglassFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      metalness: 0.85,
      roughness: 0.42,
      map: hourglassFrameTexture || null,
    });
  }

  if (!hourglassSandMaterial) {
    hourglassSandMaterial = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.7,
      metalness: 0.1,
      roughness: 0.45,
    });
  }
}

function createHourglassMesh(isIndicator) {
  initHourglassResources();
  const hg = new THREE.Group();

  const glass = new THREE.Mesh(hourglassGlassGeometry, hourglassGlassMaterial);
  hg.add(glass);

  // Frame: top/bottom caps plus three supports.
  const topCap = new THREE.Mesh(hourglassFrameTopGeometry, hourglassFrameMaterial);
  topCap.position.y = 1.45;
  topCap.rotation.x = -Math.PI / 2;
  hg.add(topCap);

  const bottomCap = topCap.clone();
  bottomCap.position.y = -1.45;
  bottomCap.rotation.x = Math.PI / 2;
  hg.add(bottomCap);

  const supportRadius = 0.82;
  const supportY = 0;
  const supportHeights = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
  for (let i = 0; i < supportHeights.length; i++) {
    const a = supportHeights[i];
    const s = new THREE.Mesh(hourglassFrameSupportGeometry, hourglassFrameMaterial);
    s.position.set(Math.cos(a) * supportRadius, supportY, Math.sin(a) * supportRadius);
    hg.add(s);
  }

  // Sand: small top pile, bottom pile and a thin falling stream.
  const sandTop = new THREE.Mesh(hourglassSandTopGeometry, hourglassSandMaterial);
  sandTop.position.y = 0.45;
  sandTop.rotation.x = Math.PI; // tip downward
  hg.add(sandTop);

  const sandBottom = new THREE.Mesh(hourglassSandBottomGeometry, hourglassSandMaterial);
  sandBottom.position.y = -0.95;
  hg.add(sandBottom);

  const sandStream = new THREE.Mesh(hourglassSandStreamGeometry, hourglassSandMaterial);
  sandStream.position.y = -0.15;
  hg.add(sandStream);

  hg.userData.sandTop = sandTop;
  hg.userData.sandBottom = sandBottom;
  hg.userData.sandStream = sandStream;
  hg.userData.sandPhase = Math.random() * Math.PI * 2;
  hg.userData.isIndicator = !!isIndicator;

  return hg;
}

// Simple third-person chase camera state
let chaseCamPos = new THREE.Vector3(0, 0, 60);
let chaseCamTarget = new THREE.Vector3(10, 0, 0);

// Chase camera placement: sit behind the rocket, a bit above,
// and offset so the rocket appears slightly lower-left on screen.
const CHASE_BACK = 26;  // distance behind rocket along its forward axis
const CHASE_UP = 7;     // height above rocket
const CHASE_SIDE = 4.5; // reduced lateral offset, closer to directly behind

// Horizontal-mode camera framing: shift to upper-right of the rocket.
// (World-up provides the "upper" component; rocket-right provides "right".)
const CHASE_HORIZ_UP = 9;
const CHASE_HORIZ_RIGHT = 8;

// Smoothing for camera position and look target
// Slightly snappier follow so vertical motion feels responsive
const CHASE_POS_LERP = 0.16;
const CHASE_TARGET_LERP = 0.22;
let lastTime = 0;
let accumulator = 0;
const FIXED_DT = 1 / 60;

// Desktop mouse steering state: we track the last known mouse
// position within the canvas and whether a boost input is held
// (mouse button or space bar). Mobile devices continue to use
// tap-to-flap controls instead of this path.
let mouseYNorm = 0.5;       // 0 = bottom, 1 = top (canvas space)
let mouseXNorm = 0.5;       // 0 = left, 1 = right (canvas space)
let boostHeld = false;      // true while boost input is down

const game = {
  started: false,
  over: false,
  paused: false,
  speed: BASE_SPEED,
  baseSpeed: BASE_SPEED,
  vy: 0,
  hudBar: document.getElementById('moonshot-hud'),
  powerupsBar: document.getElementById('moonshot-powerups-bar'),
  y: 0,
  // Horizontal control axis (used in horizontal mode). We keep
  // forward motion along +X; this is "sideways" steering in Z.
  vz: 0,
  controlZ: 0,
  score: 0,
  highScore: 0,
  redCandlesPassed: 0,
  combo: 1,
  bestCombo: 1,
  multiplier: 1,
  slowPermanentMultiplier: 1,
  pipes: [],
  timeSinceLastPipe: 0,
  powerups: [],
  bullets: [],
  ceceRockets: [],
  lastCeceShotTime: 0,
  slowWaves: [],
  doubleOrbs: [],
  slowWaveTimer: 0,
  powerupCooldownTimer: 0,
  gunTimer: 0,
  slowTimer: 0,
  wormholeSlowTimer: 0,
  wormholeSlowWaveTimer: 0,
  doubleTimer: 0,
  ceceTimer: 0,
  invTimer: 0,
  slowActive: false,
  doubleScoreActive: false,
  ceceActive: false,
  invincible: false,
  lastGunShotTime: 0,
  explosions: [],
  cameraShakeTime: 0,
  cameraShakeIntensity: 0,
  slowVisual: 0,
  rocketTrails: [],
  flapBoost: 0,
  boostVisual: 0,
  thrustState: 0,
  nearMissFlash: 0,
  nearMissMsgTimer: 0,
  pipesSpawned: 0,
  lastGapCenter: 0,
  gapVelY: 0,
  targetY: 0,
  invBeams: [],
  lastFlapSfxTime: 0,
  lastMouseYNormForFlap: 0.5,
  loosePowerupTimer: 0,
  lastWormholeSpawnTime: 0,
  // Dynamic difficulty and short challenge windows
  challengeActive: false,
  challengeTimer: 0,
  nextChallengeAt: 10,
  // Simple milestone flags so we can show one-time streak/goal callouts
  milestoneCandles10: false,
  milestoneCandles25: false,
  milestoneCandles40: false,
  milestoneCombo10: false,
  milestoneCombo20: false,
  // Orientation mode: 'vertical' or 'horizontal'.
  axisMode: 'vertical',
  // Blend factor for orientation: 0 = pure vertical view,
  // 1 = pure horizontal view. Used to smoothly interpolate
  // camera and rocket visuals during wormhole transitions.
  axisBlend: 0,
  // Active axis transition state, or null when not blending.
  axisTransition: null,
  // Short-lived visual warp boost while a wormhole flip is
  // underway so the portal feels like it distorts the screen.
  wormholeWarp: 0,

  // Rocket exhaust trail timing (visual only).
  rocketTrailCooldown: 0,
  rocketTrailBurst: 0,
};

function pulseUi(el, ms) {
  if (!el) return;
  const dur = Number(ms) || 900;
  el.classList.remove('pulse');
  // Force reflow so the animation reliably restarts
  void el.offsetWidth;
  el.classList.add('pulse');
  window.setTimeout(() => {
    try {
      el.classList.remove('pulse');
    } catch (e) {}
  }, dur + 40);
}

function buildRocketVfxTextures(THREE) {
  if (rocketFlameSpriteTex && rocketTrailSpriteTex) return;

  // Flame sprite: hot core + soft outer falloff.
  if (!rocketFlameSpriteTex) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, size, size);
      ctx.translate(size / 2, size / 2);

      // Soft radial glow.
      const grad = ctx.createRadialGradient(0, 0, 6, 0, 0, size * 0.48);
      grad.addColorStop(0.0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.12, 'rgba(255,246,214,0.85)');
      grad.addColorStop(0.32, 'rgba(125,211,252,0.48)');
      grad.addColorStop(0.62, 'rgba(56,189,248,0.22)');
      grad.addColorStop(1.0, 'rgba(0,0,0,0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.48, 0, Math.PI * 2);
      ctx.fill();

      // Wispy spokes for motion richness (subtle).
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
        const r0 = size * 0.08;
        const r1 = size * (0.34 + Math.random() * 0.14);
        const w = 1.2 + Math.random() * 2.0;
        ctx.strokeStyle = `rgba(255,255,255,${0.025 + Math.random() * 0.03})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
      rocketFlameSpriteTex = tex;
    }
  }

  // Trail sprite: elongated soft streak with tapered alpha.
  if (!rocketTrailSpriteTex) {
    const w = 256;
    const h = 64;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0.0, 'rgba(255,255,255,0.00)');
      grad.addColorStop(0.10, 'rgba(255,255,255,0.18)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.34)');
      grad.addColorStop(0.70, 'rgba(255,255,255,0.18)');
      grad.addColorStop(1.0, 'rgba(255,255,255,0.00)');

      const yGrad = ctx.createLinearGradient(0, 0, 0, h);
      yGrad.addColorStop(0.0, 'rgba(0,0,0,0.00)');
      yGrad.addColorStop(0.5, 'rgba(0,0,0,1.00)');
      yGrad.addColorStop(1.0, 'rgba(0,0,0,0.00)');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Multiply in a vertical taper by drawing into alpha.
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = yGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 2;
      rocketTrailSpriteTex = tex;
    }
  }
}

const audio = {
  enabled: true,
  unlocked: false,
  sfx: {},
  shieldLoop: null,
  thrustLoop: null,
  lastPlayTimes: {},
};

function audioUrl(fileName) {
  try {
    return new URL(`./assets/audio/${fileName}`, import.meta.url).toString();
  } catch {
    return `assets/audio/${fileName}`;
  }
}

function maybeInitAudio() {
  if (!audio.enabled || audio.unlocked) return;
  try {
    const names = {
      flap: audioUrl('flap.mp3'),
      // One-shot SFX; continuous engine uses a dedicated
      // thrust loop created just below.
      thrust: audioUrl('thrust.mp3'),
      explosion: audioUrl('explosion.mp3'),
      shoot: audioUrl('gun.mp3'),
      slow: audioUrl('slow.mp3'),
      // Pickup ping for the INVINCIBILITY powerup.
      invincibility: audioUrl('laser.mp3'),
      // Dedicated wormhole entry/exit cue.
      wormhole: audioUrl('wormhole.mp3'),
      powerup: audioUrl('tbagburst.mp3'),
      double: audioUrl('double.mp3'),
      cece: audioUrl('cece_fire.mp3'),
      score: audioUrl('score.mp3'),
      invincFire: audioUrl('invincibility fire.mp3'),

      // Candle-destroy impact stingers (powerup-specific).
      gunCandle: audioUrl('gun-candle.mp3'),
      missileCandle: audioUrl('missle-candle.mp3'),
      invinCandle: audioUrl('invin-candle.mp3'),
    };
    Object.keys(names).forEach((key) => {
      const a = new Audio(names[key]);
      a.preload = 'auto';
      a.crossOrigin = 'anonymous';
      audio.sfx[key] = a;
    });

    // Looping shield ambience used while invincibility is active.
    try {
      const shield = new Audio(audioUrl('shield.mp3'));
      shield.preload = 'auto';
      shield.crossOrigin = 'anonymous';
      shield.loop = true;
      shield.volume = 0.7;
      audio.shieldLoop = shield;
    } catch (e) {
      audio.shieldLoop = null;
    }
    // Continuous thrust/engine loop that runs while the game
    // is in-flight; its volume/pitch will be driven by
    // effective speed (same value as the speed meter).
    try {
      const thrust = new Audio(audioUrl('thrust.mp3'));
      thrust.preload = 'auto';
      thrust.crossOrigin = 'anonymous';
      thrust.loop = true;
      thrust.volume = 0.6;
      audio.thrustLoop = thrust;
    } catch (e) {
      audio.thrustLoop = null;
    }
    audio.unlocked = true;
  } catch (e) {
    audio.enabled = false;
  }
}

function startShieldLoop() {
  if (!audio.enabled || !audio.unlocked || !audio.shieldLoop) return;
  try {
    const a = audio.shieldLoop;
    if (a.paused) {
      a.currentTime = 0;
      a.play().catch(() => {});
    }
  } catch (e) {}
}

function stopShieldLoop() {
  if (!audio.shieldLoop) return;
  try {
    audio.shieldLoop.pause();
    audio.shieldLoop.currentTime = 0;
  } catch (e) {}
}

function playSfx(name, volume, minIntervalMs) {
  if (!audio.enabled || !audio.unlocked) return;
  const a = audio.sfx[name];
  if (!a) return;
  try {
    if (typeof minIntervalMs === 'number' && minIntervalMs > 0) {
      const now = performance.now();
      const last = audio.lastPlayTimes[name] || 0;
      if (now - last < minIntervalMs) return;
      audio.lastPlayTimes[name] = now;
    }
    a.pause();
    a.currentTime = 0;
    if (typeof volume === 'number') {
      a.volume = Math.max(0, Math.min(1, volume));
    }
    a.play().catch(() => {});
  } catch (e) {}
}

// Dynamic scoring sound: adjusts volume and pitch of score.mp3
// based on current run state (combo, multiplier, phase, challenge,
// near-miss, etc.) so passing candles feels more alive.
function playScoreSfx(context) {
  if (!audio.enabled || !audio.unlocked) return;
  const a = audio.sfx.score;
  if (!a) return;

  const now = performance.now();
  const COOLDOWN = 40;
  const last = audio.lastPlayTimes.score || 0;
  if (now - last < COOLDOWN) return;
  audio.lastPlayTimes.score = now;

  const phase = typeof context.phase === 'number' ? context.phase : 0;
  const combo = Math.max(0, Math.min(context.combo || 0, 40));
  const multiplier = Math.max(1, Math.min(context.multiplier || 1, 6));
  const challengeActive = !!context.challengeActive;
  const slowActive = !!context.slowActive;
  const doubleScoreActive = !!context.doubleScoreActive;
  const nearMiss = !!context.nearMiss;
  const isDestroyed = !!context.isDestroyed;

  // Base loudness with gentle scaling from phase, combo and
  // multiplier. Keep it within a tight, pleasant range.
  let volume = 0.45;
  volume += 0.05 * phase;                 // later phases a bit brighter
  volume += combo * 0.004;                // up to +0.16 at high combo
  volume += (multiplier - 1) * 0.03;      // modest boost with speed
  if (doubleScoreActive) volume += 0.05;  // featured while DOUBLE is up
  if (challengeActive) volume += 0.08;    // surges feel extra hot
  if (nearMiss) volume += 0.12;           // reward close calls
  if (slowActive) volume -= 0.08;         // keep mix calmer in slow-mo
  if (isDestroyed) volume -= 0.15;        // softer for destroyed vs passed
  volume = Math.max(0.2, Math.min(1.0, volume));

  // Pitch: subtle climb with difficulty/precision, softer for
  // destroyed candles or slow-motion.
  let rate = 1.0;
  rate += 0.03 * phase;
  rate += (multiplier - 1) * 0.05;
  rate += combo * 0.003;                  // gentle rise with streaks
  if (doubleScoreActive) rate += 0.03;
  if (challengeActive) rate += 0.05;
  if (nearMiss) rate += 0.08;
  if (slowActive) rate -= 0.1;
  if (isDestroyed) rate -= 0.05;
  rate = Math.max(0.75, Math.min(1.35, rate));

  try {
    a.pause();
    a.currentTime = 0;
    a.volume = volume;
    a.playbackRate = rate;
    a.play().catch(() => {});
  } catch (e) {}
}

// Continuous thrust loop controller: keeps the engine sound
// running while the game is in-flight and adapts its
// loudness/pitch to effective speed (same value as the speed
// meter).
function updateThrustLoop(dt) {
  if (!audio.enabled || !audio.unlocked || !audio.thrustLoop) return;

  const a = audio.thrustLoop;
  const inFlight = game.started && !game.over && !game.paused;

  if (!inFlight) {
    if (!a.paused) {
      try {
        a.pause();
      } catch (e) {}
    }
    return;
  }

  // Ensure the loop is playing while in-flight.
  if (a.paused) {
    try {
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch (e) {}
  }

  // Unified thrust state (0–1) that already bakes in effective
  // forward speed, boost and difficulty spikes. This is also
  // what the rocket flame visuals use so audio and visuals
  // stay in lock-step.
  let thrustNorm = typeof game.thrustState === 'number' ? game.thrustState : 0;
  thrustNorm = Math.max(0, Math.min(1, thrustNorm));

  // Slight easing so mid-range feels fuller.
  const k = Math.pow(thrustNorm, 0.8);

  // Volume: a bit of engine at base speed, rising with thrust.
  a.volume = 0.35 + 0.55 * k;

  // Pitch: subtle rise with thrust so late-game feels more tense
  // without sounding cartoony.
  a.playbackRate = 0.9 + 0.25 * k;
}

// Movement-driven flap sound that varies volume and perceived
// length based on how sharp the vertical motion is.
function playFlapFromMovement(intensity) {
  if (!audio.enabled || !audio.unlocked) return;
  const a = audio.sfx.flap;
  if (!a) return;
  // Slight easing so the mid-range gets a bit more presence
  // and extremes still feel distinct.
  const k = Math.pow(Math.max(0, Math.min(1, intensity)), 0.8);
  try {
    a.pause();
    a.currentTime = 0;
    // Sharper movement => louder and slightly slower playback
    // so the flap feels longer and meatier. Gentle movement
    // keeps it quieter and snappier. Make the contrast strong
    // and raise the base volume so flaps sit clearly in the mix.
    a.volume = 0.45 + 0.55 * k;       // 0.45 -> 1.0
    a.playbackRate = 1.35 - 0.55 * k; // 1.35x -> 0.8x
    a.play().catch(() => {});
  } catch (e) {}
}

// HUD elements
const hud = {
  scoreFactor: document.getElementById('moonshot-hud-score'),
  highFactor: document.getElementById('moonshot-hud-high'),
  comboFactor: document.getElementById('moonshot-hud-combo'),
  score: document.getElementById('moonshot-score'),
  highScore: document.getElementById('moonshot-high-score'),
  combo: document.getElementById('moonshot-combo'),
  message: document.getElementById('moonshot-center-message'),
  powerups: document.getElementById('moonshot-powerups'),
  slowOverlay: document.getElementById('moonshot-slow-overlay'),
  panel: document.getElementById('moonshot-gameover-panel'),
  finalScore: document.getElementById('moonshot-final-score'),
  finalHighScore: document.getElementById('moonshot-final-high-score'),
  finalCombo: document.getElementById('moonshot-final-combo'),
  tutorial: document.getElementById('moonshot-tutorial'),
  speedMeter: document.getElementById('moonshot-speed-meter'),
  speedMeterValue: document.getElementById('moonshot-speed-value'),
  speedMeterFill: document.getElementById('moonshot-speed-bar-fill'),
  axisMode: null,
};

// UI helpers (trigger animations only on state changes)
let centerMessageTimerId = 0;
function setCenterMessage(text, ping = true, ttlMs = 2600) {
  if (!hud.message) return;
  const next = String(text || '');
  if (hud.message.textContent === next) return;

  // Hide the element entirely when empty so we never show an
  // "empty notification bubble".
  const hasText = next.trim() !== '';
  hud.message.textContent = next;
  hud.message.style.display = hasText ? '' : 'none';

  if (centerMessageTimerId) {
    window.clearTimeout(centerMessageTimerId);
    centerMessageTimerId = 0;
  }

  if (ping && hasText) {
    hud.message.classList.remove('ping');
    // Force reflow so the animation reliably restarts
    void hud.message.offsetWidth;
    hud.message.classList.add('ping');
  } else {
    hud.message.classList.remove('ping');
  }

  // Notifications only live briefly.
  const dur = Number(ttlMs);
  if (hasText && Number.isFinite(dur) && dur > 0) {
    centerMessageTimerId = window.setTimeout(() => {
      try {
        if (!hud.message) return;
        if (hud.message.textContent === next) {
          hud.message.textContent = '';
          hud.message.classList.remove('ping');
          hud.message.style.display = 'none';
        }
      } catch (e) {}
    }, dur);
  }
}

function setTutorialVisible(visible) {
  if (!hud.tutorial) return;
  hud.tutorial.classList.toggle('is-hidden', !visible);
}

function setGameoverPanelVisible(visible) {
  if (!hud.panel) return;
  hud.panel.classList.toggle('visible', !!visible);
}

const powerupChipEls = new Map();
const POWERUP_CHIP_STYLE = {
  GUN: { bg: 'rgba(250, 204, 21, 0.18)', border: '#facc15' },
  SLOW: { bg: 'rgba(34, 197, 94, 0.16)', border: '#22c55e' },
  DOUBLE: { bg: 'rgba(249, 115, 22, 0.16)', border: '#f97316' },
  MISSILE: { bg: 'rgba(239, 68, 68, 0.18)', border: '#ef4444' },
  INVINC: { bg: 'rgba(34, 211, 238, 0.18)', border: '#22d3ee' },
  WORMHOLE: { bg: 'rgba(34, 211, 238, 0.12)', border: '#22d3ee' },
};

function updatePowerupChips(activeLabels) {
  if (!hud.powerups) return;
  const container = hud.powerups;
  const next = new Set(activeLabels);

  // Hide the entire pill bar when it's empty (prevents the "empty bubble" look).
  if (hud.powerupsBar) {
    hud.powerupsBar.style.display = activeLabels.length ? '' : 'none';
  }

  // Remove chips that are no longer active (play exit animation)
  for (const [label, el] of powerupChipEls) {
    if (!next.has(label)) {
      powerupChipEls.delete(label);
      el.classList.add('leaving');
      window.setTimeout(() => {
        try {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        } catch (e) {}
      }, 180);
    }
  }

  // Add chips for newly active powerups
  let added = false;
  for (const label of activeLabels) {
    if (powerupChipEls.has(label)) continue;
    const chip = document.createElement('span');
    chip.className = 'moonshot-powerup-chip';
    chip.textContent = label;

    const style = POWERUP_CHIP_STYLE[label];
    if (style) {
      chip.style.background = style.bg;
      chip.style.borderColor = style.border;
    }

    powerupChipEls.set(label, chip);
    container.appendChild(chip);
    added = true;
  }

  if (added) {
    // Pulse the powerups bar shimmer only when powerups actually change.
    pulseUi(hud.powerupsBar, 820);
  }

  // Keep DOM order stable to match activeLabels
  for (const label of activeLabels) {
    const el = powerupChipEls.get(label);
    if (el) container.appendChild(el);
  }
}

function initThree() {
  const container = document.getElementById('moonshot-canvas-container');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);

  // Subtle atmospheric depth so the scene feels less flat.
  scene.fog = new THREE.FogExp2(0x020617, isMobile ? 0.010 : 0.012);

  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
  // Pull the camera back so the playfield feels more like
  // the zoom level of the original 2D game.
  camera.position.set(0, 0, 60);
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.0 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;
  // Color management + filmic response. This makes metals/glow feel
  // more premium and prevents harsh clipping on bright emissives.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = isMobile ? 1.02 : 1.08;
  container.appendChild(renderer.domElement);

  // Avoid scroll/zoom gestures fighting touch steering.
  try {
    renderer.domElement.style.touchAction = 'none';
  } catch (e) {}

  // Build procedural textures for rocket exhaust VFX once.
  buildRocketVfxTextures(THREE);

  // Intentionally hide the axis-mode HUD label (and any build tag).
  // The steering mode should not show extra text on-screen.
  if (hud.axisMode) {
    hud.axisMode.textContent = '';
    hud.axisMode.style.display = 'none';
  }

  // Initialize shared high score from 2D game storage so the
  // top HUD reflects the best score across modes.
  try {
    const storedHS = parseInt(localStorage.getItem('tappyRocketHighScore') || '0', 10) || 0;
    game.highScore = storedHS;
    if (hud.highScore) {
      hud.highScore.textContent = String(storedHS);
    }
  } catch (e) {}

  initPostprocessing();

  // Build premium wormhole once. Keep it in-scene but hidden;
  // wormhole pickups will reposition/show this single instance.
  // (No per-spawn shader compilation or geometry creation.)
  try {
    wormhole3D = new Wormhole3D(THREE, {
      quality: isMobile ? 'normal' : 'high',
      particleCount: isMobile ? 1100 : 1800,
      energyFlowSpeed: 2.35,
      groupRotationSpeed: 0.06,
      intensity: 0.95,
      tailStrength: 1.0,
      tailStartAngle: -Math.PI / 4,
      tailArcLength: 0.62,
    });
    wormhole3D.group.visible = false;
    wormhole3D.group.renderOrder = 90;
    scene.add(wormhole3D.group);
  } catch (e) {
    wormhole3D = null;
  }

  // Lighting: simple 3-point rig for clean readability.
  const ambient = new THREE.AmbientLight(0x0b1220, 0.55);
  scene.add(ambient);

  // Key light (upper-left/front)
  const dir = new THREE.DirectionalLight(0xffffff, 1.05);
  dir.position.set(-25, 30, 18);
  scene.add(dir);

  // Fill light (lower-right) to keep shadows from going muddy.
  const fill = new THREE.DirectionalLight(0x93c5fd, 0.28);
  fill.position.set(22, -10, 22);
  scene.add(fill);

  // Rim light (behind) for edge separation.
  const rim = new THREE.DirectionalLight(0x22d3ee, 0.22);
  rim.position.set(15, 8, -30);
  scene.add(rim);

  // Subtle engine light near the exhaust.
  const engineLight = new THREE.PointLight(0x38bdf8, 1.25, 60);
  engineLight.position.set(-4, 0, 0);
  scene.add(engineLight);

  // Rocket (sleeker two-tone body inspired by reference)
  const rocketGroup = new THREE.Group();

  // Main fuselage (dark gunmetal cylinder, slightly longer and slimmer)
  // Add subtle taper + more radial segments for a cleaner silhouette.
  // NOTE: CylinderGeometry axis is Y; after rotation below, +Y maps to -X.
  // So radiusTop becomes the tail radius, radiusBottom becomes the nose radius.
  const fuselageGeo = new THREE.CylinderGeometry(1.65, 1.55, 6.9, 44);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b, // dark gunmetal, less black/blue
    metalness: 0.92,
    roughness: 0.34,
    clearcoat: 0.65,
    clearcoatRoughness: 0.22,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
  });
  const fuselage = new THREE.Mesh(fuselageGeo, bodyMat);
  fuselage.rotation.z = Math.PI / 2;
  fuselage.castShadow = false;
  fuselage.receiveShadow = false;
  rocketGroup.add(fuselage);

  // Static bluish underside accent strip (no tap animation)
  const underStripGeo = new THREE.BoxGeometry(5.4, 0.12, 0.12);
  const underStripMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a, // very dark blue-toned
    metalness: 0.5,
    roughness: 0.5,
  });
  const underStrip = new THREE.Mesh(underStripGeo, underStripMat);
  underStrip.position.set(0.1, -0.98, 0);
  rocketGroup.add(underStrip);

  // Subtle accent details on the fuselage
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.85,
    roughness: 0.35,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.18,
  });

  // Twin side stripes along the body
  const stripeGeo = new THREE.BoxGeometry(5.2, 0.14, 0.08);
  const stripeUpper = new THREE.Mesh(stripeGeo, accentMat);
  stripeUpper.position.set(0.2, 0.95, 0.95);
  rocketGroup.add(stripeUpper);
  const stripeLower = stripeUpper.clone();
  stripeLower.position.y = -0.95;
  rocketGroup.add(stripeLower);

  // Tiny ceramic white panels on the mid-body for extra detail
  const ceramicPanelMat = new THREE.MeshStandardMaterial({
    color: 0xf9fafb,
    metalness: 0.4,
    roughness: 0.7,
  });
  const ceramicPanelGeo = new THREE.BoxGeometry(0.9, 0.22, 0.06);
  const panelY = 0.55;
  const panelZ = 1.4;
  const panelOffsetsX = [-0.6, 0.9];
  for (let i = 0; i < panelOffsetsX.length; i++) {
    const p = new THREE.Mesh(ceramicPanelGeo, ceramicPanelMat);
    p.position.set(panelOffsetsX[i], panelY, panelZ);
    rocketGroup.add(p);
    const pMirror = p.clone();
    pMirror.position.z = -panelZ;
    rocketGroup.add(pMirror);
  }

  // Small lengthwise panel grooves on the gunmetal body
  const grooveMat = new THREE.MeshStandardMaterial({
    color: 0x020617,
    metalness: 0.4,
    roughness: 0.4,
  });
  const grooveGeo = new THREE.BoxGeometry(4.8, 0.05, 0.06);
  const grooveY = [0.38, -0.38];
  const grooveZ = [1.32, -1.32];
  for (let gy = 0; gy < grooveY.length; gy++) {
    for (let gz = 0; gz < grooveZ.length; gz++) {
      const g = new THREE.Mesh(grooveGeo, grooveMat);
      g.position.set(-0.1, grooveY[gy], grooveZ[gz]);
      rocketGroup.add(g);
    }
  }

  // Small recessed vents on the underside of the fuselage
  const ventMat = new THREE.MeshStandardMaterial({
    color: 0x020617,
    metalness: 0.5,
    roughness: 0.55,
  });
  const ventGeo = new THREE.BoxGeometry(0.9, 0.16, 0.08);
  const ventOffsetsX = [-1.4, 0.0, 1.4];
  for (let i = 0; i < ventOffsetsX.length; i++) {
    const v = new THREE.Mesh(ventGeo, ventMat);
    v.position.set(ventOffsetsX[i], -0.95, 0);
    rocketGroup.add(v);
  }

  // Small porthole windows on one side
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.7,
    roughness: 0.3,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.35,
  });
  const windowGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.12, 20);
  const windowOffsets = [1.6, 0.2, -1.2];
  for (let i = 0; i < windowOffsets.length; i++) {
    const w = new THREE.Mesh(windowGeo, windowMat);
    w.rotation.x = Math.PI / 2; // face toward camera (+Z)
    w.position.set(windowOffsets[i], 0.2, 1.72);
    rocketGroup.add(w);
  }

  // Light nose collar
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0xf9fafb,
    metalness: 0.5,
    roughness: 0.6,
  });
  const noseCollarGeo = new THREE.CylinderGeometry(1.8, 1.8, 1.0, 24);
  const noseCollar = new THREE.Mesh(noseCollarGeo, collarMat);
  noseCollar.rotation.z = Math.PI / 2;
  noseCollar.position.x = 3.1;
  rocketGroup.add(noseCollar);

  // Ridged detailing on nose collar
  const ridgeGeo = new THREE.TorusGeometry(1.9, 0.05, 8, 36, Math.PI * 1.15);
  const ridgeMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    metalness: 0.8,
    roughness: 0.4,
  });
  const ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
  ridge.rotation.y = Math.PI / 2;
  ridge.position.set(3.1, 0, 0);
  rocketGroup.add(ridge);

  // Small abstract logo plate on one side of the collar
  const logoGeo = new THREE.BoxGeometry(0.7, 0.32, 0.04);
  const logoMat = new THREE.MeshStandardMaterial({
    color: 0x020617,
    metalness: 0.6,
    roughness: 0.35,
  });
  const logoPlate = new THREE.Mesh(logoGeo, logoMat);
  logoPlate.position.set(3.1, -0.25, 1.7);
  rocketGroup.add(logoPlate);

  // Tiny ceramic bolts around the nose collar
  const boltMat = new THREE.MeshStandardMaterial({
    color: 0xf9fafb,
    metalness: 0.3,
    roughness: 0.7,
  });
  const boltGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const boltAngles = [Math.PI * 0.22, Math.PI * 0.55, Math.PI * 0.88];
  for (let i = 0; i < boltAngles.length; i++) {
    const angle = boltAngles[i];
    const b = new THREE.Mesh(boltGeo, boltMat);
    const r = 1.8;
    b.position.set(3.1, Math.cos(angle) * r * 0.18, Math.sin(angle) * r * 0.48);
    rocketGroup.add(b);
  }

  // Simple antenna on top near the nose
  const antennaStemGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.45, 12);
  const antennaStemMat = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    metalness: 0.8,
    roughness: 0.35,
  });
  const antennaStem = new THREE.Mesh(antennaStemGeo, antennaStemMat);
  antennaStem.position.set(2.7, 1.6, 0);
  rocketGroup.add(antennaStem);

  const antennaTipGeo = new THREE.SphereGeometry(0.18, 10, 10);
  const antennaTipMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.9,
    roughness: 0.25,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.4,
  });
  const antennaTip = new THREE.Mesh(antennaTipGeo, antennaTipMat);
  antennaTip.position.set(2.7, 2.35, 0);
  rocketGroup.add(antennaTip);

  // Nose cone (shorter than the reference but similar style)
  const coneGeo = new THREE.ConeGeometry(1.6, 2.6, 24);
  const coneMat = new THREE.MeshPhysicalMaterial({
    color: 0xf9fafb,
    metalness: 0.6,
    roughness: 0.5,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.3,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.set(4.4, 0, 0);
  cone.rotation.z = -Math.PI / 2;
  rocketGroup.add(cone);

  // Nose cone engraved panel lines and vents
  const noseLineMat = new THREE.MeshStandardMaterial({
    color: 0xd4d4d8,
    metalness: 0.5,
    roughness: 0.7,
  });
  const noseRingGeo = new THREE.TorusGeometry(1.05, 0.03, 8, 28);
  const noseRing = new THREE.Mesh(noseRingGeo, noseLineMat);
  noseRing.rotation.y = Math.PI / 2;
  noseRing.position.set(4.1, 0, 0);
  rocketGroup.add(noseRing);

  const noseSeamGeo = new THREE.BoxGeometry(0.06, 1.6, 0.05);
  const noseSeam = new THREE.Mesh(noseSeamGeo, noseLineMat);
  noseSeam.position.set(4.25, 0, 0.9);
  rocketGroup.add(noseSeam);

  // Small nose vents near the base of the cone
  const noseVentMat = new THREE.MeshStandardMaterial({
    color: 0x020617,
    metalness: 0.4,
    roughness: 0.6,
  });
  const noseVentGeo = new THREE.BoxGeometry(0.38, 0.12, 0.06);
  const noseVent = new THREE.Mesh(noseVentGeo, noseVentMat);
  noseVent.position.set(3.8, -0.35, 1.05);
  rocketGroup.add(noseVent);
  const noseVent2 = noseVent.clone();
  noseVent2.position.y = 0.35;
  rocketGroup.add(noseVent2);

  // Tail collar to echo the light nose band
  const tailCollarGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.9, 24);
  const tailCollar = new THREE.Mesh(tailCollarGeo, collarMat);
  tailCollar.rotation.z = Math.PI / 2;
  tailCollar.position.x = -3.1;
  rocketGroup.add(tailCollar);

  // Tiny rear attitude thrusters, tucked into the tail collar
  const rcsGeo = new THREE.ConeGeometry(0.32, 0.65, 14);
  const rcsMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.9,
    roughness: 0.25,
  });
  const rcsTop = new THREE.Mesh(rcsGeo, rcsMat);
  rcsTop.rotation.z = Math.PI; // point outward in -Y
  rcsTop.position.set(-3.1, 1.35, 0);
  rocketGroup.add(rcsTop);
  const rcsBottom = rcsTop.clone();
  rcsBottom.rotation.z = 0; // +Y
  rcsBottom.position.y = -1.35;
  rocketGroup.add(rcsBottom);

  const rcsLeft = new THREE.Mesh(rcsGeo, rcsMat);
  rcsLeft.rotation.x = -Math.PI / 2; // point -Z
  rcsLeft.position.set(-3.1, 0, 1.45);
  rocketGroup.add(rcsLeft);
  const rcsRight = rcsLeft.clone();
  rcsRight.rotation.x = Math.PI / 2; // +Z
  rcsRight.position.z = -1.45;
  rocketGroup.add(rcsRight);

  // Compact three-fin tail cluster integrated into the white tail section
  const finGeo = new THREE.BoxGeometry(0.5, 2.0, 0.3);
  const finMat = new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.8, roughness: 0.22 });

  // Bottom fin
  const finBottom = new THREE.Mesh(finGeo, finMat);
  finBottom.position.set(-3.0, -1.6, 0);
  finBottom.rotation.z = -Math.PI / 7; // stronger sweep, slightly further back
  rocketGroup.add(finBottom);

  // Upper-left and upper-right fins
  const finUpperLeft = new THREE.Mesh(finGeo, finMat);
  finUpperLeft.position.set(-3.0, 1.05, 1.15);
  finUpperLeft.rotation.z = Math.PI / 7;
  rocketGroup.add(finUpperLeft);

  const finUpperRight = finUpperLeft.clone();
  finUpperRight.position.z = -1.25;
  rocketGroup.add(finUpperRight);

  // Dark slotted cut-outs on fins
  const finSlotGeo = new THREE.BoxGeometry(0.08, 0.9, 0.12);
  const finSlotMat = new THREE.MeshStandardMaterial({
    color: 0x020617,
    metalness: 0.3,
    roughness: 0.55,
  });

  function addFinSlots(finMesh) {
    const offsetsY = [-0.45, 0.45];
    for (let i = 0; i < offsetsY.length; i++) {
      const slot = new THREE.Mesh(finSlotGeo, finSlotMat);
      slot.position.set(0.18, offsetsY[i], 0);
      finMesh.add(slot);
    }
  }

  addFinSlots(finBottom);
  addFinSlots(finUpperLeft);
  addFinSlots(finUpperRight);

  // Engine nozzle and flame positioned at the rear
  const nozzleGeo = new THREE.CylinderGeometry(1.3, 1.8, 0.9, 18);
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x020617,
    metalness: 0.9,
    roughness: 0.15,
  });
  const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(-3.8, 0, 0);
  rocketGroup.add(nozzle);

  // Nozzle incandescence insert: subtle hot inner ring that ramps with thrust.
  const nozzleHeatGeo = new THREE.CylinderGeometry(1.08, 1.42, 0.66, 22, 1, true);
  const nozzleHeatMat = new THREE.MeshBasicMaterial({
    color: 0xffb703,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  nozzleHeatMat.toneMapped = false;
  const nozzleHeat = new THREE.Mesh(nozzleHeatGeo, nozzleHeatMat);
  nozzleHeat.rotation.z = Math.PI / 2;
  nozzleHeat.position.set(-3.82, 0, 0);
  rocketGroup.add(nozzleHeat);

  const flameGeo = new THREE.ConeGeometry(1.5, 5.0, 16);
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xf97316,
    emissiveIntensity: 0.35,
    metalness: 0.1,
    roughness: 0.4,
    transparent: true,
    opacity: 0.7,
  });
  flameMat.depthWrite = false;
  flameMat.toneMapped = false;
  const flame = new THREE.Mesh(flameGeo, flameMat);
  // Base position for the main flame; front edge should sit
  // just at the rear nozzle when length scale is 1.
  flame.position.set(-6.3, 0, 0);
  flame.rotation.z = Math.PI / 2;
  rocketGroup.add(flame);

  const flameCoreGeo = new THREE.ConeGeometry(0.9, 3.2, 16);
  const flameCoreMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  flameCoreMat.toneMapped = false;
  const flameCore = new THREE.Mesh(flameCoreGeo, flameCoreMat);
  flameCore.position.set(-5.4, 0, 0.02);
  flameCore.rotation.z = Math.PI / 2;
  rocketGroup.add(flameCore);

  // Soft outer glow halo around the main flame
  const flameGlowGeo = new THREE.ConeGeometry(2.0, 6.2, 16);
  const flameGlowMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  flameGlowMat.toneMapped = false;
  const flameGlow = new THREE.Mesh(flameGlowGeo, flameGlowMat);
  flameGlow.position.set(-6.9, 0, 0);
  flameGlow.rotation.z = Math.PI / 2;
  rocketGroup.add(flameGlow);

  // Simple inner shock band inside the core for high-speed runs
  const flameKnotGeo = new THREE.ConeGeometry(0.7, 1.6, 12);
  const flameKnotMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.175,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  flameKnotMat.toneMapped = false;
  const flameKnot = new THREE.Mesh(flameKnotGeo, flameKnotMat);
  flameKnot.position.set(-4.6, 0, 0.03);
  flameKnot.rotation.z = Math.PI / 2;
  flameKnot.visible = false;
  rocketGroup.add(flameKnot);

  // Billboarded flame sprite: adds high-quality soft volume without heavy geometry.
  const flameSpriteGeo = new THREE.PlaneGeometry(6.0, 6.0);
  const flameSpriteMat = new THREE.MeshBasicMaterial({
    map: rocketFlameSpriteTex || null,
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  flameSpriteMat.toneMapped = false;
  const flameSprite = new THREE.Mesh(flameSpriteGeo, flameSpriteMat);
  flameSprite.position.set(-5.9, 0, 0);
  flameSprite.renderOrder = 80;
  rocketGroup.add(flameSprite);

  // Cockpit glow sphere near the transition from body to nose
  const cockpitGeo = new THREE.SphereGeometry(0.9, 18, 18);
  const cockpitMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.4,
    metalness: 0.5,
    roughness: 0.15,
    transparent: true,
    opacity: 0.9,
  });
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
  cockpit.position.set(2.6, 0.25, 0.7);
  rocketGroup.add(cockpit);

  // Glass canopy over cockpit glow (visual-only upgrade).
  const canopyGeo = new THREE.SphereGeometry(0.98, 20, 20);
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    metalness: 0.0,
    roughness: 0.06,
    transmission: 1.0,
    thickness: 0.55,
    ior: 1.35,
    transparent: true,
    opacity: 0.35,
    clearcoat: 0.15,
    clearcoatRoughness: 0.2,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.copy(cockpit.position);
  canopy.scale.set(1.0, 0.78, 1.05);
  rocketGroup.add(canopy);

  // Small key light near the rocket nose so bullets and the
  // front of the fuselage catch crisp metallic highlights.
  const noseLight = new THREE.PointLight(0xffffff, 0.8, 38);
  noseLight.position.set(3.5, 1.2, 3.5);
  rocketGroup.add(noseLight);

  // Full spherical shield used during strong powerups (invincibility,
  // slow, Cece). Inner sphere is slightly denser, outer sphere is a
  // softer halo to keep the rocket visible while still feeling wrapped.
  const shieldGeo = new THREE.SphereGeometry(3.2, 32, 24);
  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.375,
    metalness: 0.3,
    roughness: 0.08,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const shield = new THREE.Mesh(shieldGeo, shieldMat);
  shield.visible = false;
  rocketGroup.add(shield);

  const shieldOuterGeo = new THREE.SphereGeometry(3.6, 32, 24);
  const shieldOuterMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x7dd3fc,
    emissiveIntensity: 0.35,
    metalness: 0.25,
    roughness: 0.12,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const shieldOuter = new THREE.Mesh(shieldOuterGeo, shieldOuterMat);
  shieldOuter.visible = false;
  rocketGroup.add(shieldOuter);

  // In-world hourglass indicator used when SLOW is active. This is
  // a smaller version of the pickup model that floats near the
  // rocket so the slow-time state is readable even if the DOM
  // overlay is subtle or off-screen.
  const slowIndicator = createHourglassMesh(true);
  slowIndicator.scale.setScalar(0.55);
  slowIndicator.position.set(0, 3.6, 0);
  slowIndicator.visible = false;
  rocketGroup.add(slowIndicator);

  rocketGroup.position.set(-10, 0, 0);
  scene.add(rocketGroup);

  rocket = {
    group: rocketGroup,
    engineLight,
    bodyMat,
    coneMat,
    flame,
    flameCore,
    flameGlow,
    flameKnot,
    nozzle,
    nozzleHeat,
    flameSprite,
    flameBaseX: -6.3,
    flameCoreBaseX: -5.4,
    flameGlowBaseX: -6.9,
    flameKnotBaseX: -4.6,
    flameSpriteBaseX: -5.9,
    cockpit,
    shield,
    shieldOuter,
    slowIndicator,
  };

  // Double-score orbiting orbs will be attached to the rocket group
  // and managed at runtime; we only need the parent reference here.

  // Starfield background: three world-space layers scattered
  // through a large 3D volume so the rocket physically flies
  // past them as the world scrolls.
  function createStarLayer(count, size, ySpan, zMin, zMax, colorHex) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Scatter stars in a large cylindrical/spherical-ish
      // volume whose extents match the per-layer update bounds
      // so initial spawn and wrap-around stay consistent.
      const xSpan = 1600;
      const radiusY = ySpan * 0.5;
      const radiusZ = (zMax - zMin) * 0.5;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()); // denser toward centre
      const y = Math.sin(angle) * r * radiusY;
      const zCenter = (zMin + zMax) * 0.5;
      const z = zCenter + Math.cos(angle) * r * radiusZ;

      positions[i * 3 + 0] = (Math.random() - 0.3) * xSpan; // favour stars ahead but very extended
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    const mat = new THREE.PointsMaterial({
      color: colorHex,
      size,
      sizeAttenuation: true,
      transparent: true,
      // Keep starfield readability under ACES + fog by opting out of both.
      // (This restores the pre-tonemapping perceived brightness.)
      toneMapped: false,
      fog: false,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    return points;
  }

  const baseCount = isMobile ? 320 : 800;
  // Near layer: around the lane, very close to rocket/pipes.
  // Use the same Y/Z spans as the update function so density
  // and depth feel stable from the first frame.
  starsNear = createStarLayer(Math.floor(baseCount * 0.4), 0.34, 480, -220, 220, 0x93c5fd);
  // Mid layer: slightly wider band around the lane.
  starsMid = createStarLayer(Math.floor(baseCount * 0.4), 0.28, 560, -320, 320, 0x60a5fa);
  // Far layer: widest band, still roughly centered on the lane.
  starsFar = createStarLayer(Math.floor(baseCount * 0.4), 0.24, 640, -420, 420, 0x38bdf8);

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Also attach to document as a fallback in case focus or
  // event-target quirks prevent window from receiving keys.
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Desktop-only mouse steering and boost hooks. Prefer attaching
  // whenever we have a fine pointer (mouse/trackpad), even if the
  // UA string looks "mobile" in some embedded environments.
  const hasFinePointer = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: fine)').matches;

  if (((hasFinePointer && !__moonshotForceMobile) || !isMobile) && renderer && renderer.domElement) {
    const canvas = renderer.domElement;
    canvas.addEventListener('mousemove', onCanvasMouseMove);
    canvas.addEventListener('mousedown', onCanvasMouseDown);
    canvas.addEventListener('mouseup', onCanvasMouseUp);
    canvas.addEventListener('mouseleave', onCanvasMouseUp);
  }

  // Mobile: drag anywhere on the canvas to steer (same model as desktop).
  if (isMobile && renderer && renderer.domElement) {
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onCanvasPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onCanvasPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onCanvasPointerUp, { passive: false });
    canvas.addEventListener('pointercancel', onCanvasPointerUp, { passive: false });
  }

  // Mobile thrust button (present in index.html). Safe no-op if missing.
  bindThrustButton();

  // Tutorial visibility:
  // Keep the tutorial as part of the game start flow (shows on load,
  // dismisses on first interaction). This avoids a "flash then hide"
  // when localStorage already has the seen flag.
  try {
    const params = new URLSearchParams((typeof window !== 'undefined' && window.location)
      ? (window.location.search || '')
      : '');
    const resetTutorial = params.get('resetTutorial') === '1' || params.get('tutorial') === 'reset';
    if (resetTutorial) {
      localStorage.removeItem('moonshotTutorialSeen');
    }
    setTutorialVisible(true);
  } catch (e) {}

  // Dev helper: allows calling from console.
  // window.moonshotResetTutorial(); window.moonshotShowTutorial();
  try {
    window.moonshotResetTutorial = () => {
      try { localStorage.removeItem('moonshotTutorialSeen'); } catch (e) {}
      setTutorialVisible(true);
    };
    window.moonshotShowTutorial = () => {
      setTutorialVisible(true);
    };
  } catch (e) {}

  // (Intentionally no axis-mode UI toggle.)
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  if (renderTarget) {
    const pixelRatio = renderer.getPixelRatio();
    const width = Math.floor(window.innerWidth * pixelRatio * __moonshotPostScale);
    const height = Math.floor(window.innerHeight * pixelRatio * __moonshotPostScale);
    renderTarget.setSize(width, height);
  }
}

// (No manual axis-mode toggle; wormholes handle view flips.)

function onKeyDown(e) {
  if (__moonshotDebug) console.log('[Moonshot] keydown', e.code);
  // Ignore auto-repeat so holding a key (especially H) doesn't
  // cause multiple toggles and land back where we started.
  if (e.repeat) return;
  if (e.code === 'Space') {
    e.preventDefault();
    // Space acts as a boost modifier (desktop parity). For forced-mobile
    // desktop testing, this is still useful.
    startRunIfNeeded();
    boostHeld = true;
    return;
  }

  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    togglePause();
    return;
  }

  // Intentionally no KeyH axis-mode toggle.
}

function onKeyUp(e) {
  if (e.code === 'Space') {
    boostHeld = false;
  }
}

function setSteeringFromClientXY(clientX, clientY) {
  if (!renderer || !renderer.domElement) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const h = rect.height || 1;
  const w = rect.width || 1;
  let normY = 1 - (y / h); // 0 bottom, 1 top
  let normX = x / w;       // 0 left, 1 right
  if (!Number.isFinite(normY)) normY = 0.5;
  if (!Number.isFinite(normX)) normX = 0.5;
  mouseYNorm = Math.max(0, Math.min(1, normY));
  mouseXNorm = Math.max(0, Math.min(1, normX));

  const bandY = MOUSE_TARGET_Y_MAX - MOUSE_TARGET_Y_MIN;
  const blend = (typeof game.axisBlend === 'number')
    ? game.axisBlend
    : (game.axisMode === 'horizontal' ? 1 : 0);
  const steeringNorm = (1 - blend) * mouseYNorm + blend * mouseXNorm;
  game.targetY = MOUSE_TARGET_Y_MIN + steeringNorm * bandY;

  // Match desktop behavior: steering motion can drive flap-like SFX intensity.
  if (game.started && !game.over) {
    maybeInitAudio();
    const activeNorm = steeringNorm;
    const prev = (typeof game.lastMouseYNormForFlap === 'number')
      ? game.lastMouseYNormForFlap
      : activeNorm;
    const delta = Math.abs(activeNorm - prev);
    game.lastMouseYNormForFlap = activeNorm;
    if (delta > 0.002) {
      const now = performance.now() * 0.001;
      const minInterval = 0.03;
      if (now - (game.lastFlapSfxTime || 0) >= minInterval) {
        game.lastFlapSfxTime = now;
        let intensity = Math.max(0, Math.min(1, delta * 9.0));
        intensity = Math.pow(intensity, 0.65);
        playFlapFromMovement(intensity);
      }
    }
  }
}

function onCanvasPointerDown(e) {
  if (!isMobile) return;
  if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
  e.preventDefault();
  dismissTutorial();
  startRunIfNeeded();
  __steerPointerId = e.pointerId;
  try {
    if (renderer && renderer.domElement) renderer.domElement.setPointerCapture(e.pointerId);
  } catch (err) {}
  setSteeringFromClientXY(e.clientX, e.clientY);
}

function onCanvasPointerMove(e) {
  if (__steerPointerId == null || e.pointerId !== __steerPointerId) return;
  e.preventDefault();
  setSteeringFromClientXY(e.clientX, e.clientY);
}

function onCanvasPointerUp(e) {
  if (__steerPointerId == null || e.pointerId !== __steerPointerId) return;
  e.preventDefault();
  try {
    if (renderer && renderer.domElement) renderer.domElement.releasePointerCapture(e.pointerId);
  } catch (err) {}
  __steerPointerId = null;
}

function onCanvasMouseMove(e) {
  setSteeringFromClientXY(e.clientX, e.clientY);
}

function onCanvasMouseDown(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  if (isMobile) return;
  startRunIfNeeded();
  boostHeld = true;
}

function onCanvasMouseUp(e) {
  if (e && e.button !== undefined && e.button !== 0) return;
  boostHeld = false;
}

function bindThrustButton() {
  try {
    const btn = document.getElementById('moonshot-thrust-btn');
    if (!btn) return;

    const setHeld = (held) => {
      boostHeld = !!held;
      if (btn) btn.classList.toggle('is-held', boostHeld);
    };

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startRunIfNeeded();
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      setHeld(true);
    }, { passive: false });

    const end = (e) => {
      if (e) {
        try { btn.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      setHeld(false);
    };
    btn.addEventListener('pointerup', end, { passive: true });
    btn.addEventListener('pointercancel', end, { passive: true });
    btn.addEventListener('pointerleave', end, { passive: true });
  } catch (e) {}
}

function flap() {
  maybeInitAudio();
  dismissTutorial();

  if (__EMBEDDED && !__RUN.active) {
    __RUN.pendingFlap = true;
    requestArcadeRun();
    return;
  }
  // Allow tap/space to restart after a failed run, mirroring the
  // on-screen hint in the summary panel.
  if (game.over) {
    startGame();
  }
  if (!game.started) {
    startGame();
  }
  game.vy = FLAP_STRENGTH;
  game.flapBoost = 1.0;
  // Strongest flap sound when an explicit flap input occurs;
  // ongoing vertical movement will also drive flap.mp3 via
  // the dynamic movement-based SFX logic.
  playFlapFromMovement(1.0);
}

function startRunIfNeeded() {
  maybeInitAudio();
  dismissTutorial();

  if (__EMBEDDED && !__RUN.active) {
    __RUN.pendingFlap = true;
    requestArcadeRun();
    return;
  }
  if (game.over) {
    startGame();
  }
  if (!game.started) {
    startGame();
  }
}

function dismissTutorial() {
  if (hud.tutorial && !hud.tutorial.classList.contains('is-hidden')) {
    setTutorialVisible(false);
    try {
      localStorage.setItem('moonshotTutorialSeen', '1');
    } catch (e) {}
  }
}

function togglePause() {
  // Only pause/resume active runs
  if (!game.started || game.over) return;
  game.paused = !game.paused;
  // Pause text should stay until unpaused.
  setCenterMessage(game.paused ? 'Paused - press P or Esc to resume' : '', false, game.paused ? 0 : 0);
}

function startGame() {
  game.started = true;
  game.over = false;
  game.paused = false;
  game.score = 0;
  game.redCandlesPassed = 0;
  game.combo = 1;
  game.bestCombo = 1;
  game.multiplier = 1;
  game.slowPermanentMultiplier = 1;
  game.flapBoost = 0;
  game.nearMissFlash = 0;
  game.nearMissMsgTimer = 0;
  game.pipesSpawned = 0;
  game.lastGapCenter = 0;
  game.challengeActive = false;
  game.challengeTimer = 0;
  game.nextChallengeAt = 10;
  game.milestoneCandles10 = false;
  game.milestoneCandles25 = false;
  game.milestoneCandles40 = false;
  game.milestoneCombo10 = false;
  game.milestoneCombo20 = false;
  game.y = 0;
  game.vy = 0;
  game.gapVelY = 0;
  game.speed = BASE_SPEED;
  game.timeSinceLastPipe = 0;
   game.powerupCooldownTimer = 0;
   game.gunTimer = 0;
   game.slowTimer = 0;
   game.doubleTimer = 0;
  game.ceceTimer = 0;
  game.invTimer = 0;
  game.slowActive = false;
  game.doubleScoreActive = false;
  game.ceceActive = false;
  game.invincible = false;
   stopShieldLoop();
  game.slowVisual = 0;
  game.slowWaveTimer = 0;
  // Clear any lingering visual artifacts from prior runs
  for (let i = game.slowWaves.length - 1; i >= 0; i--) {
    if (game.slowWaves[i].mesh) {
      scene.remove(game.slowWaves[i].mesh);
    }
  }
  game.slowWaves.length = 0;
  for (let i = game.doubleOrbs.length - 1; i >= 0; i--) {
    if (rocket && rocket.group && game.doubleOrbs[i]) {
      rocket.group.remove(game.doubleOrbs[i]);
    }
  }
  game.doubleOrbs.length = 0;
   clearPowerups();
   clearBullets();
  clearPipes();
  clearRocketTrails();
  setCenterMessage('', false);
  setGameoverPanelVisible(false);

  // Pre-spawn a short runway of pipes ahead so gaps are
  // clearly visible in the distance from the start.
  const runwayOffsets = [70, 110, 150];
  for (let i = 0; i < runwayOffsets.length; i++) {
    const pipe = spawnPipePair();
    if (pipe && pipe.top && pipe.bottom) {
      pipe.top.position.x = runwayOffsets[i];
      pipe.bottom.position.x = runwayOffsets[i];
    }
  }
}

function gameOver() {
  if (game.over) return;
  game.over = true;
  // Stronger camera shake on failure
  triggerCameraShake(0.7, 0.4);
  setCenterMessage('Moonshot failed. Tap / Space to try again', true);
  playSfx('explosion', 0.9);

   if (hud.panel) {
     if (hud.finalScore) hud.finalScore.textContent = String(game.score);
     if (hud.finalHighScore) hud.finalHighScore.textContent = String(game.highScore);
     if (hud.finalCombo) hud.finalCombo.textContent = 'x' + game.bestCombo;
       setGameoverPanelVisible(true);
   }

   // Update shared local metrics so the dashboard "My Stats"
   // section can reflect Moonshot runs as well.
   try {
     var storedGames = parseInt(localStorage.getItem('tappyRocketGamesPlayed') || '0', 10) || 0;
     storedGames += 1;
     localStorage.setItem('tappyRocketGamesPlayed', String(storedGames));

     var storedHS = parseInt(localStorage.getItem('tappyRocketHighScore') || '0', 10) || 0;
     if (game.score > storedHS) {
       storedHS = game.score;
       localStorage.setItem('tappyRocketHighScore', String(storedHS));
     }
     game.highScore = Math.max(game.highScore, storedHS);
   } catch (e) {}

   // Notify parent dashboard (if embedded) about run summary.
   // Disabled by default for a clean offline/static build; enable with ?api=1.
   if (__EMBEDDED && __RUN.runId) {
    const durationMs = Math.max(0, Math.floor(performance.now() - (__RUN.startMs || performance.now())));
    __ARCADE.post('ARCADE:RUN_RESULT', {
      gameId: 'moonshot',
      runId: __RUN.runId,
      durationMs,
      metrics: {
        score: Number(game.score || 0),
        durationMs,
        waves: 0,
        comboMax: Number(game.bestCombo || 0)
      },
      metricId: 'score',
      metricValue: Number(game.score || 0)
    });
  } else {
    if (window.MoonshotWalletState?.address) submitMoonshotScore(window.MoonshotWalletState.address, game.score);
  }

  // Reset run state after a finished run (next run requires a fresh grant)
  __RUN.active = false;
  __RUN.runId = '';
  __RUN.startMs = 0;
  __RUN.pendingFlap = false;
  __RUN.pendingStart = false;

  minGap = Math.max(minGap, minSafeGap);
  const gapSize = minGap + Math.random() * Math.max(0.1, (maxGap - minGap));

  // Choose any position along world Y where the full gap still fits
  // inside the vertical band.
  const halfGap = gapSize / 2;
  const centerMin = GAP_BAND_MIN_Y + halfGap;
  const centerMax = GAP_BAND_MAX_Y - halfGap;

  // Use a smoothed vertical trajectory for the gap so the safe
  // path meanders in arcs instead of jumping randomly each time.
  const prevCenter = (typeof game.lastGapCenter === 'number' && game.lastGapCenter !== 0)
    ? game.lastGapCenter
    : (centerMin + centerMax) * 0.5;
  const gapCenter = computeGapCenter(prevCenter, centerMin, centerMax, phase);

  // Make candles much taller vertically so they feel like
  // towering red columns in space, with a little random
  // variation so the field doesn't feel copy-pasted.
  const baseHeight = 160;
  const heightJitter = 0.12; // up to ±12%
  const topHeight = baseHeight * (1 - heightJitter + Math.random() * (2 * heightJitter));
  const bottomHeight = baseHeight * (1 - heightJitter + Math.random() * (2 * heightJitter));

  initCandleResources();

  // Helper to build a richer red candle column: bright inner
  // core, darker outer spine casing, segmented outer frames and
  // reactor mouth + halo at the gap edge.
  function createCandleColumn(height, isTop) {
    const group = new THREE.Group();

    // Per-column material clones so jitter/flicker can be truly per-candle.
    const matJitter = Math.random();
    const coreMat = candleCoreMaterial.clone();
    const shellMat = candleShellMaterial.clone();
    const ribMat = candleRibMaterial.clone();

    // Subtle variance so columns don't look copy-pasted.
    coreMat.roughness = THREE.MathUtils.clamp(coreMat.roughness + (matJitter - 0.5) * 0.10, 0.10, 0.6);
    shellMat.roughness = THREE.MathUtils.clamp(shellMat.roughness + (matJitter - 0.5) * 0.14, 0.18, 0.8);
    ribMat.roughness = THREE.MathUtils.clamp(ribMat.roughness + (matJitter - 0.5) * 0.10, 0.12, 0.8);

    const core = new THREE.Mesh(candleCoreGeometry, coreMat);
    core.scale.y = height / baseHeight;
    core.scale.x = 0.7;
    core.scale.z = 0.7;
    group.add(core);

    const shell = new THREE.Mesh(candleShellGeometry, shellMat);
    shell.scale.y = height / baseHeight;
    shell.scale.x = 0.96;
    shell.scale.z = 0.96;
    group.add(shell);

    // Segmented reactor frames: each "ring" is built from a
    // simple cross of bars so we keep the tri count modest but
    // still get a strong layered silhouette.
    const ribs = [];
    const frameCount = 4;
    for (let i = 0; i < frameCount; i++) {
      const t = (i + 0.5) / frameCount - 0.5; // -0.5..0.5 along the column
      const y = t * height;

      const frameX = new THREE.Mesh(candleRibGeometry, ribMat);
      frameX.position.y = y;
      frameX.scale.z = 0.35;
      group.add(frameX);
      ribs.push(frameX);

      const frameZ = new THREE.Mesh(candleRibGeometry, ribMat);
      frameZ.position.y = y;
      frameZ.scale.z = 0.35;
      frameZ.rotation.y = Math.PI / 2;
      group.add(frameZ);
      ribs.push(frameZ);
    }

    // Slight per-column cap variation so the exact gap edge is
    // more visually striking: top caps skew warmer, bottoms a
    // touch deeper red.
    const capMat = candleCapMaterial.clone();
    if (isTop) {
      capMat.color.setHex(0xf97316);
      capMat.emissive.setHex(0xfbbf24);
      capMat.emissiveIntensity *= 1.1;
    } else {
      capMat.color.setHex(0xb91c1c);
      capMat.emissive.setHex(0xf97316);
    }
    const cap = new THREE.Mesh(candleCapGeometry, capMat);
    const capHeight = 10;
    cap.position.y = isTop ? -height / 2 + capHeight / 2 : height / 2 - capHeight / 2;
    group.add(cap);

    // Inner reactor mouth flare: a small glowing sphere tucked
    // just inside the cap so impacts and near-misses feel like
    // they skim past an exposed energy core.
    const mouth = new THREE.Mesh(candleMouthGeometry, candleMouthMaterial.clone());
    mouth.position.y = cap.position.y + (isTop ? -capHeight * 0.35 : capHeight * 0.35);
    mouth.scale.set(0.8, 0.8, 0.8);
    group.add(mouth);

    // Build a simple cross of halos so the glow reads from
    // multiple angles without being too heavy.
    const haloOffsetZ = 0.1;
    const haloMainMat = candleHaloMaterial.clone();
    const haloSideMat = candleHaloMaterial.clone();
    haloMainMat.toneMapped = false;
    haloSideMat.toneMapped = false;
    if (isTop) {
      haloMainMat.color.setHex(0xf97316);
      haloSideMat.color.setHex(0x22d3ee);
      haloMainMat.opacity = 0.4;
      haloSideMat.opacity = 0.34;
    } else {
      haloMainMat.color.setHex(0x7f1d1d);
      haloSideMat.color.setHex(0x0ea5e9);
      haloMainMat.opacity = 0.32;
      haloSideMat.opacity = 0.3;
    }

    const haloMain = new THREE.Mesh(candleHaloGeometry, haloMainMat);
    haloMain.position.set(0, cap.position.y, haloOffsetZ);
    group.add(haloMain);
    const haloSide = new THREE.Mesh(candleHaloGeometry, haloSideMat);
    haloSide.rotation.y = Math.PI / 2;
    haloSide.position.set(0, cap.position.y, haloOffsetZ);
    group.add(haloSide);

    // Store references for later pulsing during gameplay.
    group.userData.candleCore = core;
    group.userData.candleShell = shell;
    group.userData.candleCap = cap;
    group.userData.candleMouth = mouth;
    group.userData.candleHalos = [haloMain, haloSide];
    group.userData.candleRibs = ribs;
    // Small per-column variation so the shared pulse doesn't
    // make the entire field breathe in perfect sync.
    group.userData.candlePulseJitter = matJitter;
    group.userData.candleFlickerSeed = Math.random() * 1000;
    group.userData.candleFlickerPhase = Math.random() * Math.PI * 2;

    return group;
  }

  const topMesh = createCandleColumn(topHeight, true);
  const bottomMesh = createCandleColumn(bottomHeight, false);

  // Spawn further ahead so multiple gaps are visible in advance.
  const spawnX = 120;

  // Classic layout: vertical gap along Y.
  topMesh.position.set(spawnX, gapCenter + halfGap + topHeight / 2, 0);
  bottomMesh.position.set(spawnX, gapCenter - halfGap - bottomHeight / 2, 0);

  scene.add(topMesh);
  scene.add(bottomMesh);

  const scored = { value: false };

  const pipe = {
    top: topMesh,
    bottom: bottomMesh,
    scored,
    gapCenter,
    gapSize,
    // Logical collision footprint for analytics-based bounds.
    hitWidth: PIPE_WIDTH,
    hitDepth: 4,
    topHeight,
    bottomHeight,
  };

  game.pipes.push(pipe);
  game.pipesSpawned += 1;
  game.lastGapCenter = gapCenter;

  return pipe;
}

function updateGame(dt) {
  // Pause freezes world motion but keeps current pose/visuals
  if (game.paused) {
    applyRocketTransform();
    updateRocketVisuals(dt);
    return;
  }

  // Update any in-flight orientation transition driven by a
  // wormhole or dev toggle. This adjusts axisBlend over time
  // so camera and rocket visuals can smoothly rotate between
  // vertical and horizontal views.
  updateAxisTransition(dt);

  // Phase-based "surge" challenge windows triggered by progression
  // in red candles. These create brief moments of higher tension and
  // reward without permanently spiking difficulty.
  const candles = game.redCandlesPassed || 0;
  if (!game.challengeActive && candles >= game.nextChallengeAt && candles > 0) {
    startChallenge();
  }
  if (game.challengeActive) {
    game.challengeTimer = Math.max(0, game.challengeTimer - dt);
    if (game.challengeTimer === 0) {
      game.challengeActive = false;
      // Clear challenge message if no other transient message is showing
      if (hud.message && !game.over && !game.paused && game.nearMissMsgTimer <= 0) {
        setCenterMessage('', false);
      }
    }
  }

  // Determine motion timestep (slow-motion effect for world movement)
  const motionScale = game.slowActive ? 0.35 : 1.0;
  const motionDt = dt * motionScale;

  if (!game.started || game.over) {
    // Idle bob in vertical space; horizontal mode reuses the same
    // motion but presents it with a rotated camera.
    const t = performance.now() * 0.001;
    game.y = Math.sin(t * 1.1) * 1.6;
    game.controlZ = 0;
    game.vy = 0;
    game.vz = 0;
    applyRocketTransform();
    updateRocketVisuals(dt);
    return;
  }

  // Ensure axisBlend has a sane default in case a saved game
  // was loaded from before this field existed.
  if (typeof game.axisBlend !== 'number') {
    game.axisBlend = (game.axisMode === 'horizontal') ? 1 : 0;
  }

  // Desktop-style steering: always steer along world Y using a
  // target derived from mouse input. Horizontal mode is handled via
  // input mapping + camera rotation, not by changing the physics
  // axis itself.
  const useMouseSteering = true;

  if (useMouseSteering) {
    const targetPos = (typeof game.targetY === 'number') ? game.targetY : game.y;
    const currentPos = game.y;
    const diff = targetPos - currentPos;

    // Small deadzone so micro mouse jitter doesn't cause constant
    // tiny corrections, which keeps the game from feeling too
    // perfectly "painted" onto the cursor.
    const deadzone = 0.5;
    const effectiveDiff = Math.abs(diff) < deadzone ? 0 : diff;

    // Difficulty-aware steering gain: slightly lower gain at very
    // high multipliers so late-game requires more anticipation and
    // you can't instantly correct huge mistakes.
    const phase = getPhase();
    const baseGain = 18.0;
    const phaseScale = 1.0 + phase * 0.06; // small bump per phase
    const speedNorm = THREE.MathUtils.clamp(game.multiplier / 3.0, 0.0, 1.5);
    const difficultyScale = 1.1 - 0.2 * speedNorm; // a bit less gain at high speed

    // Boost makes vertical response snappier, but not extreme.
    const boostScale = boostHeld ? 1.4 : 1.0;
    const gain = baseGain * phaseScale * difficultyScale * boostScale;

    // Inertial steering: treat vy as a velocity toward the target
    // along world Y and apply damping so motion feels smooth but
    // not sticky.
    game.vy += effectiveDiff * gain * motionDt;
    const damping = 0.78;
    game.vy *= damping;
    game.y += game.vy * motionDt * 3.0;
  }

  // Soft kill bounds similar to the 2D screen edges; we always use
  // world Y as the control axis and rely on camera rotation to
  // present horizontal mode.
  const OUT_OF_BOUNDS_Y = 40;
  let outOfBounds = (game.y > OUT_OF_BOUNDS_Y || game.y < -OUT_OF_BOUNDS_Y);
  if (outOfBounds) {
    if (game.started && !game.over) {
      gameOver();
      return;
    }
  }

  applyRocketTransform();
  updateRocketVisuals(dt);

  // Shared candle pulse: a gentle, smoothed breathing effect used
  // by all red candles so their glow feels steady rather than
  // jittery. Driven by dt instead of raw performance.now().
  candlePulsePhase += dt * 1.1;
  const targetCandlePulse = 1 + 0.06 * Math.sin(candlePulsePhase);
  candlePulse += (targetCandlePulse - candlePulse) * 0.12;

  // Pipes update: use distance/spacing-based spawning (2D-like).
  // Faster world speed automatically yields more pipes per second,
  // and later phases very gently tighten spacing so the field feels
  // less gradual without becoming unfair.
  const pipeSpawnX = 120;
  const baseSpacing = BASE_SPEED * PIPE_INTERVAL * 10; // ~31 at defaults
  const phase = getPhase();
  const phaseSpacingScale = Math.max(0.72, 1.0 - phase * 0.06);
  const targetSpacing = baseSpacing * phaseSpacingScale;
  const lastPipeX = (game.pipes.length > 0 && game.pipes[game.pipes.length - 1].top)
    ? game.pipes[game.pipes.length - 1].top.position.x
    : -9999;
  if (game.pipes.length === 0 || lastPipeX < pipeSpawnX - targetSpacing) {
    const pipe = spawnPipePair();
    maybeSpawnPowerup(pipe);
  }

  for (let i = game.pipes.length - 1; i >= 0; i--) {
    const p = game.pipes[i];
    p.top.position.x -= game.speed * motionDt * 10;
    p.bottom.position.x -= game.speed * motionDt * 10;

    // Subtle visual pulsing for candle cores/halos driven by
    // speed and challenge state so obstacles feel more alive.
    const speedFactor = Math.max(0, Math.min(game.speed / (BASE_SPEED || 1), 4));
    const surgeBoost = game.challengeActive ? 0.5 : 0.0;
    const globalNear = (game.nearMissFlash || 0) * 0.4;
    const localNear = p.nearMissBoost || 0;
    if (p.nearMissBoost) {
      p.nearMissBoost = Math.max(0, p.nearMissBoost - dt * 2.8);
    }
    const nearBoost = globalNear + localNear * 0.6;
    const intensity = 1 + (speedFactor - 1) * 0.25 + surgeBoost + nearBoost;
    const pulse = candlePulse;
    const finalBoost = intensity * pulse;

    function applyCandlePulse(group) {
      if (!group || !group.userData) return;
      const core = group.userData.candleCore;
      const shell = group.userData.candleShell;
      const cap = group.userData.candleCap;
      const mouth = group.userData.candleMouth;
      const halos = group.userData.candleHalos;
      const ribs = group.userData.candleRibs;
      const jitter = group.userData.candlePulseJitter != null
        ? group.userData.candlePulseJitter
        : 0.5;

      // Seeded micro-flicker so candles feel alive without strobing.
      const seed = group.userData.candleFlickerSeed != null ? group.userData.candleFlickerSeed : 0;
      let fPhase = group.userData.candleFlickerPhase != null ? group.userData.candleFlickerPhase : 0;
      fPhase += dt * (0.75 + 0.55 * jitter);
      group.userData.candleFlickerPhase = fPhase;
      const flicker = 0.965
        + 0.028 * Math.sin(fPhase * 6.6 + seed)
        + 0.012 * Math.sin(fPhase * 13.0 + seed * 0.31);

      const localScale = 0.9 + 0.22 * jitter;
      if (core && core.material && core.material.emissiveIntensity != null) {
        core.material.emissiveIntensity = 0.78 * finalBoost * localScale * flicker;
      }
      if (shell && shell.material && shell.material.emissiveIntensity != null) {
        shell.material.emissiveIntensity = 0.38 * finalBoost * localScale;
      }
      if (cap && cap.material && cap.material.emissiveIntensity != null) {
        cap.material.emissiveIntensity = 0.92 * finalBoost * (1.0 + 0.12 * jitter) * flicker;
      }
      if (mouth && mouth.material && mouth.material.emissiveIntensity != null) {
        // Keep the inner flare as the brightest point, with
        // a bit of extra response to near-miss surges.
        const mouthBoost = finalBoost * (1.2 + nearBoost * 0.6);
        // Slightly lower peak vs previous to avoid ACES clipping; let the halo carry "brightness".
        mouth.material.emissiveIntensity = 1.18 * mouthBoost * flicker;
        if (mouth.material.opacity != null) {
          const base = 0.75;
          mouth.material.opacity = Math.max(0.4, Math.min(1.0, base + nearBoost * 0.4));
        }
      }
      if (ribs && ribs.length) {
        for (let i = 0; i < ribs.length; i++) {
          const r = ribs[i];
          if (r && r.material && r.material.emissiveIntensity != null) {
            r.material.emissiveIntensity = 0.44 * finalBoost * (0.95 + 0.25 * jitter);
          }
        }
      }
      if (halos && halos.length) {
        const baseOpacity = 0.32 + 0.13 * (speedFactor - 1 + surgeBoost);
        const targetOpacity = Math.max(0, Math.min(0.72, baseOpacity * pulse * localScale * (0.92 + 0.20 * (flicker - 0.95))));
        for (let i = 0; i < halos.length; i++) {
          const h = halos[i];
          if (h && h.material) {
            h.material.opacity = targetOpacity;
          }
        }
      }
    }

    applyCandlePulse(p.top);
    applyCandlePulse(p.bottom);

    // Scoring when rocket passes center
    if (!p.scored.value && p.top.position.x < rocket.group.position.x) {
      p.scored.value = true;
      // Passing a red candle
      incrementScore(false, true, false);

      // Near-miss detection: reward threading close to gap edges
      let nearMiss = false;
      const controlPos = game.y;
      const offset = Math.abs(controlPos - p.gapCenter);
      const halfGap = p.gapSize / 2;
      const nearBand = Math.max(halfGap - 2.0, 0);
      if (offset > nearBand && offset < halfGap) {
        nearMiss = true;
        handleNearMiss();
        // Brief local flash on this specific candle pair so
        // near-miss feedback isn't purely global.
        p.nearMissBoost = 1.0;
      }

      // Dynamic scoring sound that reacts to run state.
      playScoreSfx({
        phase: getPhase(),
        combo: game.combo || 0,
        multiplier: game.multiplier || 1,
        challengeActive: game.challengeActive,
        slowActive: game.slowActive,
        doubleScoreActive: game.doubleScoreActive,
        nearMiss,
        isDestroyed: false,
      });
    }

    // Remove off-screen
    if (p.top.position.x < -60) {
      scene.remove(p.top);
      scene.remove(p.bottom);
      game.pipes.splice(i, 1);
    }
  }

  // Define a slimmer rocket collision box in world space that roughly
  // matches the fuselage + nose. IMPORTANT: use an analytic box tied
  // to rocket position (not matrixWorld) so rocket tilt/roll visuals
  // don't inflate the AABB and cause unfair hits.
  const rx = rocket.group.position.x;
  const ry = rocket.group.position.y;
  const rz = rocket.group.position.z;
  tmpRocketCollisionBox.min.set(rx - 2.2, ry - 1.0, rz - 0.7);
  tmpRocketCollisionBox.max.set(rx + 3.6, ry + 1.0, rz + 0.7);
  const rocketCollisionBox = tmpRocketCollisionBox;

  // Powerup pickup collision should be even tighter than pipe hits:
  // use the core rocket hitbox (not the full rendered rocket bounds)
  // and shrink slightly to avoid "magnetic" pickups.
  const rocketPickupBox = tmpRocketPickupBox.copy(rocketCollisionBox).expandByScalar(-0.25);
  for (const p of game.pipes) {
    // Use an analytic collision volume based on the logical
    // candle footprint instead of the full rendered meshes so
    // decorative halos and minor greebles don't unfairly widen
    // the hitbox.
    const halfW = (p.hitWidth || PIPE_WIDTH) * 0.5;
    const halfD = (p.hitDepth || 4) * 0.5;

    const topHalfH = (p.topHeight || 160) * 0.5;
    const bottomHalfH = (p.bottomHeight || 160) * 0.5;

    tmpPipeBoxTop.min.set(
      p.top.position.x - halfW,
      p.top.position.y - topHalfH,
      -halfD
    );
    tmpPipeBoxTop.max.set(
      p.top.position.x + halfW,
      p.top.position.y + topHalfH,
      halfD
    );
    tmpPipeBoxTop.expandByScalar(-0.4);

    tmpPipeBoxBottom.min.set(
      p.bottom.position.x - halfW,
      p.bottom.position.y - bottomHalfH,
      -halfD
    );
    tmpPipeBoxBottom.max.set(
      p.bottom.position.x + halfW,
      p.bottom.position.y + bottomHalfH,
      halfD
    );
    tmpPipeBoxBottom.expandByScalar(-0.4);

    if (rocketCollisionBox.intersectsBox(tmpPipeBoxTop) || rocketCollisionBox.intersectsBox(tmpPipeBoxBottom)) {
      if (game.invincible) {
        destroyPipe(p, undefined, 'invincibility');
      } else {
        gameOver();
      }
      break;
    }
  }

  // Powerups, bullets, speed and HUD
  updatePowerupTimers(dt);                 // timers use real time
  updatePowerups(motionDt, rocketPickupBox); // movement uses slowed time
  // Bullet motion uses slowed time. Fire cadence should also slow
  // down while SLOW is active so the whole game (including weapons)
  // feels consistently slowed.
  const fireDt = game.slowActive ? motionDt : dt;
  updateBullets(motionDt, fireDt);
  updateCeceRockets(motionDt);
  updateSpeed(dt);
  updateThrustState(dt);
  updateHud();
  updateThrustLoop(dt);

  updateExplosions(motionDt);
  updateInvincBeams(motionDt);
  updateRocketTrails(motionDt);
  if (game.slowActive || game.slowWaves.length > 0) {
    // Slow waves persist briefly after Slow ends, so we continue
    // updating while any are alive.
    updateSlowWaves(motionDt);
  }
  updateStars(motionDt);

  // Subtle FOV change that reacts to speed, slow-motion and
  // challenge surges so motion feels more visceral.
  if (camera) {
    const speedFactor = Math.min(game.multiplier * game.slowPermanentMultiplier, 4.5);
    const normSpeed = Math.max(0, Math.min((speedFactor - 1) / 3.5, 1));
    let baseFov = 58 + normSpeed * 4; // widen slightly at higher speed
    if (game.slowActive) baseFov -= 3;
    if (game.challengeActive) baseFov += 2;
    const targetFov = Math.max(50, Math.min(66, baseFov));
    camera.fov += (targetFov - camera.fov) * 0.08;
    camera.updateProjectionMatrix();
  }

  // Fade out transient near-miss HUD message over time
  if (game.nearMissMsgTimer > 0) {
    game.nearMissMsgTimer = Math.max(0, game.nearMissMsgTimer - dt);
    if (game.nearMissMsgTimer === 0 && hud.message && !game.over && !game.paused) {
      setCenterMessage('', false);
    }
  }
}

function beginAxisTransition(targetMode) {
  const toMode = (targetMode === 'vertical') ? 'vertical' : 'horizontal';
  const currentBlend = (typeof game.axisBlend === 'number')
    ? game.axisBlend
    : (game.axisMode === 'horizontal' ? 1 : 0);
  const targetBlend = (toMode === 'horizontal') ? 1 : 0;

  // If we're already effectively at the target, just snap mode.
  if (Math.abs(currentBlend - targetBlend) < 0.01) {
    game.axisMode = toMode;
    game.axisBlend = targetBlend;
    game.axisTransition = null;
    return;
  }

  game.axisTransition = {
    from: currentBlend,
    to: targetBlend,
    toMode,
    t: 0,
    duration: 0.8,
  };

  // Kick a brief wormhole warp pulse whenever the camera begins
  // a view flip so the postprocessing ripple can lean into it.
  if (targetMode !== game.axisMode) {
    game.wormholeWarp = 1.0;
  }
}

function updateAxisTransition(dt) {
  if (!game.axisTransition) return;
  const tr = game.axisTransition;
  tr.t += dt;
  const alpha = Math.min(1, tr.t / (tr.duration || 0.8));
  const blend = THREE.MathUtils.lerp(tr.from, tr.to, alpha);
  game.axisBlend = blend;

  if (alpha >= 1) {
    game.axisMode = tr.toMode;
    game.axisBlend = tr.to;
    game.axisTransition = null;
  }
}

function applyRocketTransform() {
  if (!rocket) return;
  // Forward motion stays along +X; we always move on world Y and
  // use camera rotation + input mapping to present horizontal mode.
  rocket.group.position.y = game.y;
  rocket.group.position.z = 0;

  // Subtle nose tilt that reacts to vertical velocity but keeps the
  // rocket mostly straight in the chase view.
  const vel = game.vy;
  const baseTilt = 0.04;
  const rawTilt = THREE.MathUtils.clamp(-vel * 0.03, -0.6, 0.6);
  const targetTilt = rawTilt + baseTilt;
  rocket.group.rotation.z += (targetTilt - rocket.group.rotation.z) * 0.18;

  // Bank (y-axis) follows tilt but stays near level so the ship
  // reads upright from behind.
  const baseBank = -0.04;
  const bank = -rocket.group.rotation.z * 0.45 + baseBank;
  rocket.group.rotation.y += (bank - rocket.group.rotation.y) * 0.15;
}

// Third-person chase camera that follows behind and slightly above/right of the rocket
function updateChaseCamera(dt) {
  if (!camera || !rocket || !rocket.group) return;

  const basePos = rocket.group.position;

  // Derive a simple local basis from the rocket so the camera generally
  // trails its forward direction while keeping world-up mostly stable.
  const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(rocket.group.quaternion);
  const worldUp = new THREE.Vector3(0, 1, 0); // treat +Y as global up
  const right = new THREE.Vector3(0, 0, 1).applyQuaternion(rocket.group.quaternion);

  const blend = (typeof game.axisBlend === 'number')
    ? game.axisBlend
    : (game.axisMode === 'horizontal' ? 1 : 0);

  // Desired camera position: behind along -forward, slightly above, slightly to the side.
  // Camera offset: in vertical mode we sit behind + above + slight side.
  // In horizontal mode we want an "upper-right" angle on the rocket.
  const upAmount = CHASE_UP * (1 - blend) + CHASE_HORIZ_UP * blend;
  const sideAmount = CHASE_SIDE * (1 - blend) + CHASE_HORIZ_RIGHT * blend;
  // IMPORTANT: we apply the bandY-follow to the camera's Y later.
  // If we add the right offset first, and the rocket basis makes
  // "right" contribute to world Y (happens during horizontal roll),
  // that contribution gets overwritten by the Y follow line.
  // So: build base pos first, apply Y follow, then add right offset.
  let desiredPos = new THREE.Vector3().copy(basePos)
    .add(forward.clone().multiplyScalar(-CHASE_BACK))
    .add(worldUp.clone().multiplyScalar(upAmount));

  // Let the camera track a good portion of the rocket's vertical
  // motion instead of anchoring to world Y=0, so vertical gaps
  // visibly appear above/below the rocket.
  const VERTICAL_FOLLOW = 0.25;
  const bandY = THREE.MathUtils.lerp(0, basePos.y, VERTICAL_FOLLOW);

  // Look ahead of the nose and bias toward bandY so the view tilts
  // up/down as you chase high/low gaps, but doesn't fully lock to
  // the rocket's Y.
  const lookTarget = new THREE.Vector3().copy(basePos)
    .add(forward.clone().multiplyScalar(36));
  lookTarget.y = THREE.MathUtils.lerp(lookTarget.y, bandY, 0.3);

  // Keep the camera itself slightly above the band so the rocket
  // has room to move up and down on screen.
  desiredPos.y = THREE.MathUtils.lerp(desiredPos.y, bandY + upAmount, 0.3);

  // Side offset: in horizontal mode, use world-Z as "right" so the
  // framing reliably shifts to the upper-right instead of collapsing
  // into Y due to rocket roll.
  const worldRight = new THREE.Vector3(0, 0, 1);
  const sideDir = right.clone().multiplyScalar(1 - blend).add(worldRight.clone().multiplyScalar(blend)).normalize();
  desiredPos.add(sideDir.multiplyScalar(sideAmount));

  // Smoothly interpolate camera position and target for a softer chase feel
  chaseCamPos.lerp(desiredPos, CHASE_POS_LERP);
  chaseCamTarget.lerp(lookTarget, CHASE_TARGET_LERP);

  // Blend the camera up vector so the world rotates from vertical
  // to horizontal view over time instead of snapping.
  const upVertical = new THREE.Vector3(0, 1, 0);
  const upHorizontal = new THREE.Vector3(0, 0, -1);
  const upBlended = upVertical.clone().multiplyScalar(1 - blend).add(upHorizontal.clone().multiplyScalar(blend)).normalize();
  camera.up.copy(upBlended);

  camera.position.copy(chaseCamPos);
  camera.lookAt(chaseCamTarget);
}

function updateRocketVisuals(dt) {
  if (!rocket) return;

  const t = performance.now() * 0.001;

  // Global scalar for perceived bloom/glow. Keep it simple: halve
  // additive/emissive-driven intensity without changing gameplay.
  const GLOW_SCALE = 0.25;

   // Decay short-lived visual impulses
   if (typeof game.flapBoost === 'number') {
     game.flapBoost = Math.max(0, game.flapBoost - dt * 3.0);
   }
   if (typeof game.nearMissFlash === 'number') {
     game.nearMissFlash = Math.max(0, game.nearMissFlash - dt * 2.2);
   }

  // Use the same effective speed metric that powers the HUD
  // speed meter and thrust loop so all three stay in sync.
  const baseSpeedForVis = BASE_SPEED || 1;
  const effSpeedVis = game.speed / baseSpeedForVis;
  const effClamped = Math.min(effSpeedVis, 4.5);
  const speedVisual = Math.pow(effClamped / 4.5, 0.85);

  const inFlight = game.started && !game.over;

  // Base thrust level now comes from the shared thrustState so
  // exhaust and engine audio react to the same core signal.
  let thrustNorm = typeof game.thrustState === 'number' ? game.thrustState : 0;
  thrustNorm = Math.max(0, Math.min(1, thrustNorm));

  let thrust;
  if (!inFlight) {
    // On idle/game-over we keep a softer baseline so the rocket
    // never fully dies visually.
    thrust = 0.4 + thrustNorm * 0.8;
  } else {
    thrust = 0.7 + thrustNorm * 1.3;
  }

  // Small extra contribution from active climb and near-miss to
  // keep the exhaust feeling reactive without drifting away from
  // the shared thrustState.
  if (inFlight) {
    const vyUp = Math.max(0, -game.vy);
    thrust += Math.min(vyUp * 0.02, 0.25);
    thrust += (game.nearMissFlash || 0) * 0.2;
  }

  thrust = Math.max(0.3, Math.min(2.0, thrust));

  // Subtle idle/flight micro-motion and near-miss jitter
  const nearFlash = (game.nearMissFlash || 0);
  if (!game.started || game.over) {
    // Soft idle sway on the cockpit and slight bob on Z + gentle bank
    if (rocket.cockpit) {
      rocket.cockpit.position.y = 0.25 + Math.sin(t * 2.4) * 0.05;
    }
    rocket.group.position.z = Math.sin(t * 1.4) * 0.08;
    rocket.group.rotation.y += Math.sin(t * 0.7) * 0.0012;
    const blend = (typeof game.axisBlend === 'number')
      ? game.axisBlend
      : (game.axisMode === 'horizontal' ? 1 : 0);
    const baseRollX = -Math.PI * 0.5 * blend;
    rocket.group.rotation.x = baseRollX;
  } else {
    // Tiny jitter when threading tight gaps
    const jitterMag = 0.08 * nearFlash;
    const blend = (typeof game.axisBlend === 'number')
      ? game.axisBlend
      : (game.axisMode === 'horizontal' ? 1 : 0);
    const baseRollX = -Math.PI * 0.5 * blend;
    rocket.group.rotation.x = baseRollX + jitterMag * Math.sin(t * 24);
    rocket.group.position.z = jitterMag * 0.4 * Math.sin(t * 18 + 1.2);
  }

  // Flame turbulence: layered, time-stable motion so the exhaust feels alive.
  const turb1 = Math.sin(t * 12.0);
  const turb2 = Math.sin(t * 18.4 + 1.7);
  const turb3 = Math.sin(t * 27.6 + 4.1);
  const wobble = 0.055 * turb1 + 0.03 * turb2;
  const flicker = (game.started && !game.over) ? (0.06 * turb3) : 0.0;
  const heatJitter = 0.04 * Math.sin(t * 33.0 + 0.6);
  if (rocket.flame) {
    const width = 1 + wobble + speedVisual * 0.45;
    let length = thrust * (1.0 + speedVisual * 0.92) * (1.0 + flicker * 0.35);
    if (!game.started || game.over) {
      length *= 0.6;
    }
    rocket.flame.scale.set(width, length, width);
    rocket.flame.position.y = wobble * 0.6;
    // As the flame lengthens, shift it further back so the
    // front edge stays near the nozzle and doesn't intrude
    // into the rocket body.
    if (typeof rocket.flameBaseX === 'number') {
      const halfLen = 5.0 * 0.5; // flameGeo height / 2
      rocket.flame.position.x = rocket.flameBaseX - (length - 1) * halfLen;
    }
    if (rocket.flame.material && 'opacity' in rocket.flame.material) {
      let baseOpacity = 0.45 + (thrust - 0.3) * 0.25 + speedVisual * 0.25;
      const flashBoost = 0.25 * (game.nearMissFlash || 0);
      if (!game.started || game.over) {
        baseOpacity *= 0.6;
      }
      rocket.flame.material.opacity = Math.max(0.25, Math.min(0.9, baseOpacity + flashBoost));

      // Color shifts slightly towards hotter yellow/white at high speed / near-miss
      const baseHue = 0.08 - 0.07 * speedVisual; // orange -> hotter yellow
      const baseL = 0.4 + 0.28 * speedVisual + 0.15 * (game.nearMissFlash || 0);
      rocket.flame.material.color.setHSL(baseHue, 1.0, Math.min(0.9, baseL));
      if ('emissive' in rocket.flame.material) {
        rocket.flame.material.emissive.copy(rocket.flame.material.color);
      }
    }
  }

  if (rocket.flameCore) {
    let coreBase = 0.6 + (thrust - 0.3) * 0.5;
    if (!game.started || game.over) coreBase *= 0.6;
    const coreBoost = 0.2 * (game.flapBoost || 0) + 0.7 * (game.nearMissFlash || 0);
    const coreScale = coreBase * (1.0 + 0.7 * speedVisual) + coreBoost;
    const coreWidth = 0.95 + 0.18 * speedVisual + 0.08 * Math.abs(flicker);
    rocket.flameCore.scale.set(coreWidth, coreScale, coreWidth);
    rocket.flameCore.position.y = wobble * 0.4;
    if (typeof rocket.flameCoreBaseX === 'number') {
      const halfLenCore = 3.2 * 0.5; // flameCoreGeo height / 2
      rocket.flameCore.position.x = rocket.flameCoreBaseX - (coreScale - 1) * halfLenCore;
    }

    if (rocket.flameCore.material) {
      const hCore = 0.55 - 0.22 * speedVisual; // cyan -> deeper blue at speed
      const lCore = 0.55 + 0.25 * speedVisual + 0.1 * (game.nearMissFlash || 0);
      rocket.flameCore.material.color.setHSL(hCore, 1.0, Math.min(1.0, lCore));
      if ('emissive' in rocket.flameCore.material) {
        rocket.flameCore.material.emissive.copy(rocket.flameCore.material.color);
      }
      if ('opacity' in rocket.flameCore.material) {
        const o = (0.62 + 0.22 * speedVisual + 0.18 * (game.nearMissFlash || 0)) * GLOW_SCALE;
        rocket.flameCore.material.opacity = Math.max(0.12, Math.min(0.7, o));
      }
    }
  }

  // Outer glow halo follows main flame but stays soft
  if (rocket.flameGlow && rocket.flameGlow.material) {
    const g = rocket.flameGlow;
    const baseGlowLen = thrust * (1.2 + speedVisual * 1.0);
    const baseGlowWidth = 1.2 + speedVisual * 0.55;
    const glowLen = (!game.started || game.over) ? baseGlowLen * 0.6 : baseGlowLen;
    g.scale.set(baseGlowWidth, glowLen, baseGlowWidth);
    g.position.y = wobble * 0.45;
    if (typeof rocket.flameGlowBaseX === 'number') {
      const halfLenGlow = 6.2 * 0.5; // flameGlowGeo height / 2
      g.position.x = rocket.flameGlowBaseX - (glowLen - 1) * halfLenGlow;
    }

    const nearBoost = 0.25 * nearFlash;
    let glowOpacity = 0.16 + 0.24 * speedVisual + nearBoost;
    if (!game.started || game.over) glowOpacity *= 0.7;
    g.material.opacity = Math.max(0.04, Math.min(0.2, glowOpacity * GLOW_SCALE));

    // Match hue/lightness loosely to outer flame but softer
    const tmpHSL = { h: 0, s: 0, l: 0 };
    rocket.flame.material.color.getHSL(tmpHSL);
    const hGlow = tmpHSL.h;
    const lGlow = Math.min(1.0, tmpHSL.l + 0.15);
    g.material.color.setHSL(hGlow, 0.9, lGlow);
    if ('emissive' in g.material) {
      g.material.emissive.copy(g.material.color);
    }
  }

  // Billboard flame sprite: faces the camera, adds soft volume and richness.
  if (rocket.flameSprite && rocket.flameSprite.material && camera) {
    const s = rocket.flameSprite;
    const nearFlash = (game.nearMissFlash || 0);
    const spriteBase = (!game.started || game.over) ? 0.25 : 0.45;
    const spriteGain = spriteBase + 0.55 * speedVisual + 0.35 * thrustNorm + 0.35 * nearFlash;
    const spriteW = 0.85 + 0.55 * speedVisual;
    const spriteH = 0.95 + 0.85 * speedVisual + 0.35 * thrustNorm;
    s.scale.set(5.0 * spriteW, 5.0 * spriteH, 1);
    s.position.y = wobble * 0.35;
    if (typeof rocket.flameSpriteBaseX === 'number') {
      // Keep sprite anchored near nozzle while scaling.
      s.position.x = rocket.flameSpriteBaseX - (spriteH - 1) * 1.2;
    }
    s.lookAt(camera.position);
    s.rotation.z += dt * (0.6 + 1.2 * speedVisual);

    // Color follows the core-ish hue but stays slightly whiter.
    const tmpHSL = { h: 0, s: 0, l: 0 };
    if (rocket.flameCore && rocket.flameCore.material && rocket.flameCore.material.color) {
      rocket.flameCore.material.color.getHSL(tmpHSL);
    } else if (rocket.flame && rocket.flame.material && rocket.flame.material.color) {
      rocket.flame.material.color.getHSL(tmpHSL);
    }
    s.material.color.setHSL(tmpHSL.h, 0.35 + 0.35 * speedVisual, Math.min(0.92, 0.72 + 0.18 * speedVisual));

    const o = (0.08 + 0.22 * spriteGain + 0.05 * heatJitter) * GLOW_SCALE;
    s.material.opacity = Math.max(0.01, Math.min(0.35, o));
  }

  // Shock band only appears at higher speeds and near-miss bursts
  if (rocket.flameKnot && rocket.flameKnot.material) {
    const k = rocket.flameKnot;
    const showKnot = speedVisual > 0.35 && game.started && !game.over;
    k.visible = showKnot;
    if (showKnot) {
      const baseLen = 1.0 + speedVisual * 1.1;
      const baseWidth = 0.8 + speedVisual * 0.55;
      const burst = 0.5 * nearFlash;
      const lenK = baseLen + burst;
      k.scale.set(baseWidth, lenK, baseWidth);

      const tmpHSL = { h: 0, s: 0, l: 0 };
      rocket.flameCore.material.color.getHSL(tmpHSL);
      const hK = tmpHSL.h;
      const lK = Math.min(1.0, tmpHSL.l + 0.1 + 0.15 * nearFlash);
      k.material.color.setHSL(hK, 0.9, lK);
      if ('emissive' in k.material && k.material.emissive && typeof k.material.emissive.copy === 'function') {
        k.material.emissive.copy(k.material.color);
      }
      k.material.opacity = (0.25 + 0.3 * speedVisual + 0.25 * nearFlash) * GLOW_SCALE;

      if (typeof rocket.flameKnotBaseX === 'number') {
        const halfLenK = 1.6 * 0.5; // flameKnotGeo height / 2
        k.position.x = rocket.flameKnotBaseX - (lenK - 1) * halfLenK;
      }
    }
  }

  // Engine light reacts to thrust and powerups
  if (rocket.engineLight) {
    let color = 0x38bdf8;
    if (game.invincible) {
      color = 0x22d3ee;
    } else if (game.slowActive) {
      color = 0x22c55e;
    } else if (game.ceceActive) {
      color = 0xef4444;
    }

    rocket.engineLight.color.setHex(color);
    const flashBoost = 0.6 * (game.nearMissFlash || 0);
    const speedBoost = 0.4 * speedVisual;
    const flickerLight = 0.08 * Math.sin(t * 32.0);
    rocket.engineLight.intensity = 0.7 + thrust * 0.9 + flashBoost + speedBoost + flickerLight;
  }

  // Nozzle heat: subtle incandescence ramp tied to thrust/speed.
  if (rocket.nozzleHeat && rocket.nozzleHeat.material) {
    const nearFlash = (game.nearMissFlash || 0);
    const heat = Math.max(0, Math.min(1, 0.1 + 0.65 * thrustNorm + 0.35 * speedVisual + 0.35 * nearFlash));
    const h = 0.10 - 0.06 * speedVisual; // orange -> hotter yellow
    const l = 0.35 + 0.55 * heat;
    rocket.nozzleHeat.material.color.setHSL(h, 1.0, Math.min(0.92, l));
    rocket.nozzleHeat.material.opacity = ((game.started && !game.over) ? (0.04 + 0.22 * heat + 0.03 * heatJitter) : 0.02) * GLOW_SCALE;
    rocket.nozzleHeat.scale.setScalar(1.0 + 0.06 * heat);
  }

  // Hull tinting for strong powerups
  if (rocket.bodyMat && rocket.coneMat) {
    if (game.invincible || game.slowActive || game.ceceActive) {
      let tint = 0x0ea5e9;
      if (game.invincible) tint = 0x22d3ee;
      else if (game.slowActive) tint = 0x22c55e;
      else if (game.ceceActive) tint = 0xef4444;

      rocket.bodyMat.emissive.setHex(tint);
      rocket.bodyMat.emissiveIntensity = 0.35 * GLOW_SCALE;
      rocket.coneMat.emissive.setHex(tint);
      rocket.coneMat.emissiveIntensity = 0.9 * GLOW_SCALE;
    } else {
      rocket.bodyMat.emissive.setHex(0x000000);
      rocket.bodyMat.emissiveIntensity = 0.0;
      rocket.coneMat.emissive.setHex(0x0ea5e9);

      // Nose subtly heats up with streaks
      const comboFactor = Math.min(game.bestCombo || 1, 20) / 20;
      const streak = comboFactor * 0.8 + (game.nearMissFlash || 0) * 0.9;
      const noseIntensity = (0.35 + streak * 0.6) * GLOW_SCALE;
      rocket.coneMat.emissiveIntensity = Math.min(0.8, noseIntensity);
    }
  }

  // Exhaust trail spawn: framerate-stable timer (visual only).
  if (game.started && !game.over) {
    const nearFlash = (game.nearMissFlash || 0);
    if (nearFlash > 0.35) {
      game.rocketTrailBurst = Math.max(game.rocketTrailBurst || 0, 0.28);
    }
    if (game.rocketTrailBurst > 0) {
      game.rocketTrailBurst = Math.max(0, game.rocketTrailBurst - dt);
    }

    game.rocketTrailCooldown = Math.max(0, (game.rocketTrailCooldown || 0) - dt);
    if (game.rocketTrailCooldown === 0) {
      const burstMul = (game.rocketTrailBurst > 0) ? 1.35 : 1.0;
      spawnRocketTrail(thrust * burstMul);

      // Interval tightens with thrust/speed, but stays within a perf-safe range.
      const base = isMobile ? 0.085 : 0.065;
      const fast = isMobile ? 0.055 : 0.042;
      const k = Math.max(0, Math.min(1, 0.55 * thrustNorm + 0.55 * speedVisual));
      const interval = (base + (fast - base) * k) * (1.0 + (Math.random() - 0.5) * 0.18);
      game.rocketTrailCooldown = Math.max(0.03, interval);
    }
  }

  // Cockpit glow pulses with combo
  if (rocket.cockpit && rocket.cockpit.material) {
    const comboFactor = Math.min(game.bestCombo || 1, 15) / 15;
    const strength = 0.6 + comboFactor * 0.55 + nearFlash * 0.7;
    const pulse = 0.2 * Math.sin(t * 5.5);
    const intensity = Math.max(0.3, Math.min(1.4, strength + pulse));
    const cockpitIntensity = intensity * GLOW_SCALE;
    rocket.cockpit.material.emissiveIntensity = cockpitIntensity;
    rocket.cockpit.material.opacity = 0.6 + cockpitIntensity * 0.25;

    // Briefly tint cockpit brighter/whiter on near-miss
    if (nearFlash > 0.01) {
      rocket.cockpit.material.color.setHSL(0.5, 0.6, 0.65 + 0.15 * nearFlash);
    } else {
      rocket.cockpit.material.color.setHex(0x22d3ee);
    }
  }

  // Shield ring: prominent during invincibility, softer for slow/Cece
  if (rocket.shield && rocket.shield.material) {
    const anyShield = game.invincible || game.slowActive || game.ceceActive;
    rocket.shield.visible = anyShield;
    if (anyShield) {
      let color = 0x22d3ee;
      if (game.ceceActive) color = 0xef4444;
      else if (game.slowActive && !game.invincible) color = 0x22c55e;

      rocket.shield.material.color.setHex(color);
      rocket.shield.material.emissive.setHex(color);

      const baseScale = game.invincible ? 1.15 : 1.0;
      const wobbleScale = 0.02 * Math.sin(t * 6.0);
      const scale = baseScale + wobbleScale;
      rocket.shield.scale.set(scale, scale, scale);

      const baseOpacity = (game.invincible ? 0.7 : 0.45) * GLOW_SCALE;
      rocket.shield.material.opacity = baseOpacity + (0.1 * GLOW_SCALE) * Math.sin(t * 4.0);
    }
  }

  // Additional radiating blue shield halo during invincibility
  if (rocket.shieldOuter && rocket.shieldOuter.material) {
    const visible = game.invincible;
    rocket.shieldOuter.visible = visible;
    if (visible) {
      const baseScale = 1.3;
      const pulse = 0.06 * Math.sin(t * 4.5) + 0.04 * Math.sin(t * 9.0);
      const scale = baseScale + pulse;
      rocket.shieldOuter.scale.set(scale, scale, scale);

      const baseOpacity = 0.32 * GLOW_SCALE;
      const flash = (0.14 * (game.nearMissFlash || 0)) * GLOW_SCALE;
      const opacity = Math.max(0.03, Math.min(0.55, baseOpacity + (0.1 * GLOW_SCALE) * Math.sin(t * 5.0) + flash));
      rocket.shieldOuter.material.opacity = opacity;

      const color = 0x7dd3fc;
      rocket.shieldOuter.material.color.setHex(color);
      rocket.shieldOuter.material.emissive.setHex(color);
      rocket.shieldOuter.material.emissiveIntensity = 0.9 * GLOW_SCALE;
    }
  }

  // Double-score orbiting orbs similar in spirit to the 2D
  // Sherk indicators: when DOUBLE is active, keep them visible
  // and orbiting in a loose spherical shell; otherwise, let them
  // fade and then remove.
  if (rocket.group) {
    // Lazily create orbs if needed when double is active.
    if (game.doubleScoreActive && game.doubleOrbs.length === 0) {
      const orbGeo = new THREE.SphereGeometry(0.38, 10, 10);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xfbbf24,
        emissiveIntensity: 0.95,
        metalness: 0.7,
        roughness: 0.2,
        transparent: true,
        opacity: 0.85,
      });
      const count = 5;
      for (let i = 0; i < count; i++) {
        const orb = new THREE.Mesh(orbGeo, baseMat.clone());
        // Randomised spherical coordinates so orbs wrap the rocket
        // in 3D instead of a single ring.
        orb.userData.theta = Math.random() * Math.PI * 2; // azimuth
        orb.userData.phi = Math.random() * Math.PI;       // polar
        orb.userData.thetaSpeed = 0.6 + Math.random() * 0.8;
        orb.userData.phiSpeed = 0.4 + Math.random() * 0.7;
        orb.userData.orbitRadius = 3.0 + Math.random() * 0.6;
        orb.userData.alpha = 1.0;
        rocket.group.add(orb);
        game.doubleOrbs.push(orb);
      }
    }

    for (let i = game.doubleOrbs.length - 1; i >= 0; i--) {
      const orb = game.doubleOrbs[i];
      if (!game.doubleScoreActive) {
        orb.userData.alpha = (orb.userData.alpha || 1) - dt * 1.8;
        if (orb.userData.alpha <= 0) {
          rocket.group.remove(orb);
          game.doubleOrbs.splice(i, 1);
          continue;
        }
      } else {
        orb.userData.alpha = 1.0;
      }

      const radius = orb.userData.orbitRadius || 3.2;
      const speedFactor = Math.min(game.multiplier * game.slowPermanentMultiplier, 5.0);
      const slowFactor = game.slowActive ? 0.5 : 1.0;
      const orbitSpeed = (0.6 + speedFactor * 0.8) * slowFactor;

      orb.userData.theta += dt * (orb.userData.thetaSpeed || 1.0) * orbitSpeed;
      orb.userData.phi += dt * (orb.userData.phiSpeed || 0.7) * orbitSpeed * 0.6;

      // Keep phi within a sane range so the orbit doesn't flip.
      if (orb.userData.phi > Math.PI) orb.userData.phi -= Math.PI;
      if (orb.userData.phi < 0) orb.userData.phi += Math.PI;

      const theta = orb.userData.theta;
      const phi = orb.userData.phi;
      const sinPhi = Math.sin(phi);
      const x = Math.cos(theta) * radius * sinPhi;
      const y = Math.cos(phi) * radius;
      const z = Math.sin(theta) * radius * sinPhi;
      orb.position.set(x, y, z);

      if (orb.material && 'opacity' in orb.material) {
        const baseOpacity = 0.78;
        const alpha = Math.max(0, Math.min(1, orb.userData.alpha || 1));
        orb.material.opacity = baseOpacity * alpha;
        orb.material.transparent = true;
      }
    }
  }
}

function initPostprocessing() {
  if (!renderer) return;

  const pixelRatio = renderer.getPixelRatio();
  const width = Math.floor(window.innerWidth * pixelRatio * __moonshotPostScale);
  const height = Math.floor(window.innerHeight * pixelRatio * __moonshotPostScale);

  renderTarget = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });

  postScene = new THREE.Scene();
  postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    tDiffuse: { value: null },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0.0 },
    uTime: { value: 0.0 },
    // Separate control for chromatic fringing so wormhole flips can
    // add colour-split without making every slow ripple overly busy.
    uChromaticStrength: { value: 0.0 },
  };

  postMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 uCenter;
      uniform float uStrength;
      uniform float uTime;
       uniform float uChromaticStrength;
      varying vec2 vUv;

      void main() {
        vec2 uv = vUv;
        vec2 dir = uv - uCenter;
        float dist = length(dir);

        // Oscillating radial wave: multiple rings that travel
        // outward across most of the screen.
        float wave = sin(dist * 55.0 - uTime * 5.0);
        // Stronger coverage: keep some influence almost to the
        // edges while remaining strongest near the rocket.
        float falloff = smoothstep(1.0, 0.0, dist);
        float strength = uStrength * 0.022;

        if (falloff <= 0.0 || strength <= 0.0) {
          gl_FragColor = texture2D(tDiffuse, uv);
          return;
        }

        vec2 n = normalize(dir + 1e-4);
        vec2 offset = n * wave * falloff * strength;
        vec2 warpedUv = clamp(uv + offset, vec2(0.0), vec2(1.0));
        // Chromatic split driven by a separate strength so wormhole
        // flips can add a strong, prismatic warp while ordinary
        // slow ripples stay cleaner.
        float chroma = uChromaticStrength * 0.08 * falloff;
        vec2 chromaOffset = n * chroma;

        vec3 col;
        col.r = texture2D(tDiffuse, clamp(warpedUv + chromaOffset, vec2(0.0), vec2(1.0))).r;
        col.g = texture2D(tDiffuse, warpedUv).g;
        col.b = texture2D(tDiffuse, clamp(warpedUv - chromaOffset, vec2(0.0), vec2(1.0))).b;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  postQuad = new THREE.Mesh(quadGeo, postMaterial);
  postScene.add(postQuad);
}

function spawnRocketTrail(strength) {
  if (!rocket || !scene) return;

  // Cap trail count for performance
  const maxTrails = isMobile ? 24 : 40;
  if (game.rocketTrails.length > maxTrails) return;

  // Soft exhaust ribbon (billboarded plane) for a cleaner, more premium look.
  const length = 4.2 + strength * 1.7;
  const thickness = 0.95;
  const geo = new THREE.PlaneGeometry(length, thickness);
  const mat = new THREE.MeshBasicMaterial({
    map: rocketTrailSpriteTex || null,
    color: 0x111827,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  mat.toneMapped = false;

  // Slightly tint fresh trails to match current engine hue without making them bright
  if (rocket.engineLight) {
    const tmpHSL = { h: 0, s: 0, l: 0 };
    rocket.engineLight.color.getHSL(tmpHSL);
    const hTrail = tmpHSL.h;
    const sTrail = tmpHSL.s * 0.6;
    const lTrail = 0.10 + 0.06 * strength;
    mat.color.setHSL(hTrail, sTrail, Math.min(0.22, lTrail));
  }

  const mesh = new THREE.Mesh(geo, mat);

  __tmpTrailWorldPos.set(-4.8, 0, 0);
  rocket.group.localToWorld(__tmpTrailWorldPos);

  mesh.position.copy(__tmpTrailWorldPos);
  // Slight vertical jitter only; keep fairly straight in Z
  mesh.position.y += (Math.random() - 0.5) * 0.4;
  mesh.position.z += (Math.random() - 0.5) * 0.18;

  // Face the camera so the ribbon reads as a soft streak.
  if (camera) {
    mesh.quaternion.copy(camera.quaternion);
  }

  scene.add(mesh);

  const life = 0.9 + Math.random() * 0.5;
  game.rocketTrails.push({ mesh, life, maxLife: life });
}

function updateRocketTrails(dt) {
  for (let i = game.rocketTrails.length - 1; i >= 0; i--) {
    const tSeg = game.rocketTrails[i];
    tSeg.life -= dt;
    if (tSeg.life <= 0) {
      scene.remove(tSeg.mesh);
      try {
        if (tSeg.mesh && tSeg.mesh.geometry && typeof tSeg.mesh.geometry.dispose === 'function') {
          tSeg.mesh.geometry.dispose();
        }
        const mat = tSeg.mesh ? tSeg.mesh.material : null;
        if (mat && typeof mat.dispose === 'function') mat.dispose();
      } catch (e) {}
      game.rocketTrails.splice(i, 1);
      continue;
    }

    const ageRatio = tSeg.life / tSeg.maxLife;
    tSeg.mesh.position.x -= game.speed * dt * 10;
    // Keep them stretched along X, thinning as they fade.
    const baseScaleX = 1.0 + 0.55 * (1 - ageRatio);
    const baseScaleY = 0.55 + 0.28 * ageRatio;
    tSeg.mesh.scale.set(baseScaleX, baseScaleY, 1);
    if (camera) {
      tSeg.mesh.quaternion.copy(camera.quaternion);
    }
    if (tSeg.mesh.material && tSeg.mesh.material.transparent) {
      tSeg.mesh.material.opacity = 0.06 + 0.38 * ageRatio;
    }
  }
}

// Slow-motion ripple rings spawned around the rocket during the
// Slow powerup, echoing the 2D game's slow waves.
function spawnSlowWave() {
  if (!rocket || !scene) return;

  const radius = 3.0;
  const tube = 0.12;
  const geo = new THREE.TorusGeometry(radius, tube, 12, 40);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x22c55e,
    emissiveIntensity: 0.5,
    metalness: 0.3,
    roughness: 0.4,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = Math.PI / 2;

  __tmpSlowWaveWorldPos.set(0, 0, 0);
  rocket.group.localToWorld(__tmpSlowWaveWorldPos);
  mesh.position.copy(__tmpSlowWaveWorldPos);

  scene.add(mesh);

  const life = 0.9;
  game.slowWaves.push({ mesh, life, maxLife: life });
}

function updateSlowWaves(dt) {
  for (let i = game.slowWaves.length - 1; i >= 0; i--) {
    const w = game.slowWaves[i];
    w.life -= dt;
    if (w.life <= 0) {
      scene.remove(w.mesh);
      try {
        if (w.mesh && w.mesh.geometry && typeof w.mesh.geometry.dispose === 'function') {
          w.mesh.geometry.dispose();
        }
        const mat = w.mesh ? w.mesh.material : null;
        if (mat && typeof mat.dispose === 'function') mat.dispose();
      } catch (e) {}
      game.slowWaves.splice(i, 1);
      continue;
    }

    const t = 1 - w.life / w.maxLife;
    const scale = 1 + t * 2.2;
    w.mesh.scale.setScalar(scale);
    w.mesh.rotation.z += dt * 0.7;
    if (w.mesh.material && w.mesh.material.transparent) {
      const baseOpacity = 0.35;
      w.mesh.material.opacity = Math.max(0, baseOpacity * (1 - t));
    }
  }
}

// World-space starfield update: stars drift left like pipes so the
// rocket visibly flies past them.
function updateStarLayer(points, dt, baseSpeed, scrollFactor, xMin, xMax, ySpan, zMin, zMax) {
  if (!points || !points.geometry) return;
  const attr = points.geometry.getAttribute('position');
  if (!attr) return;

  const arr = attr.array;
  const len = arr.length / 3;

  // Tie star drift more strongly to effective speed and thrust so
  // traversal through space feels reactive to gameplay.
  const speedNorm = Math.max(0.4, Math.min(baseSpeed / (game.baseSpeed || 1), 3.0));
  const thrust = (typeof game.thrustState === 'number') ? game.thrustState : 0;
  let scrollMul = 1 + (speedNorm - 1) * 0.6 + thrust * 0.5;
  if (game.slowActive) scrollMul *= 0.45;
  const scrollX = baseSpeed * dt * scrollFactor * scrollMul;

  for (let i = 0; i < len; i++) {
    const idx = i * 3;
    let x = arr[idx];
    x -= scrollX;
    if (x < xMin) {
      x = xMax + Math.random() * 40;
      arr[idx] = x;
      // Respawn in a soft cylindrical band around the flight path
      // so stars form a 3D tunnel instead of a flat sheet.
      const radiusY = ySpan * 0.5;
      const radiusZ = (zMax - zMin) * 0.5;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      const y = Math.sin(angle) * r * radiusY;
      const zCenter = (zMin + zMax) * 0.5;
      const z = zCenter + Math.cos(angle) * r * radiusZ;
      arr[idx + 1] = y;
      arr[idx + 2] = z;
    } else {
      // Apply a localized "gravity lens" from nearby wormholes
      // so stars bend and arc as they pass close to a portal.
      let y = arr[idx + 1];
      let z = arr[idx + 2];

      if (activeWormholeLenses.length) {
        for (let j = 0; j < activeWormholeLenses.length; j++) {
          const f = activeWormholeLenses[j];
          const dx = x - f.x;
          const absDx = Math.abs(dx);
          if (absDx > f.depth) continue;

          const dy = y - f.y;
          const dz = z - f.z;
          const radSq = dy * dy + dz * dz;
          const radius = f.radius;
          const radiusSq = radius * radius;
          if (radSq >= radiusSq) continue;

          const dist = Math.sqrt(radSq) + 1e-4;
          const falloff = 1.0 - dist / radius;
          const depthFactor = 1.0 - Math.min(absDx / f.depth, 1.0);
          const field = f.strength * falloff * depthFactor;
          if (field <= 0.0) continue;

          // Blend radial pull (toward the ring) with a tangential
          // swirl so stars arc around the horizon instead of just
          // sliding straight in or out.
          const ny = dy / dist;
          const nz = dz / dist;
          const ty = -nz;
          const tz = ny;
          const radialScale = 28.0;
          const swirlScale = 16.0;
          y += (ny * radialScale + ty * swirlScale) * field;
          z += (nz * radialScale + tz * swirlScale) * field;
        }
      }

      arr[idx] = x;
      arr[idx + 1] = y;
      arr[idx + 2] = z;
    }
  }

  attr.needsUpdate = true;
}

function updateStars(dt) {
  const baseSpeed = game.started && !game.over ? game.speed : game.baseSpeed;

  // Slightly faster parallax during challenge windows.
  const surgeBoost = game.challengeActive ? 1.15 : 1.0;

  const thrust = (typeof game.thrustState === 'number') ? game.thrustState : 0;

   // Gentle global twinkle so the field feels alive without
   // distracting from pipes/rocket.
   const t = performance.now() * 0.001;
   const pulseNear = (0.05 + 0.03 * thrust) * Math.sin(t * 1.8);
   const pulseMid = (0.04 + 0.02 * thrust) * Math.sin(t * 1.3 + 1.1);
   const pulseFar = (0.03 + 0.015 * thrust) * Math.sin(t * 0.9 + 2.2);

   if (starsNear && starsNear.material) {
     starsNear.material.opacity = 0.7 + pulseNear;
   }
   if (starsMid && starsMid.material) {
     starsMid.material.opacity = 0.62 + pulseMid;
   }
   if (starsFar && starsFar.material) {
     starsFar.material.opacity = 0.54 + pulseFar;
   }

  let starDt = dt;
  if (isMobile) {
    const targetHz = 30;
    game.starDtAcc = (game.starDtAcc || 0) + dt;
    if (game.starDtAcc < (1 / targetHz)) {
      return;
    }
    starDt = game.starDtAcc;
    game.starDtAcc = 0;
  }

  // Stars drift left at varying speeds, wrapping around a
  // huge 3D volume so the field feels truly vast in every
  // direction, not just stretched along one axis.
  updateStarLayer(starsFar, starDt, baseSpeed, 4.0 * surgeBoost, -800, 800, 640, -420, 420);
  updateStarLayer(starsMid, starDt, baseSpeed, 6.0 * surgeBoost, -800, 800, 560, -320, 320);
  updateStarLayer(starsNear, starDt, baseSpeed, 8.0 * surgeBoost, -800, 800, 480, -220, 220);
}

// Kick off a short "surge" challenge window: slightly higher speed
// and better rewards for a limited time, then return to normal.
function startChallenge() {
  game.challengeActive = true;
  game.challengeTimer = 8.0;

  const candles = game.redCandlesPassed || 0;
  game.nextChallengeAt = candles + 18;

  triggerCameraShake(0.25, 0.3);
  if (hud.message && !game.over && !game.paused) {
    setCenterMessage('SURGE! Faster pipes, bonus score', true);
  }
}

function updateSpeed(dt) {
  // Speed is derived from score-driven multiplier and powerup state.
  const wormholeSlowStrength = (game.wormholeSlowTimer > 0) ? 0.5 : 0.0;
  const slowStrength = Math.min(1.0, (game.slowActive ? 1.0 : 0.0) + wormholeSlowStrength);
  // Full SLOW reduces to 0.25x; wormhole is half-strength (blends toward 0.25).
  const slowFactor = 1.0 - slowStrength * (1.0 - 0.25);
  const challengeBoost = game.challengeActive ? 1.18 : 1.0;
  // Each thrust gives a short-lived forward speed bump so the
  // act of thrusting feels like it "pushes" the run forward.
  // Uses the existing flapBoost envelope (fast decay).
  const thrustBump = 1.0 + 0.06 * Math.max(0, Math.min(1, (game.flapBoost || 0)));
  // Slight forward speed bump while boost is held on desktop so
  // holding the action feels like a gentle "thrust".
  // Make boost a more meaningful tradeoff: a clearer forward speed
  // increase while held on desktop, especially at higher phases.
  let controlBoost = 1.0;
  if (boostHeld && game.started && !game.over) {
    const phase = getPhase();
    // Double the effective boost impact compared to the old
    // setting by increasing the base and keeping the phase
    // bonus for late-game.
    const baseBoost = 1.36;
    const phaseBonus = 0.04 * phase; // a bit stronger in deep runs
    controlBoost = baseBoost + phaseBonus;
  }
  const targetSpeed = BASE_SPEED * game.multiplier * game.slowPermanentMultiplier * slowFactor * challengeBoost * controlBoost * thrustBump;
  const lerp = 0.12;
  game.speed += (targetSpeed - game.speed) * lerp;
}

// Shared thrust state used by both engine audio and rocket
// exhaust visuals so they respond to the same underlying
// "how hard are we pushing" signal. This is derived from
// effective forward speed plus short-lived boosts such as
// SURGE, desktop boost and near-miss streaks.
function updateThrustState(dt) {
  const base = BASE_SPEED || 1;
  const effectiveSpeed = game.speed / base;

  // Map the same general band we used for engine audio:
  // around 0.8x feels like idle, ~3.5x and above is max push.
  let norm = (effectiveSpeed - 0.8) / 2.7;
  norm = Math.max(0, Math.min(1, norm));

  // Layer in difficulty, boost and near-miss energy so late
  // phases and clutch plays visibly/audibly punch harder.
  const difficultyFactor = Math.min(1.5, (game.multiplier * game.slowPermanentMultiplier) / 2);
  const near = game.nearMissFlash || 0;

  // Maintain the same smooth visual boost envelope here so
  // both audio and flame share it.
  const inFlight = game.started && !game.over;
  const targetBoostVis = (boostHeld && inFlight) ? 1 : 0;
  const lerpBoost = 1 - Math.exp(-dt * 12);
  game.boostVisual += (targetBoostVis - game.boostVisual) * lerpBoost;

  // Gentle contribution from each component; values chosen to
  // roughly mirror the previous visual-only thrust shaping.
  norm += difficultyFactor * 0.12;      // deeper runs feel meatier
  norm += (game.boostVisual || 0) * 0.35; // desktop boost click/hold
  norm += near * 0.25;                  // near-miss bursts

  // Vertical climb adds a little extra bite to the flame but is
  // deliberately weaker so audio feels mostly speed/boost-driven.
  if (inFlight) {
    const vyUp = Math.max(0, -game.vy);
    norm += Math.min(vyUp * 0.01, 0.25);
  }

  // Slow motion softens the perceived thrust a bit.
  if (game.slowActive) {
    norm *= 0.85;
  }

  // Allow some headroom for bursts, then normalize back into 0–1.
  const target = Math.max(0, Math.min(1, norm / 1.1));

  const smoothing = inFlight ? (1 - Math.exp(-dt * 5)) : (1 - Math.exp(-dt * 3));
  game.thrustState += (target - game.thrustState) * smoothing;
}

function updateHud() {
  if (!hud.score) return;
  const nextScore = String(game.score);
  const nextCombo = 'x' + game.combo;

  const prevScore = hud.score.textContent;
  const prevCombo = hud.combo.textContent;

  hud.score.textContent = nextScore;
  hud.combo.textContent = nextCombo;
  // Effective speed factor including all mechanics (slow, SURGE,
  // and desktop boost). Using game.speed / BASE_SPEED so the HUD
  // reflects exactly how fast the world is moving.
  const base = BASE_SPEED || 1;
  const effectiveSpeed = game.speed / base;
  if (hud.highScore) {
    const nextHigh = String(game.highScore);
    const prevHigh = hud.highScore.textContent;
    hud.highScore.textContent = nextHigh;
    if (hud.highFactor && prevHigh !== nextHigh) {
      pulseUi(hud.highFactor, 520);
    }
  }

  if (hud.scoreFactor && prevScore !== nextScore) {
    pulseUi(hud.scoreFactor, 260);
  }
  if (hud.comboFactor && prevCombo !== nextCombo) {
    pulseUi(hud.comboFactor, 360);
  }

  // Bottom speed meter mirroring the 2D game's visual meter, but
  // driven by actual forward speed so all mechanics (slow, SURGE,
  // boost) visibly affect it.
  if (hud.speedMeterValue && hud.speedMeterFill) {
    const clamped = Math.min(effectiveSpeed, 8);
    const ratio = clamped / 8;
    hud.speedMeterValue.textContent = effectiveSpeed.toFixed(1) + 'x';
    hud.speedMeterFill.style.width = (ratio * 100).toFixed(1) + '%';

    // Only run the "charge flow" animation when speed is meaningfully above 1x.
    if (hud.speedMeter) {
      hud.speedMeter.classList.toggle('active', effectiveSpeed > 1.05);
    }
  }

  // Slow-mo visual overlay intensity
  if (hud.slowOverlay) {
    const wormholeSlowStrength = (game.wormholeSlowTimer > 0) ? 0.5 : 0.0;
    const slowStrength = Math.min(1.0, (game.slowActive ? 1.0 : 0.0) + wormholeSlowStrength);
    const target = 0.9 * slowStrength;
    game.slowVisual += (target - game.slowVisual) * 0.15;
    const clamped = Math.max(0, Math.min(1, game.slowVisual));
    hud.slowOverlay.style.opacity = clamped.toFixed(2);
    hud.slowOverlay.classList.toggle('active', clamped > 0.02);
  }

  // (Intentionally no axis-mode label text.)

  // (Intentionally no center-screen text for horizontal mode.)

  if (hud.powerups) {
    const active = [];
    if (game.gunTimer > 0) active.push('GUN');
    if (game.slowTimer > 0) active.push('SLOW');
    if (game.doubleTimer > 0) active.push('DOUBLE');
    if (game.ceceTimer > 0) active.push('MISSILE');
    if (game.invTimer > 0) active.push('INVINC');
    if (game.wormholeSlowTimer > 0) active.push('WORMHOLE');
    updatePowerupChips(active);
  }
}

function maybeSpawnPowerup(pipe) {
  if (!pipe) return;
  if (game.powerupCooldownTimer > 0) return;

  // Keep the total number of active pickups modest so the field
  // never looks crowded with easy rewards.
  const MAX_ACTIVE_POWERUPS = 2;
  if (game.powerups && game.powerups.length >= MAX_ACTIVE_POWERUPS) return;

  // Let the player fly a few gaps before introducing powerups so
  // early game is about learning core controls.
  if ((game.redCandlesPassed || 0) < 3) return;

  const speedFactor = game.speed / game.baseSpeed;
  // Slightly lower baseline chance than the 2D game and add a
  // mild falloff with speed so long runs don't become powerup
  // chains.
  let spawnChance = Math.max(0.70 / Math.sqrt(speedFactor), POWERUP_MIN_SPAWN_CHANCE);

  // Gate strong effects, but don't accidentally make MISSILE feel "missing".
  // - Cece (MISSILE) unlocks earlier so it appears during normal runs.
  // - Invincibility stays later so it remains special.
  const candlesPassed = (game.redCandlesPassed || 0);
  // Powerups themselves don't start spawning until a few candles in.
  // From that moment onward, keep GUN and MISSILE equally likely.
  const allowCece = candlesPassed >= 3;
  const allowInv = candlesPassed >= 14;

  // Wormholes should show up earlier and more often.
  const allowWormhole = candlesPassed >= 6;

  let types;
  let weights;
  if (allowInv) {
    types = ['gun', 'slow', 'double', 'invincibility', 'cece'];
    // Bias strongly toward SLOW so it appears much more often.
    weights = [0.14, 0.45, 0.16, 0.10, 0.15];
  } else if (allowCece) {
    types = ['gun', 'slow', 'double', 'cece'];
    weights = [0.16, 0.46, 0.18, 0.20];
  } else {
    // Early pool: include MISSILE immediately, with the exact same weight as GUN.
    types = ['gun', 'slow', 'double', 'cece'];
    weights = [0.18, 0.46, 0.18, 0.18];
  }

  // Very rare chance for a wormhole that toggles the view between
  // vertical and horizontal without affecting score or speed.
  // Wormholes can now appear on their own or, more rarely, share
  // a gap with another pickup.
  const now = performance.now() * 0.001;
  const minWormholeInterval = 2.8; // seconds between portal spawns
  const hasActiveWormhole = game.powerups && game.powerups.some(p => p && p.type === 'wormhole');
  const canSpawnWormhole = allowWormhole && !hasActiveWormhole && !game.axisTransition &&
    (now - (game.lastWormholeSpawnTime || 0) >= minWormholeInterval);
  const wormholeSoloChance = 0.14;   // more frequent solo portals
  const wormholeBuddyChance = 0.0;   // disable buddies to avoid "2 at a time" clutter

  // Wormhole roll is independent of normal pickup spawn chance.
  let baseTypesToSpawn = null;
  if (canSpawnWormhole && Math.random() < wormholeSoloChance) {
    baseTypesToSpawn = ['wormhole'];
    game.lastWormholeSpawnTime = now;
  }

  // If wormhole didn't trigger, roll the normal pickup spawn chance.
  if (!baseTypesToSpawn) {
    if (Math.random() > spawnChance) return;

    let r = Math.random();
    let type = types[0];
    let sum = 0;
    for (let i = 0; i < types.length; i++) {
      sum += weights[i];
      if (r < sum) {
        type = types[i];
        break;
      }
    }

    // Always spawn at most one non-wormhole pickup per pipe.
    // Extra nudge: if Slow isn't currently active, convert a chunk of
    // non-slow rolls into slow so SLOW reliably shows up more often
    // without changing the overall spawn cadence.
    const slowAlreadyActive = (game.slowTimer > 0) || !!game.slowActive;
    if (!slowAlreadyActive && type !== 'slow' && Math.random() < 0.28) {
      type = 'slow';
    }
    baseTypesToSpawn = [type];

    // (Disabled by default) Rare buddy case.
    if (canSpawnWormhole && wormholeBuddyChance > 0 && Math.random() < wormholeBuddyChance) {
      if (!baseTypesToSpawn.includes('wormhole')) {
        baseTypesToSpawn.push('wormhole');
        game.lastWormholeSpawnTime = now;
      }
    }
  }

  // Spawn a little further downstream and not always dead-center
  // in the gap so pickups feel earned instead of automatic.
  const spawnX = pipe.top.position.x + PIPE_WIDTH * 2.4;

  // Prevent clustered powerups: if a pickup is already near this X,
  // skip spawning this gap so rewards don't stack up conveniently.
  const MIN_POWERUP_X_SEPARATION = 18;
  if (game.powerups && game.powerups.length) {
    for (let i = 0; i < game.powerups.length; i++) {
      const other = game.powerups[i];
      if (!other || !other.mesh) continue;
      if (Math.abs(other.mesh.position.x - spawnX) < MIN_POWERUP_X_SEPARATION) {
        game.powerupCooldownTimer = POWERUP_COOLDOWN;
        return;
      }
    }
  }

  const halfGap = pipe.gapSize * 0.5;
  // Spawn powerups "just barely" inside the vertical candle gap.
  // Spawn inside the gap with a safety margin, but don't bias so hard
  // towards the edges that pickups feel glued to the candles.
  const edgeMargin = Math.min(1.35, Math.max(0.8, halfGap * 0.07));
  const gapMin = pipe.gapCenter - halfGap + edgeMargin;
  const gapMax = pipe.gapCenter + halfGap - edgeMargin;

  let y = pipe.gapCenter;
  if (gapMax > gapMin) {
    y = gapMin + Math.random() * (gapMax - gapMin);
  }

  for (const tType of baseTypesToSpawn) {
    // Wormholes should be dead-center in the candle opening.
    const spawnY = (tType === 'wormhole') ? pipe.gapCenter : y;
    const mesh = createPowerupMesh(tType);
    mesh.position.set(spawnX, spawnY, 0);
    scene.add(mesh);
    // Make pickups larger overall so they read clearly at speed,
    // with gun, slow and wormhole pushed slightly further.
    const globalScale = 1.35;
    let typeScale = 1.0;
    if (tType === 'wormhole') {
      typeScale = 1.0;
    } else if (tType === 'gun') {
      typeScale = 1.87;
    } else if (tType === 'double') {
      typeScale = 1.815;
    } else if (tType === 'slow') {
      typeScale = 1.4;
    } else if (tType === 'invincibility') {
      typeScale = 1.76;
    }

    // For wormholes, DO NOT scale to fill the candle gap.
    // The portal VFX should be much smaller than the gap (user request).
    // (Wormhole3D is authored around ~1 local unit radius.)
    let baseScale = globalScale * typeScale;
    if (tType === 'wormhole') {
      const gapFitScale = Math.max(1.15, halfGap - edgeMargin * 0.20);
      // Target: much smaller than gap-fill, but never so small that
      // the portal collapses into a tiny dot.
      baseScale = 5.0 * Math.max(1.10, gapFitScale * 0.12);
    }
    game.powerups.push({
      type: tType,
      mesh,
      age: 0,
      baseY: spawnY,
      // Store the spawning gap so bobbing/sway stays inside the gap
      // (prevents edge-spawned pickups from drifting into candles).
      gapCenter: pipe.gapCenter,
      gapHalf: halfGap,
      gapEdgeMargin: edgeMargin,
      phase: Math.random() * Math.PI * 2,
      baseScale,
    });
  }

  game.powerupCooldownTimer = POWERUP_COOLDOWN;
  // Nudge the loose powerup timer forward as well so we don't spawn a
  // free-floating pickup immediately on top of a gap-bound one.
  if (game.loosePowerupTimer < POWERUP_COOLDOWN * 0.5) {
    game.loosePowerupTimer = POWERUP_COOLDOWN * 0.5;
  }
}

// Spawn a free-floating powerup not anchored to a specific pipe
// gap so that pickups can appear dynamically between red candles.
function spawnLoosePowerup() {
  if (!scene || !rocket) return;

  // Avoid spawning a loose pickup if the field is already busy
  // with several gap-bound powerups.
  const MAX_ACTIVE_POWERUPS = 2;
  if (game.powerups && game.powerups.length >= MAX_ACTIVE_POWERUPS) return;

  const speedFactor = game.speed / (game.baseSpeed || 1);
  // Reuse the same unlock rules so strong pickups are still
  // gated a bit into the run.
  const candlesPassed = (game.redCandlesPassed || 0);
  // Keep GUN and MISSILE equally likely as soon as loose spawns start happening.
  const allowCece = candlesPassed >= 3;
  const allowInv = candlesPassed >= 16;

  let types;
  let weights;
  if (allowInv) {
    types = ['gun', 'slow', 'double', 'invincibility', 'cece'];
    weights = [0.14, 0.45, 0.16, 0.10, 0.15];
  } else if (allowCece) {
    types = ['gun', 'slow', 'double', 'cece'];
    weights = [0.16, 0.46, 0.18, 0.20];
  } else {
    types = ['gun', 'slow', 'double', 'cece'];
    weights = [0.18, 0.46, 0.18, 0.18];
  }

  let r = Math.random();
  let type = types[0];
  let sum = 0;
  for (let i = 0; i < types.length; i++) {
    sum += weights[i];
    if (r < sum) {
      type = types[i];
      break;
    }
  }

  // Same nudge for loose spawns: favor SLOW when it's not already active.
  const slowAlreadyActive = (game.slowTimer > 0) || !!game.slowActive;
  if (!slowAlreadyActive && type !== 'slow' && Math.random() < 0.28) {
    type = 'slow';
  }

  const mesh = createPowerupMesh(type);

  // Anchor loose spawns into a real upcoming pipe gap so they never
  // appear outside the candle opening.
  const rx = rocket.group.position.x;
  let pipe = null;
  let bestDx = Infinity;
  for (let i = 0; i < game.pipes.length; i++) {
    const p = game.pipes[i];
    if (!p || !p.top) continue;
    const dx = p.top.position.x - rx;
    if (dx < 55) continue;  // too close to be fair
    if (dx > 130) continue; // too far; likely not relevant
    if (dx < bestDx) {
      bestDx = dx;
      pipe = p;
    }
  }
  if (!pipe) return false;

  // Spawn at the same offset used by gap-bound spawns.
  const x = pipe.top.position.x + PIPE_WIDTH * 2.4;

  const halfGap = (pipe.gapSize || 0) * 0.5;
  const edgeMargin = Math.min(1.35, Math.max(0.8, halfGap * 0.07));
  const gapMin = (pipe.gapCenter || 0) - halfGap + edgeMargin;
  const gapMax = (pipe.gapCenter || 0) + halfGap - edgeMargin;
  let y = pipe.gapCenter || 0;
  if (gapMax > gapMin) {
    y = gapMin + Math.random() * (gapMax - gapMin);
  }

  // Prevent loose powerups from spawning too close to an existing
  // pickup in world X (avoids "double" stacks).
  const MIN_POWERUP_X_SEPARATION = 18;
  if (game.powerups && game.powerups.length) {
    for (let i = 0; i < game.powerups.length; i++) {
      const other = game.powerups[i];
      if (!other || !other.mesh) continue;
      if (Math.abs(other.mesh.position.x - x) < MIN_POWERUP_X_SEPARATION) {
        return false;
      }
    }
  }

  mesh.position.set(x, y, 0);
  scene.add(mesh);

  const globalScale = 1.25;
  let typeScale = 1.0;
  if (type === 'gun') typeScale = 1.815;
  else if (type === 'slow') typeScale = 1.35;
  else if (type === 'double') typeScale = 1.76;
  else if (type === 'invincibility') typeScale = 1.705;
  else if (type === 'cece') typeScale = 1.74;

  game.powerups.push({
    type,
    mesh,
    age: 0,
    baseY: y,
    gapCenter: pipe.gapCenter,
    gapHalf: halfGap,
    gapEdgeMargin: edgeMargin,
    phase: Math.random() * Math.PI * 2,
    baseScale: globalScale * typeScale,
  });

  return true;
}

function createPowerupMesh(type) {
  // Each powerup gets a unique, small 3D object that still fits
  // within roughly the same footprint so pickup behaviour stays
  // familiar.
  const group = new THREE.Group();

  // Small helper for consistent materials.
  function makeMat(color, emissiveIntensity, options) {
    return new THREE.MeshStandardMaterial(Object.assign({
      color,
      emissive: color,
      emissiveIntensity,
      metalness: 0.7,
      roughness: 0.25,
    }, options || {}));
  }

  if (type === 'gun') {
    // Gun pickup: reuse the shared pistol-round bullet geometry so
    // the icon matches the actual projectiles in flight.
    initBulletResources();
    const pickupBullet = new THREE.Mesh(bulletGeometry, [bulletCasingMaterial, bulletHeadMaterial]);
    pickupBullet.rotation.z = -Math.PI / 2;
    pickupBullet.scale.setScalar(2.3);

    // Center the visual inside the halo ring (lathe geometry can be
    // slightly off-center depending on profile/rotation).
    const bb = new THREE.Box3().setFromObject(pickupBullet);
    const center = new THREE.Vector3();
    bb.getCenter(center);
    pickupBullet.position.sub(center);
    pickupBullet.position.z = 0.10;
    group.add(pickupBullet);

    // Add a distinct "target halo" so gun reads immediately.
    const plateGeo = new THREE.CircleGeometry(1.45, 44);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      metalness: 0.9,
      roughness: 0.35,
      emissive: 0x1f2937,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.z = -0.22;
    group.add(plate);

    const haloGeo = new THREE.TorusGeometry(1.25, 0.07, 14, 54);
    const haloMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xfacc15,
      emissiveIntensity: 1.35,
      metalness: 0.6,
      roughness: 0.25,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.z = -0.06;
    group.add(halo);

    const tickGeo = new THREE.BoxGeometry(0.18, 0.55, 0.08);
    const tickMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 1.05,
      metalness: 0.4,
      roughness: 0.3,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ticks = [];
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(tickGeo, tickMat);
      const a = (i / 4) * Math.PI * 2;
      t.position.set(Math.cos(a) * 1.18, Math.sin(a) * 1.18, -0.02);
      t.rotation.z = a;
      group.add(t);
      ticks.push(t);
    }

    group.userData.gunHalo = halo;
    group.userData.gunTicks = ticks;
  } else if (type === 'slow') {
    // High-quality glass hourglass built once via LatheGeometry
    // and shared between pickups and the in-flight slow indicator.
    const hg = createHourglassMesh(false);
    return hg;
  } else if (type === 'double') {
    // Double pickup: upgraded "X" badge + orbiting twin orbs.
    const armGeo = new THREE.BoxGeometry(2.0, 0.35, 0.28);
    const armMat = makeMat(0xf97316, 1.1, {
      roughness: 0.2,
      metalness: 0.7,
    });
    const arm1 = new THREE.Mesh(armGeo, armMat);
    arm1.rotation.z = Math.PI / 4;
    group.add(arm1);
    const arm2 = new THREE.Mesh(armGeo, armMat);
    arm2.rotation.z = -Math.PI / 4;
    group.add(arm2);

    // Extruded into 3D by offsetting a second pair in Z.
    const arm3 = arm1.clone();
    arm3.position.z = 0.25;
    group.add(arm3);
    const arm4 = arm2.clone();
    arm4.position.z = -0.25;
    group.add(arm4);

    const badgeGeo = new THREE.CircleGeometry(1.35, 44);
    const badgeMat = new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      metalness: 0.9,
      roughness: 0.35,
      emissive: 0x1f2937,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const badge = new THREE.Mesh(badgeGeo, badgeMat);
    badge.position.z = -0.22;
    group.add(badge);

    const ringGeo = new THREE.TorusGeometry(1.25, 0.06, 14, 54);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xfb923c,
      emissiveIntensity: 1.2,
      metalness: 0.55,
      roughness: 0.25,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ringA = new THREE.Mesh(ringGeo, ringMat);
    ringA.position.z = -0.06;
    group.add(ringA);
    const ringB = new THREE.Mesh(ringGeo, ringMat.clone());
    ringB.position.z = 0.20;
    ringB.rotation.x = Math.PI / 2;
    group.add(ringB);

    const orbGeo = new THREE.SphereGeometry(0.14, 12, 10);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xfb923c,
      emissive: 0xf97316,
      emissiveIntensity: 1.35,
      metalness: 0.35,
      roughness: 0.2,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const orb1 = new THREE.Mesh(orbGeo, orbMat);
    const orb2 = new THREE.Mesh(orbGeo, orbMat.clone());
    orb1.position.set(0.8, 0, 0.08);
    orb2.position.set(-0.8, 0, -0.08);
    group.add(orb1);
    group.add(orb2);

    group.userData.doubleRings = [ringA, ringB];
    group.userData.doubleOrbs = [orb1, orb2];
    group.userData.doubleArmMat = armMat;
  } else if (type === 'cece') {
    // Mini Cece missile cluster.
    // IMPORTANT: keep Cece clearly distinct from the DOUBLE pickup.
    // DOUBLE is orange + rings; Cece should read as a WARNING missile
    // pickup (dark hardware + strong red ring + white/red ticks).
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.86,
      roughness: 0.38,
      emissive: 0x0b1220,
      emissiveIntensity: 0.22,
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xfda4af,
      emissive: 0xef4444,
      emissiveIntensity: 1.65,
      metalness: 0.55,
      roughness: 0.2,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const finMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.7,
      roughness: 0.4,
    });

    const bodyGeo = new THREE.CylinderGeometry(0.38, 0.38, 1.9, 10);
    const tipGeo = new THREE.ConeGeometry(0.5, 0.9, 10);
    const finGeo = new THREE.BoxGeometry(0.16, 0.6, 0.05);

    // Badge plate + warning ring so CECE reads clearly at speed.
    const badgeGeo = new THREE.CircleGeometry(1.45, 44);
    const badgeMat = new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      metalness: 0.9,
      roughness: 0.36,
      emissive: 0x1f2937,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const badge = new THREE.Mesh(badgeGeo, badgeMat);
    badge.position.z = -0.25;
    group.add(badge);

    const ringGeo = new THREE.TorusGeometry(1.25, 0.06, 14, 54);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 1.65,
      metalness: 0.45,
      roughness: 0.28,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = -0.06;
    group.add(ring);

    // Segmented warning ticks around the ring for instant readability.
    const tickGeo = new THREE.BoxGeometry(0.22, 0.55, 0.08);
    const tickMatA = new THREE.MeshStandardMaterial({
      color: 0xfef2f2,
      emissive: 0xfda4af,
      emissiveIntensity: 1.15,
      metalness: 0.35,
      roughness: 0.25,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const tickMatB = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 1.05,
      metalness: 0.35,
      roughness: 0.28,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ceceTicks = [];
    const tickCount = 8;
    const tickRadius = 1.18;
    for (let i = 0; i < tickCount; i++) {
      const tick = new THREE.Mesh(tickGeo, (i % 2 === 0) ? tickMatA : tickMatB);
      const a = (i / tickCount) * Math.PI * 2;
      tick.position.set(Math.cos(a) * tickRadius, Math.sin(a) * tickRadius, 0.02);
      tick.rotation.z = a;
      group.add(tick);
      ceceTicks.push(tick);
    }

    const missileCount = 3;
    const exhausts = [];
    for (let i = 0; i < missileCount; i++) {
      const m = new THREE.Group();

      const body = new THREE.Mesh(bodyGeo, baseMat);
      body.rotation.z = -Math.PI / 2;
      m.add(body);

      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.x = 1.1;
      tip.rotation.z = -Math.PI / 2;
      m.add(tip);

      const finTop = new THREE.Mesh(finGeo, finMat);
      finTop.position.set(-0.8, 0.35, 0);
      m.add(finTop);
      const finBottom = finTop.clone();
      finBottom.position.y = -finTop.position.y;
      m.add(finBottom);

      const angle = (i - (missileCount - 1) / 2) * 0.35;
      m.position.set(0, Math.sin(angle) * 0.5, Math.cos(angle) * 0.4);

      // Exhaust glow so the pickup reads as "weapon" not just red.
      const exhaustGeo = new THREE.ConeGeometry(0.22, 0.85, 14);
      const exhaustMat = new THREE.MeshStandardMaterial({
        color: 0xfda4af,
        emissive: 0xef4444,
        emissiveIntensity: 1.45,
        metalness: 0.1,
        roughness: 0.25,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
      exhaust.position.x = -1.25;
      exhaust.rotation.z = Math.PI / 2;
      m.add(exhaust);
      exhausts.push(exhaust);

      group.add(m);
    }

    group.userData.ceceExhausts = exhausts;
    group.userData.ceceRing = ring;
    group.userData.ceceTicks = ceceTicks;
  } else if (type === 'invincibility') {
    // Invincibility pickup: a clearly 3D sword + shield.
    // Keep the shield darker and the sword brighter so the two read
    // as distinct pieces even at high speed.

    // Back badge plate for contrast.
    const badgeGeo = new THREE.CircleGeometry(1.55, 44);
    const badgeMat = new THREE.MeshStandardMaterial({
      color: 0x050b18,
      metalness: 0.9,
      roughness: 0.4,
      emissive: 0x0f172a,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const badge = new THREE.Mesh(badgeGeo, badgeMat);
    badge.position.z = -0.32;
    group.add(badge);

    // Shield: thick disc + rim + boss.
    const shieldGeo = new THREE.CylinderGeometry(1.06, 1.14, 0.18, 44);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.92,
      roughness: 0.32,
      emissive: 0x0b1220,
      emissiveIntensity: 0.35,
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.rotation.x = Math.PI / 2;
    shield.position.z = 0.00;
    group.add(shield);

    const rimGeo = new THREE.TorusGeometry(1.18, 0.075, 14, 64);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x22d3ee,
      emissiveIntensity: 1.15,
      metalness: 0.55,
      roughness: 0.22,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.z = 0.05;
    group.add(rim);

    const bossGeo = new THREE.SphereGeometry(0.33, 20, 14);
    const bossMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.95,
      roughness: 0.18,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.95,
    });
    const boss = new THREE.Mesh(bossGeo, bossMat);
    boss.position.z = 0.18;
    group.add(boss);

    // Subtle emblem on shield face (cross) for stronger read.
    const emblemGeo = new THREE.BoxGeometry(0.2, 1.4, 0.08);
    const emblemMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      metalness: 0.9,
      roughness: 0.3,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const emblemV = new THREE.Mesh(emblemGeo, emblemMat);
    emblemV.position.z = 0.12;
    group.add(emblemV);
    const emblemH = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.08), emblemMat.clone());
    emblemH.position.z = 0.12;
    group.add(emblemH);

    // Sword: separate group so we can animate it subtly.
    const sword = new THREE.Group();
    sword.position.set(0.15, -0.05, 0.24);
    sword.rotation.z = -Math.PI / 10;

    const bladeGeo = new THREE.BoxGeometry(0.18, 2.05, 0.08);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xe5e7eb,
      metalness: 0.97,
      roughness: 0.12,
      emissive: 0x7dd3fc,
      emissiveIntensity: 0.35,
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = 0.2;
    sword.add(blade);

    const tipGeo = new THREE.ConeGeometry(0.13, 0.42, 14);
    const tip = new THREE.Mesh(tipGeo, bladeMat);
    tip.position.y = 1.33;
    sword.add(tip);

    // Fuller groove: thin emissive strip down the blade.
    const grooveGeo = new THREE.BoxGeometry(0.03, 1.55, 0.05);
    const grooveMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.95,
      metalness: 0.2,
      roughness: 0.25,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const groove = new THREE.Mesh(grooveGeo, grooveMat);
    groove.position.set(0, 0.18, 0.06);
    sword.add(groove);

    const guardGeo = new THREE.BoxGeometry(0.7, 0.12, 0.14);
    const guardMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.65,
      metalness: 0.88,
      roughness: 0.22,
    });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.y = -0.92;
    sword.add(guard);

    const gripGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.62, 12);
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.35,
      roughness: 0.55,
      emissive: 0x0b1220,
      emissiveIntensity: 0.15,
    });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.y = -1.32;
    sword.add(grip);

    const pommelGeo = new THREE.SphereGeometry(0.12, 14, 10);
    const pommel = new THREE.Mesh(pommelGeo, guardMat);
    pommel.position.y = -1.67;
    sword.add(pommel);

    group.add(sword);

    // Energy bubble + orbit rings (kept, but balanced so it doesn't
    // overwhelm the physical sword/shield silhouette).
    const bubbleGeo = new THREE.SphereGeometry(1.42, 22, 16);
    const bubbleMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1120,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.75,
      metalness: 0.0,
      roughness: 0.08,
      transmission: 0.75,
      ior: 1.4,
      thickness: 0.22,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
    bubble.position.z = -0.03;
    group.add(bubble);

    const orbitGeo = new THREE.TorusGeometry(1.52, 0.05, 12, 60);
    const orbitMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.95,
      metalness: 0.22,
      roughness: 0.28,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const orbitA = new THREE.Mesh(orbitGeo, orbitMat);
    orbitA.position.z = 0.18;
    group.add(orbitA);
    const orbitB = new THREE.Mesh(orbitGeo, orbitMat.clone());
    orbitB.position.z = 0.18;
    orbitB.rotation.x = Math.PI / 2;
    group.add(orbitB);

    group.userData.invBubble = bubble;
    group.userData.invOrbits = [orbitA, orbitB];
    group.userData.invSword = sword;
    group.userData.invRim = rim;
    group.userData.invBladeMat = bladeMat;
    group.userData.invGrooveMat = grooveMat;
  } else if (type === 'wormhole') {
    // Wormhole pickup uses the singleton premium portal so the
    // effect is obviously 3D (volume + tail + splatter) and we
    // avoid per-spawn shader/material creation.
    if (wormhole3D && wormhole3D.group) {
      wormhole3D.group.visible = true;
      wormhole3D.group.userData.wormholeBirth = performance.now() * 0.001;
      return wormhole3D.group;
    }
  } else {
    // Fallback: a simple glowing gem.
    const radius = 2.0;
    const geo = new THREE.IcosahedronGeometry(radius, 0);
    const mat = makeMat(0xffffff, 0.6);
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
  }

  return group;
}

function updatePowerupTimers(dt) {
  if (game.powerupCooldownTimer > 0) {
    game.powerupCooldownTimer = Math.max(0, game.powerupCooldownTimer - dt);
  }

  // Independent timer for extra powerups. IMPORTANT: powerups must
  // stay inside candle gaps, so this spawner also anchors into a
  // suitable upcoming pipe gap.
  const minLooseInterval = 4.5;
  const maxLooseInterval = 9.0;
  if (game.loosePowerupTimer > 0) {
    game.loosePowerupTimer = Math.max(0, game.loosePowerupTimer - dt);
  }
  if (game.loosePowerupTimer === 0 && game.redCandlesPassed >= 6) {
    const spawned = spawnLoosePowerup();
    // Next interval scales down slightly with speed so late-game
    // sees more pickups drifting between candles.
    const speedFactor = THREE.MathUtils.clamp(game.speed / (game.baseSpeed || 1), 1.0, 2.4);
    const baseInterval = minLooseInterval + Math.random() * (maxLooseInterval - minLooseInterval);
    // If no pipe was suitable to anchor into, retry sooner.
    game.loosePowerupTimer = (spawned ? baseInterval : 1.2) / speedFactor;
  }

  if (game.gunTimer > 0) {
    game.gunTimer = Math.max(0, game.gunTimer - dt);
  }
  if (game.slowTimer > 0) {
    game.slowTimer = Math.max(0, game.slowTimer - dt);
    // While Slow is active, periodically spawn ripple waves
    // around the rocket, echoing the 2D slow wave effect.
    game.slowWaveTimer += dt;
    const waveInterval = isMobile ? 0.28 : 0.20;
    const maxWaves = isMobile ? 3 : 5;
    if (game.slowWaveTimer >= waveInterval) {
      game.slowWaveTimer = 0;
      if (game.slowWaves.length < maxWaves) {
        spawnSlowWave();
      }
    }
    if (game.slowTimer === 0) {
      game.slowActive = false;
      // Apply permanent slow effect when the powerup ends,
      // mirroring the 2D game's long-term speed reduction.
      game.slowPermanentMultiplier *= 0.48875;
      game.slowPermanentMultiplier = Math.max(0.4, game.slowPermanentMultiplier);
      if (rocket && rocket.slowIndicator) {
        rocket.slowIndicator.visible = false;
      }
    }
  } else if (game.slowActive) {
    // Safety: if a timer bug ever leaves slowActive true with
    // zero timer, clear it.
    game.slowActive = false;
    if (rocket && rocket.slowIndicator) {
      rocket.slowIndicator.visible = false;
    }
  }

  // Wormhole-triggered slow burst: short and milder than the SLOW pickup.
  if (game.wormholeSlowTimer > 0) {
    game.wormholeSlowTimer = Math.max(0, game.wormholeSlowTimer - dt);
    // Spawn fewer slow waves so it still reads like slow-time.
    game.wormholeSlowWaveTimer += dt;
    const waveInterval = isMobile ? 0.45 : 0.34;
    const maxWaves = isMobile ? 2 : 3;
    if (game.wormholeSlowWaveTimer >= waveInterval) {
      game.wormholeSlowWaveTimer = 0;
      if (game.slowWaves.length < maxWaves) {
        spawnSlowWave();
      }
    }
  } else {
    game.wormholeSlowWaveTimer = 0;
  }
  if (game.doubleTimer > 0) {
    game.doubleTimer = Math.max(0, game.doubleTimer - dt);
    if (game.doubleTimer === 0) game.doubleScoreActive = false;
  }
  if (game.ceceTimer > 0) {
    game.ceceTimer = Math.max(0, game.ceceTimer - dt);
    if (game.ceceTimer === 0) game.ceceActive = false;
  }
  if (game.invTimer > 0) {
    game.invTimer = Math.max(0, game.invTimer - dt);
    if (game.invTimer === 0) {
      game.invincible = false;
      stopShieldLoop();
    }
  }
}

function updatePowerups(dt, rocketBox) {
  // Rebuild the list of active wormhole gravity fields each
  // frame so starfield lensing can respond to live portals.
  if (activeWormholeLenses.length) activeWormholeLenses.length = 0;

  // Scratch objects to avoid per-frame allocations.
  const tmpPowerupPos = __tmpPowerupPos;
  const tmpPowerupBox = __tmpPowerupBox;

  for (let i = game.powerups.length - 1; i >= 0; i--) {
    const p = game.powerups[i];
    p.age = (p.age || 0) + dt;

    // Drift left with the world, but let pickups linger a bit
    // longer than pipes so they feel like floating rewards.
    p.mesh.position.x -= game.speed * dt * 10.5;

    // Gentle vertical bobbing and slight depth sway scaled by
    // speed so pickups feel more alive in 3D space.
    // IMPORTANT: the rocket does not steer in world Z, so keep
    // pickup motion constrained so it never becomes "unobtainable"
    // due to depth offset at the moment it passes the rocket.
    const speedFactor = Math.min(game.multiplier * game.slowPermanentMultiplier, 4.5);
    const bobAmp = 1.5 + speedFactor * 0.5;
    const rawSwayAmpZ = 1.1 + speedFactor * 0.3;
    const t = p.age * 2.3 + (p.phase || 0);

    const baseY = (p.baseY != null ? p.baseY : p.mesh.position.y);
    let y = baseY + Math.sin(t) * bobAmp;

    // Keep pickups inside the same controllable Y band as the gaps.
    const POWERUP_REACH_MARGIN_Y = 1.2;
    const minReachY = PLAYFIELD_MIN_Y + POWERUP_REACH_MARGIN_Y;
    const maxReachY = PLAYFIELD_MAX_Y - POWERUP_REACH_MARGIN_Y;
    y = THREE.MathUtils.clamp(y, minReachY, maxReachY);

    // If this pickup spawned in a specific pipe gap, keep its motion
    // inside that gap so "edge" spawns don't drift into candles.
    // Wormholes are always locked to dead-center of the gap.
    if (p.type === 'wormhole' && p.gapCenter != null) {
      y = p.gapCenter;
    } else if (p.gapCenter != null && p.gapHalf != null) {
      const gapEdge = (p.gapEdgeMargin != null) ? p.gapEdgeMargin : 1.0;
      const gapMin = p.gapCenter - p.gapHalf + gapEdge;
      const gapMax = p.gapCenter + p.gapHalf - gapEdge;
      if (gapMax > gapMin) {
        y = THREE.MathUtils.clamp(y, gapMin, gapMax);
      }
    }
    p.mesh.position.y = y;

    // Cap Z sway so the pickup's analytic volume always overlaps
    // the rocket's Z extent (rocket Z is always 0).
    let z = Math.sin(t * 0.9 + 1.3) * rawSwayAmpZ;
    if (p.type === 'wormhole') {
      // Keep the portal centered in depth so it reads as filling the gap.
      z = 0;
    }
    if (rocketBox) {
      const rocketHalfZ = Math.max(0.001, (rocketBox.max.z - rocketBox.min.z) * 0.5);
      const baseScale = p.baseScale || 1;
      let pulseStrength = 0.14;
      if (p.type === 'slow') pulseStrength = 0.10;
      else if (p.type === 'double') pulseStrength = 0.18;
      else if (p.type === 'cece') pulseStrength = 0.2;
      else if (p.type === 'invincibility') pulseStrength = 0.16;
      else if (p.type === 'wormhole') pulseStrength = 0.08;

      let baseR = 1.0;
      if (p.type === 'slow') baseR = 1.15;
      if (p.type === 'cece') baseR = 1.1;
      else if (p.type === 'invincibility') baseR = 1.1;
      else if (p.type === 'wormhole') baseR = 1.35;

      // Conservative lower bound of the pickup radius over its pulse cycle.
      const minPulse = Math.max(0.5, 1.0 - pulseStrength);
      const rMin = baseR * baseScale * minPulse;

      // Ensure overlap: |z| <= rMin + rocketHalfZ - epsilon.
      const zCap = Math.max(0.0, rMin + rocketHalfZ - 0.10);
      if (zCap === 0.0) {
        z = 0;
      } else {
        z = THREE.MathUtils.clamp(z, -zCap, zCap);
      }
    }
    p.mesh.position.z = z;

    // Pulsing scale and rotation, with subtle per-type tuning so
    // each pickup feels distinct while sharing a common motion
    // language.
    const baseScale = p.baseScale || 1;
    let pulseStrength = 0.14;
    let rotYBase = 1.8;
    let rotYScale = 0.4;
    let rotX = 0.9;

    if (p.type === 'slow') {
      pulseStrength = 0.10;
      rotYBase = 1.1;
      rotYScale = 0.25;
      rotX = 0.6;
    } else if (p.type === 'double') {
      pulseStrength = 0.18;
      rotYBase = 2.0;
      rotYScale = 0.55;
      rotX = 1.1;
    } else if (p.type === 'cece') {
      pulseStrength = 0.2;
      rotYBase = 2.2;
      rotYScale = 0.6;
      rotX = 1.3;
    } else if (p.type === 'invincibility') {
      pulseStrength = 0.16;
      rotYBase = 1.6;
      rotYScale = 0.4;
      rotX = 1.0;
    } else if (p.type === 'wormhole') {
      pulseStrength = 0.08;
      rotYBase = 2.6;
      rotYScale = 0.7;
      rotX = 1.4;
    }

    let pulse = 1.0 + pulseStrength * Math.sin(p.age * 3.2 * (0.7 + speedFactor * 0.4));
    let finalScale = baseScale * pulse;
    p.mesh.scale.setScalar(finalScale);
    if (p.type === 'slow') {
      // Keep the pickup hourglass sand subtly moving so the
      // collectible itself hints at slow-time.
      updateHourglassSand(p.mesh, dt, false);
    }

    // Per-powerup accent animations for readability at speed.
    if (p.type === 'gun') {
      const halo = p.mesh.userData && p.mesh.userData.gunHalo;
      const ticks = p.mesh.userData && p.mesh.userData.gunTicks;
      if (halo && halo.material) {
        halo.rotation.z += dt * 2.2;
        halo.material.opacity = 0.55 + 0.22 * Math.sin(p.age * 4.6);
        if (halo.material.emissiveIntensity != null) {
          halo.material.emissiveIntensity = 1.1 + 0.6 * (0.5 + 0.5 * Math.sin(p.age * 5.2));
        }
      }
      if (ticks && ticks.length) {
        const tickPulse = 0.55 + 0.25 * Math.sin(p.age * 6.1);
        for (let k = 0; k < ticks.length; k++) {
          const tMesh = ticks[k];
          if (tMesh && tMesh.material) {
            tMesh.material.opacity = tickPulse;
          }
        }
      }
    } else if (p.type === 'double') {
      const rings = p.mesh.userData && p.mesh.userData.doubleRings;
      const orbs = p.mesh.userData && p.mesh.userData.doubleOrbs;
      const armMat = p.mesh.userData && p.mesh.userData.doubleArmMat;
      if (rings && rings.length) {
        if (rings[0]) rings[0].rotation.z += dt * 1.8;
        if (rings[1]) rings[1].rotation.y += dt * 1.4;
        for (let k = 0; k < rings.length; k++) {
          const r = rings[k];
          if (r && r.material) {
            r.material.opacity = 0.52 + 0.18 * Math.sin(p.age * 4.0 + k * 1.2);
          }
        }
      }
      if (orbs && orbs.length >= 2) {
        const a = p.age * 3.2;
        orbs[0].position.x = Math.cos(a) * 0.85;
        orbs[0].position.y = Math.sin(a) * 0.35;
        orbs[1].position.x = Math.cos(a + Math.PI) * 0.85;
        orbs[1].position.y = Math.sin(a + Math.PI) * 0.35;
      }
      if (armMat && armMat.emissiveIntensity != null) {
        armMat.emissiveIntensity = 0.95 + 0.55 * (0.5 + 0.5 * Math.sin(p.age * 5.0));
      }
    } else if (p.type === 'cece') {
      const exhausts = p.mesh.userData && p.mesh.userData.ceceExhausts;
      const ring = p.mesh.userData && p.mesh.userData.ceceRing;
      const ticks = p.mesh.userData && p.mesh.userData.ceceTicks;
      if (exhausts && exhausts.length) {
        const pulse = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(p.age * 10.5));
        for (let k = 0; k < exhausts.length; k++) {
          const e = exhausts[k];
          if (e && e.material) {
            e.material.opacity = pulse;
            if (e.material.emissiveIntensity != null) {
              e.material.emissiveIntensity = 0.9 + 0.9 * pulse;
            }
          }
        }
      }
      if (ticks && ticks.length) {
        const tickPulse = 0.55 + 0.25 * Math.sin(p.age * 8.4);
        for (let k = 0; k < ticks.length; k++) {
          const tMesh = ticks[k];
          if (tMesh && tMesh.material) {
            tMesh.material.opacity = tickPulse;
            if (tMesh.material.emissiveIntensity != null) {
              tMesh.material.emissiveIntensity = 0.85 + 0.65 * tickPulse;
            }
          }
        }
      }
      if (ring) {
        ring.rotation.z += dt * 1.9;
        if (ring.material) {
          ring.material.opacity = 0.55 + 0.2 * Math.sin(p.age * 6.0);
          if (ring.material.emissiveIntensity != null) {
            ring.material.emissiveIntensity = 0.85 + 0.65 * (0.5 + 0.5 * Math.sin(p.age * 7.1));
          }
        }
      }
    } else if (p.type === 'invincibility') {
      const bubble = p.mesh.userData && p.mesh.userData.invBubble;
      const orbits = p.mesh.userData && p.mesh.userData.invOrbits;
      const sword = p.mesh.userData && p.mesh.userData.invSword;
      const rim = p.mesh.userData && p.mesh.userData.invRim;
      const bladeMat = p.mesh.userData && p.mesh.userData.invBladeMat;
      const grooveMat = p.mesh.userData && p.mesh.userData.invGrooveMat;
      if (bubble && bubble.material) {
        const bubblePulse = 0.18 + 0.08 * (0.5 + 0.5 * Math.sin(p.age * 3.8));
        bubble.material.opacity = bubblePulse;
        if (bubble.material.emissiveIntensity != null) {
          bubble.material.emissiveIntensity = 0.7 + 0.5 * (0.5 + 0.5 * Math.sin(p.age * 4.2));
        }
      }
      if (orbits && orbits.length) {
        if (orbits[0]) orbits[0].rotation.z += dt * 2.0;
        if (orbits[1]) orbits[1].rotation.x += dt * 2.2;
        for (let k = 0; k < orbits.length; k++) {
          const o = orbits[k];
          if (o && o.material) {
            o.material.opacity = 0.55 + 0.2 * Math.sin(p.age * 4.5 + k * 1.4);
          }
        }
      }
      // Subtle sword "shine" and sway to emphasize the silhouette.
      if (sword) {
        sword.rotation.z = -Math.PI / 10 + 0.08 * Math.sin(p.age * 2.6);
      }
      if (rim && rim.material) {
        rim.material.opacity = 0.62 + 0.2 * Math.sin(p.age * 4.0);
        if (rim.material.emissiveIntensity != null) {
          rim.material.emissiveIntensity = 0.9 + 0.6 * (0.5 + 0.5 * Math.sin(p.age * 5.1));
        }
      }
      if (bladeMat && bladeMat.emissiveIntensity != null) {
        bladeMat.emissiveIntensity = 0.18 + 0.35 * (0.5 + 0.5 * Math.sin(p.age * 6.2));
      }
      if (grooveMat && grooveMat.opacity != null) {
        grooveMat.opacity = 0.45 + 0.2 * Math.sin(p.age * 6.7);
      }
    }

    if (p.type === 'wormhole') {
      // Signature portal animation: keep the gate oriented along
      // the flight axis, with a gentle self-spin instead of fully
      // billboarding to the camera so it reads consistently in
      // both vertical and horizontal views.
      // (Portal internal spin is handled by the Wormhole3D instance.)

      const toRocket = (rocket && rocket.group)
        ? rocket.group.position.distanceTo(p.mesh.position)
        : 999;
      const approach = Math.max(0, Math.min(1, (40 - toRocket) / 40));

      // Brief telegraph as it spawns so it clearly reads as an
      // important portal.
      const telegraphT = Math.max(0, Math.min(1, p.age / 0.45));
      // Keep the telegraph subtle so the portal doesn't balloon in size.
      const teleScale = 0.98 + 0.06 * (1.0 - Math.cos(telegraphT * Math.PI)) * 0.5;

      // Only a tiny approach boost; avoid turning into a huge white disc.
      const distBoost = 1.0 + approach * 0.08;
      finalScale = baseScale * pulse * teleScale * distBoost;
      // User request: make the portal another 2x bigger.
      finalScale *= 2.0;
      p.mesh.scale.setScalar(finalScale);

      // Feed a soft gravity field into the global list so the
      // starfield can locally bend/light-warp around portals.
      if (activeWormholeLenses.length < 3) {
        p.mesh.getWorldPosition(tmpWormholePos);
        // Keep the surrounding warp tighter so it matches the smaller portal.
        const baseRadius = 70;
        const radius = baseRadius * (0.9 + approach * 0.25);
        const depth = 90;
        const strength = 0.45 + approach * 0.35;
        activeWormholeLenses.push({
          x: tmpWormholePos.x,
          y: tmpWormholePos.y,
          z: tmpWormholePos.z,
          radius,
          depth,
          strength,
        });
      }

      // Simple portal: keep it clearly visible (the disk is dark by design).
      const baseIntensity = 0.95 + approach * 0.35;
      const surge = game.challengeActive ? 0.12 : 0.0;
      const intensity = Math.min(1.35, baseIntensity + surge);

      // Drive the premium portal instance with approach-based intensity.
      const fx = (p.mesh && p.mesh.userData) ? p.mesh.userData.wormhole3D : null;
      if (fx && typeof fx.setIntensity === 'function') {
        if (typeof fx.setPortalScale === 'function') {
          fx.setPortalScale(finalScale);
        }
        fx.setIntensity(intensity);
        // Make tail slightly stronger as you approach so it reads.
        if (typeof fx.setTailStrength === 'function') {
          fx.setTailStrength(0.95 + approach * 0.35);
        }
        if (typeof fx.setTailArcLength01 === 'function') {
          fx.setTailArcLength01(0.62 + approach * 0.20);
        }
      }
    } else {
      p.mesh.rotation.y += dt * (rotYBase + speedFactor * rotYScale);
      p.mesh.rotation.x += dt * rotX;
    }

    if (p.mesh.position.x < -60) {
      if (p.type === 'wormhole') {
        // Keep singleton mounted; just hide it.
        p.mesh.visible = false;
      } else {
        scene.remove(p.mesh);
      }
      game.powerups.splice(i, 1);
      continue;
    }

    // Use a small analytic pickup volume centered on the powerup,
    // so decorative glows/frames don't make pickups trigger early.
    // Scale with the mesh's current pulsing scale.
    const s = (p.mesh && p.mesh.scale) ? (p.mesh.scale.x || 1) : 1;
    let baseR = 1.0;
    if (p.type === 'slow') baseR = 1.15;
    if (p.type === 'cece') baseR = 1.1;
    else if (p.type === 'invincibility') baseR = 1.1;
    else if (p.type === 'wormhole') baseR = 1.35;
    const r = baseR * s;

    p.mesh.getWorldPosition(tmpPowerupPos);
    tmpPowerupBox.min.set(tmpPowerupPos.x - r, tmpPowerupPos.y - r, tmpPowerupPos.z - r);
    tmpPowerupBox.max.set(tmpPowerupPos.x + r, tmpPowerupPos.y + r, tmpPowerupPos.z + r);

    if (rocketBox && rocketBox.intersectsBox(tmpPowerupBox)) {
      if (p.type === 'wormhole') {
        activateWormhole(p);
      } else {
        activatePowerup(p.type);
      }
      if (p.type === 'wormhole') {
        p.mesh.visible = false;
      } else {
        scene.remove(p.mesh);
      }
      game.powerups.splice(i, 1);
    }
  }
}

function updateHourglassSand(group, dt, isIndicator) {
  if (!group || !group.userData) return;
  const sandTop = group.userData.sandTop;
  const sandBottom = group.userData.sandBottom;
  const sandStream = group.userData.sandStream;
  if (!sandTop || !sandBottom || !sandStream) return;

  const speed = isIndicator ? 0.5 : 0.35;
  const phase = group.userData.sandPhase || 0;
  const t = (phase + performance.now() * 0.001 * speed) % 1;

  // Progress 0..1: sand drains from top to bottom, looping.
  const topAmount = Math.max(0, 1 - t * 1.2);
  const bottomAmount = Math.min(1, t * 1.2);

  sandTop.scale.y = 0.25 + topAmount * 0.75;
  sandBottom.scale.y = 0.2 + bottomAmount * 0.9;

  sandStream.visible = t > 0.05 && t < 0.95;
  const streamPulse = 0.6 + 0.4 * Math.sin(t * Math.PI * 2);
  sandStream.scale.y = streamPulse;
}

function activateWormhole(p) {
  const current = game.axisMode || 'horizontal';
  const target = current === 'vertical' ? 'horizontal' : 'vertical';
  // Play a distinct entry/exit cue as the view flips. Use a
  // short cooldown so back-to-back portals don't spam audio.
  playSfx('wormhole', 0.9, 400);

  // Apply a short, half-strength slow-time burst when the wormhole triggers.
  // This does not replace the full SLOW powerup (which applies a permanent
  // multiplier on expiry).
  game.wormholeSlowTimer = WORMHOLE_SLOW_DURATION;
  game.wormholeSlowWaveTimer = 0;

  beginAxisTransition(target);
}

function activatePowerup(type) {
  if (type === 'gun') {
    game.gunTimer = GUN_DURATION * 0.8;
  } else if (type === 'slow') {
    game.slowTimer = SLOW_DURATION * 0.9;
    game.slowActive = true;
    if (rocket && rocket.slowIndicator) {
      rocket.slowIndicator.visible = true;
      // Reset sand cycle so each activation starts fresh.
      rocket.slowIndicator.userData.sandPhase = 0;
    }
  } else if (type === 'double') {
    game.doubleTimer = DOUBLE_DURATION * 0.85;
    game.doubleScoreActive = true;
    game.multiplier *= 1.08;
  } else if (type === 'cece') {
    game.ceceTimer = CECE_DURATION * 0.9;
    game.ceceActive = true;
    // Initial Cece volley: a focused missile from the nose,
    // with a sustained stream handled in updateCeceRockets.
    const fanCount = 1;
    for (let i = 0; i < fanCount; i++) {
      spawnCeceRocket(i, fanCount);
    }
    game.lastCeceShotTime = 0;
  } else if (type === 'invincibility') {
    // Slightly longer invincibility window so the minigun
    // phase has more room to breathe.
    game.invTimer = INVINC_DURATION * 0.975; // ~30% longer than before
    game.invincible = true;
    // Strong initial visual cue similar to 2D's flash.
    game.nearMissFlash = Math.max(game.nearMissFlash || 0, 1.0);
    spawnInvincLaserBeam();
    startShieldLoop();
  }

  if (type === 'gun') playSfx('shoot', 0.7, 40);
  else if (type === 'slow') playSfx('slow', 0.7, 80);
  else if (type === 'double') playSfx('double', 1.0, 80);
  else if (type === 'cece') playSfx('cece', 0.9, 80);
  else if (type === 'invincibility') playSfx('invincibility', 0.9, 120);
}

function incrementScore(isTarget, isRedCandle, isDestroyed) {
  let baseScore = 1;
  if (isTarget) baseScore += 1;

  // Brief challenge windows award a little extra per pipe so
  // they feel tangibly rewarding to chase.
  if (game.challengeActive) baseScore += 1;

  const scoreIncrease = baseScore * game.combo;
  game.score += scoreIncrease;

  if (isRedCandle) {
    game.redCandlesPassed++;
  }

  // Deterministic combo behaviour: reward consistency and near-misses
  // instead of randomness. Passing a candle always grows combo slowly;
  // near-misses add extra in handleNearMiss().
  if (isRedCandle) {
    game.combo += 1;
  }

  // Prevent combo from growing without bound
  game.combo = Math.min(game.combo, 50);
  game.bestCombo = Math.max(game.bestCombo, game.combo);

  // Score-driven speed ramp adapted from the 2D game: higher scores
  // gradually increase the underlying multiplier, with a small extra
  // bump for candles destroyed by weapons.
  const progressFactor = Math.min(game.score / 100, 1.0);
  let speedIncrease = SPEED_INCREMENT_MIN + (progressFactor * (SPEED_INCREMENT_MAX - SPEED_INCREMENT_MIN));

  // Lower speed ramping on mobile to keep things smooth.
  if (isMobile) speedIncrease *= 0.5;

  // Destroyed red candles nudge speed a bit more than passes.
  if (isDestroyed && isRedCandle) {
    speedIncrease *= 0.75;
  }

  let newMultiplier = game.multiplier + speedIncrease;

  // Phase- and challenge-aware cap so deep runs feel faster but
  // never unmanageably extreme.
  const phaseForCap = getPhase();
  let maxMultiplier = 3.2 + phaseForCap * 0.6;
  if (game.challengeActive) maxMultiplier += 0.4;
  maxMultiplier = Math.min(maxMultiplier, 5.0);
  game.multiplier = Math.min(newMultiplier, maxMultiplier);

  // One-time milestone bonuses and callouts for progression
  // and streak targets.
  checkMilestones();
}

function handleNearMiss() {
  // Extra combo bump and score bonus for threading tight gaps;
  // make near-misses a bigger driver of progression.
  game.combo += 3;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  game.nearMissFlash = 1.0;

  // Bigger score bonus that scales with combo so sustained
  // risky flying is heavily rewarded.
  const comboSafe = Math.max(1, game.combo || 1);
  const bonus = 1 + Math.floor(comboSafe * 0.4);
  game.score += bonus;

  // Brief HUD callout so players understand why score jumped.
  // Do not overwrite higher-priority messages like SURGE prompts
  // or game over / pause text.
  if (!hud.message || game.over || game.paused || game.challengeActive) return;
  const current = hud.message.textContent || '';
  if (current.trim() !== '') return;
  game.nearMissMsgTimer = 0.9;
  setCenterMessage('Near miss! +' + bonus + ' bonus', true);
}

function maybeShowMilestoneMessage(text) {
  if (!hud.message || game.over || game.paused) return;
  const current = hud.message.textContent || '';
  if (current.trim() !== '') return; // don't overwrite existing transient messages
  setCenterMessage(text, true);
}

function checkMilestones() {
  const candles = game.redCandlesPassed || 0;
  const bestCombo = game.bestCombo || 1;

  if (!game.milestoneCandles10 && candles >= 10) {
    game.milestoneCandles10 = true;
    game.score += 5;
    maybeShowMilestoneMessage('Checkpoint: 10 candles cleared! +5');
  }
  if (!game.milestoneCandles25 && candles >= 25) {
    game.milestoneCandles25 = true;
    game.score += 10;
    maybeShowMilestoneMessage('Checkpoint: 25 candles! +10');
  }
  if (!game.milestoneCandles40 && candles >= 40) {
    game.milestoneCandles40 = true;
    game.score += 15;
    maybeShowMilestoneMessage('Deep run: 40 candles! +15');
  }

  if (!game.milestoneCombo10 && bestCombo >= 10) {
    game.milestoneCombo10 = true;
    game.score += 4;
    maybeShowMilestoneMessage('Streak: x10 combo! +4');
  }
  if (!game.milestoneCombo20 && bestCombo >= 20) {
    game.milestoneCombo20 = true;
    game.score += 8;
    maybeShowMilestoneMessage('Monster streak: x20 combo! +8');
  }

}

function createBulletTextures() {
  // Subtle roughness/scratch texture aligned along the bullet's
  // length. Kept low-frequency to avoid shimmering on mobile.
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#dddddd';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#c4c4c4';
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size;
    const len = 40 + Math.random() * 80;
    const y = Math.random() * (size - len);
    ctx.globalAlpha = 0.16 + Math.random() * 0.12;
    ctx.fillRect(x, y, 1 + Math.random() * 1.2, len);
  }

  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function initBulletResources() {
  if (!bulletGeometry) {
    // Short, thick pistol-style FMJ round: flat brass base and
    // casing with a rounded copper ogive nose. Proportions are
    // closer to a .45 ACP so the projectile reads as a chunky
    // handgun round rather than a long rifle bullet.
    const points = [];

    // Overall dimensions in local lathe space (Y = length).
    const radius = 0.32;     // casing radius (thick, squat)
    const length = 0.84;     // total length ≈ 1.3× casing diameter
    const baseY = 0.0;
    const casingLen = length * 0.6; // brass body
    const headLen = length - casingLen; // copper jacket/ogive

    // Flat base with a tiny chamfer and extraction groove.
    const baseChamfer = 0.02;
    const grooveDepth = radius * 0.86;
    const grooveStartY = baseY + 0.04;
    const grooveMidY = baseY + 0.09;
    const grooveEndY = baseY + 0.14;

    // Centre of the base (axis) then outer edge.
    points.push(new THREE.Vector2(0.0, baseY));
    points.push(new THREE.Vector2(radius * 0.98, baseY + baseChamfer));

    // Slightly recessed extraction groove.
    points.push(new THREE.Vector2(radius, grooveStartY));
    points.push(new THREE.Vector2(grooveDepth, grooveMidY));
    points.push(new THREE.Vector2(radius, grooveEndY));

    // Main cylindrical casing body with a subtle taper toward
    // the neck where the copper jacket begins.
    const bodyTopY = casingLen * 0.9;
    const neckY = casingLen;
    const neckRadius = radius * 0.9;
    points.push(new THREE.Vector2(radius, bodyTopY));
    points.push(new THREE.Vector2(radius * 0.98, neckY - 0.02));
    points.push(new THREE.Vector2(neckRadius, neckY));

    // Copper ogive nose: smooth, rounded, no sharp tip. Keep the
    // minimum radius non-zero so the silhouette stays hemispherical
    // rather than needle-like.
    const headBaseRadius = neckRadius * 0.98;
    const ogiveSteps = 8;
    for (let i = 1; i <= ogiveSteps; i++) {
      const t = i / ogiveSteps;
      const y = neckY + t * headLen;
      const falloff = Math.pow(t, 1.35);
      const r = headBaseRadius * (1.0 - 0.92 * falloff);
      const minR = radius * 0.08;
      points.push(new THREE.Vector2(Math.max(r, minR), y));
    }

    bulletGeometry = new THREE.LatheGeometry(points, 56);
    // Align along rocket forward (+X).
    bulletGeometry.rotateZ(-Math.PI / 2);
    bulletGeometry.computeVertexNormals();

    // Tag triangles ahead of the brass casing length as the copper
    // jacket so we can use a two-material array on the mesh.
    const splitX = casingLen; // after rotation, X ≈ original Y
    const posAttr = bulletGeometry.getAttribute('position');
    const indexAttr = bulletGeometry.getIndex();
    if (indexAttr && posAttr) {
      bulletGeometry.clearGroups();
      const idxCount = indexAttr.count;
      let currentMat = -1;
      let groupStart = 0;
      for (let i = 0; i < idxCount; i += 3) {
        const ia = indexAttr.getX(i);
        const ib = indexAttr.getX(i + 1);
        const ic = indexAttr.getX(i + 2);
        const ax = posAttr.getX(ia);
        const bx = posAttr.getX(ib);
        const cx = posAttr.getX(ic);
        const avgX = (ax + bx + cx) / 3;
        // Material 0 = brass casing, 1 = copper head.
        const matIndex = avgX > splitX ? 1 : 0;
        if (currentMat === -1) {
          currentMat = matIndex;
          groupStart = i;
        } else if (matIndex !== currentMat) {
          bulletGeometry.addGroup(groupStart, i - groupStart, currentMat);
          groupStart = i;
          currentMat = matIndex;
        }
      }
      if (currentMat !== -1 && idxCount > groupStart) {
        bulletGeometry.addGroup(groupStart, idxCount - groupStart, currentMat);
      }
    }
  }

  if (!bulletHeadMaterial || !bulletCasingMaterial) {
    const roughTex = createBulletTextures();

    // Brass casing: warm, realistic brass with a modest glow so
    // it reads metallic but stays easy to pick out.
    bulletCasingMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe0b15a,
      emissive: 0xb97a28,
      emissiveIntensity: 0.45,
      metalness: 1.0,
      roughness: 0.2,
      roughnessMap: roughTex || null,
      clearcoat: 0.5,
      clearcoatRoughness: 0.18,
    });

    // Copper-jacketed head: slightly deeper copper with a bit
    // more emissive so the nose glows slightly brighter.
    bulletHeadMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xb7743b,
      emissive: 0xe89b3a,
      emissiveIntensity: 0.75,
      metalness: 1.0,
      roughness: 0.18,
      roughnessMap: roughTex || null,
      clearcoat: 0.4,
      clearcoatRoughness: 0.2,
    });
  }

  // Dedicated laser projectile for invincibility: a short, bright
  // energy slug aligned along +X so it still uses the same spawn
  // and collision logic as regular bullets but reads completely
  // differently on screen.
  if (!laserBulletGeometry) {
    const length = 3.6;
    const thickness = 0.55;
    laserBulletGeometry = new THREE.BoxGeometry(length, thickness, thickness * 0.7);
  }
  if (!laserBulletMaterial) {
    laserBulletMaterial = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.8,
      metalness: 0.4,
      roughness: 0.15,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
    });
  }
}

function initBulletPool() {
  if (bulletPoolInitialised || !scene) return;
  initBulletResources();
  for (let i = 0; i < MAX_BULLETS; i++) {
    // Root node that will carry either a physical bullet mesh or a
    // laser slug, depending on mode. Collisions and transforms use
    // the root so we can freely swap visuals.
    const root = new THREE.Group();

    const bulletMesh = new THREE.Mesh(bulletGeometry, [bulletCasingMaterial, bulletHeadMaterial]);
    // Enlarge the pistol round so its short, thick silhouette is
    // very obvious and easy to track in motion.
    bulletMesh.scale.setScalar(2.0);
    root.add(bulletMesh);

    const laserMesh = new THREE.Mesh(laserBulletGeometry, laserBulletMaterial);
    // Slightly longer and slimmer so it reads as a beam pulse.
    laserMesh.scale.set(1.4, 1.0, 1.0);
    laserMesh.visible = false;
    root.add(laserMesh);

    root.visible = false;
    scene.add(root);
    game.bullets.push({
      mesh: root,
      bulletMesh,
      laserMesh,
      mode: 'gun',
      active: false,
      life: 0,
      maxLife: BULLET_MAX_LIFE,
      vx: 0,
      vy: 0,
    });
  }
  bulletPoolInitialised = true;
}

function spawnBullet() {
  if (!rocket || !scene) return;
  if (!bulletPoolInitialised) {
    initBulletPool();
  }
  if (!bulletPoolInitialised || game.bullets.length === 0) return;

  const b = game.bullets[nextBulletIndex];
  nextBulletIndex = (nextBulletIndex + 1) % game.bullets.length;

  const noseWorld = new THREE.Vector3(4.5, 0, 0);
  rocket.group.localToWorld(noseWorld);
  b.mesh.position.copy(noseWorld);

  // Travel in the rocket's true forward direction so bullets track
  // the ship across both orientation modes.
  const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(rocket.group.quaternion).normalize();
  b.vx = forward.x * BULLET_SPEED;
  b.vy = forward.y * BULLET_SPEED;

  b.life = 0;
  b.maxLife = BULLET_MAX_LIFE;
  b.active = true;
  b.mesh.visible = true;

  // Decide which visual to use: standard brass/copper bullet for
  // regular gunfire, or a bright laser slug while invincibility is
  // active. Behaviour (speed, collisions) stays identical.
  const useLaser = !!(game.invTimer > 0 && game.invincible);
  b.mode = useLaser ? 'invLaser' : 'gun';
  if (b.bulletMesh) {
    b.bulletMesh.visible = !useLaser;
  }
  if (b.laserMesh) {
    b.laserMesh.visible = useLaser;
  }

  // Align visual orientation so the long axis points along the
  // actual velocity vector (forward), not down.
  b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), forward);

  // Match 2D feel: each bullet plays a light shoot SFX. When
  // invincibility is active, swap to the invincibility fire
  // SFX so every minigun shot gets its own burst.
  if (game.invTimer > 0 && game.invincible) {
    playSfx('invincFire', 0.95);
  } else {
    playSfx('shoot', 0.45, 30);
  }
}

function spawnInvincLaserBeam() {
  if (!rocket || !scene) return;

  // Lazily create a long, bright beam geometry aligned with the
  // rocket's forward (+X) axis so invincibility feels like a
  // laser cannon firing.
  if (!invincBeamGeometry) {
    const length = 40;
    const thickness = 0.7;
    invincBeamGeometry = new THREE.BoxGeometry(length, thickness, thickness * 0.9);
  }
  if (!invincBeamMaterial) {
    invincBeamMaterial = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.5,
      metalness: 0.5,
      roughness: 0.15,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
  }

  const beam = new THREE.Mesh(invincBeamGeometry, invincBeamMaterial.clone());
  // Point along +X, starting at the rocket nose.
  beam.rotation.z = -Math.PI / 2;

  const noseWorld = new THREE.Vector3(4.5, 0, 0);
  rocket.group.localToWorld(noseWorld);
  beam.position.copy(noseWorld);

  scene.add(beam);

  const life = 0.28;
  game.invBeams.push({ mesh: beam, life, maxLife: life });
}

function spawnCeceRocket(spreadIndex, spreadCount) {
  const baseSpeed = 55;
  const maxSpread = 0.18;

  const noseWorld = new THREE.Vector3(4.5, 0, 0);
  rocket.group.localToWorld(noseWorld);

  // Build a small missile: dark body, hot tip and tail fins.
  const group = new THREE.Group();

  const bodyGeo = new THREE.CylinderGeometry(0.55, 0.55, 3.0, 10);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.8,
    roughness: 0.35,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.rotation.z = -Math.PI / 2;
  group.add(bodyMesh);

  const tipGeo = new THREE.ConeGeometry(0.7, 1.4, 10);
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xf97316,
    emissiveIntensity: 1.0,
    metalness: 0.7,
    roughness: 0.25,
  });
  const tipMesh = new THREE.Mesh(tipGeo, tipMat);
  tipMesh.position.x = 2.0;
  tipMesh.rotation.z = -Math.PI / 2;
  group.add(tipMesh);

  const finGeo = new THREE.BoxGeometry(0.2, 0.9, 0.06);
  const finMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.7,
    roughness: 0.4,
  });
  const finOffsetX = -1.7;
  const finOffsetY = 0.5;
  const finOffsetZ = 0.6;
  const finTop = new THREE.Mesh(finGeo, finMat);
  finTop.position.set(finOffsetX, finOffsetY, 0);
  group.add(finTop);
  const finBottom = finTop.clone();
  finBottom.position.y = -finOffsetY;
  group.add(finBottom);
  const finLeft = new THREE.Mesh(finGeo, finMat);
  finLeft.position.set(finOffsetX, 0, finOffsetZ);
  finLeft.rotation.x = Math.PI / 2;
  group.add(finLeft);
  const finRight = finLeft.clone();
  finRight.position.z = -finOffsetZ;
  group.add(finRight);

  // Gameplay is effectively 2D in world X/Y. If the rocket banks/rolls
  // visually, localToWorld() can introduce a Z offset (because the nose
  // is forward along +X). Keep missiles on the gameplay plane.
  group.position.set(noseWorld.x, noseWorld.y, 0);
  scene.add(group);

  const t = spreadCount > 1 ? (spreadIndex / (spreadCount - 1) - 0.5) : 0;
  const angleOffset = t * maxSpread * 2;
  const speed = baseSpeed * (0.9 + Math.random() * 0.3);

  // Missile travels in the rocket's actual forward direction so it
  // always feels like it is being fired from the nose, even if the
  // chase camera or orientation changes.
  // Gameplay is effectively 2D in world X/Y; the rocket can bank/roll
  // visually (introducing a Z component in its quaternion) but missiles
  // should not lose speed because of that. Project onto X/Y plane.
  const forward3D = new THREE.Vector3(1, 0, 0).applyQuaternion(rocket.group.quaternion);
  const forward2D = new THREE.Vector3(forward3D.x, forward3D.y, 0);
  if (forward2D.lengthSq() < 1e-6) {
    forward2D.set(1, 0, 0);
  } else {
    forward2D.normalize();
  }
  const baseAngle = Math.atan2(forward2D.y, forward2D.x);
  const aimAngle = baseAngle + angleOffset;
  const dirX = Math.cos(aimAngle);
  const dirY = Math.sin(aimAngle);
  group.rotation.z = aimAngle;
  group.userData.vx = dirX * speed;
  group.userData.vy = dirY * speed;
  group.userData.vz = 0;
  // Keep missiles short-lived so we can sustain a high fire cadence
  // without accumulating too many active meshes.
  group.userData.life = 0;
  group.userData.maxLife = isMobile ? 0.65 : 0.78;
  group.userData.isCece = true;

  game.ceceRockets.push({ mesh: group });
}

function updateBullets(dt, fireDt) {
  const effectiveFireDt = (typeof fireDt === 'number') ? fireDt : dt;

  // Auto-fire gun when active (and faster while Cece is active),
  // plus a faster stream when invincible (minigun-style).
  if (game.gunTimer > 0 || game.invTimer > 0) {
    game.lastGunShotTime = (game.lastGunShotTime || 0) + effectiveFireDt;
    let interval = GUN_FIRE_INTERVAL;
    if (game.ceceActive) {
      interval *= 0.5;
    }
    if (game.invTimer > 0) {
      // Invincibility should feel like a true minigun: 2x the
      // previous invincibility fire rate.
      interval *= 0.3;
    }
    // Catch up smoothly if a frame stalls; cap to avoid dumping
    // dozens of bullets at once.
    const MAX_SHOTS_PER_FRAME = 4;
    let shots = 0;
    while (game.lastGunShotTime >= interval && shots < MAX_SHOTS_PER_FRAME) {
      game.lastGunShotTime -= interval;
      spawnBullet();
      shots++;
    }
    if (shots === MAX_SHOTS_PER_FRAME) {
      game.lastGunShotTime = 0;
    }
  } else {
    // Reset so re-activating gun/invincibility feels immediate.
    game.lastGunShotTime = 0;
  }

  if (!bulletPoolInitialised) return;

  for (let i = 0; i < game.bullets.length; i++) {
    const b = game.bullets[i];
    if (!b.active) continue;

    b.life += dt;
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.y += b.vy * dt;

     // Invincibility laser shots get a subtle thickness/emissive
     // pulse so they feel like energized bolts instead of static
     // geometry, without changing gameplay behaviour.
     if (b.mode === 'invLaser' && b.laserMesh && b.laserMesh.material) {
       const tNorm = Math.max(0, Math.min(b.life / (b.maxLife || BULLET_MAX_LIFE), 1));
       const pulse = 1.0 + 0.35 * Math.sin((b.life || 0) * 30.0);
       b.laserMesh.scale.y = 1.0 * (1.0 + 0.2 * (1.0 - tNorm)) * pulse;
       b.laserMesh.scale.z = b.laserMesh.scale.y;
       b.laserMesh.material.emissiveIntensity = 1.4 + 0.8 * (1.0 - tNorm);
     }

    if (b.life >= b.maxLife || b.mesh.position.x > 120 || b.mesh.position.x < -40) {
      b.active = false;
      b.mesh.visible = false;
      if (b.bulletMesh) b.bulletMesh.visible = false;
      if (b.laserMesh) b.laserMesh.visible = false;
      continue;
    }

    // Analytic bullet volume (fast + stable). We deliberately avoid
    // setFromObject() here to reduce per-frame traversal and GC.
    const bx = b.mesh.position.x;
    const by = b.mesh.position.y;
    const bz = b.mesh.position.z || 0;
    let halfX = 1.05;
    let halfY = 0.75;
    let halfZ = 0.75;
    if (b.mode === 'invLaser') {
      // Invincibility slug is visually long; give it a longer
      // X extent so it doesn't "phase" through candle edges.
      halfX = 3.1;
      halfY = 0.55;
      halfZ = 0.55;
    }
    tmpBulletBox.min.set(bx - halfX, by - halfY, bz - halfZ);
    tmpBulletBox.max.set(bx + halfX, by + halfY, bz + halfZ);
    for (let j = game.pipes.length - 1; j >= 0; j--) {
      const p = game.pipes[j];
      const halfW = (p.hitWidth || PIPE_WIDTH) * 0.5;
      const halfD = (p.hitDepth || 4) * 0.5;
      const topHalfH = (p.topHeight || 160) * 0.5;
      const bottomHalfH = (p.bottomHeight || 160) * 0.5;

      tmpPipeBoxTop.min.set(
        p.top.position.x - halfW,
        p.top.position.y - topHalfH,
        -halfD
      );
      tmpPipeBoxTop.max.set(
        p.top.position.x + halfW,
        p.top.position.y + topHalfH,
        halfD
      );
      tmpPipeBoxTop.expandByScalar(-0.4);

      tmpPipeBoxBottom.min.set(
        p.bottom.position.x - halfW,
        p.bottom.position.y - bottomHalfH,
        -halfD
      );
      tmpPipeBoxBottom.max.set(
        p.bottom.position.x + halfW,
        p.bottom.position.y + bottomHalfH,
        halfD
      );
      tmpPipeBoxBottom.expandByScalar(-0.4);
      if (tmpBulletBox.intersectsBox(tmpPipeBoxTop) || tmpBulletBox.intersectsBox(tmpPipeBoxBottom)) {
        const cause = (b.mode === 'invLaser') ? 'invincibility' : 'gun';
        destroyPipe(p, b.mesh.position, cause);
        b.active = false;
        b.mesh.visible = false;
        break;
      }
    }
  }
}

function updateCeceRockets(dt) {
  // While Cece is active, continuously spawn a modest stream of
  // rockets ahead of the nose, echoing the 2D game's barrage but
  // as single, straight missiles instead of wide fans.
  if (game.ceceActive && game.ceceTimer > 0) {
    game.lastCeceShotTime += dt;
    // Missile cadence is intentionally independent from the gun's cadence.
    // Previous code tied this to `GUN_FIRE_INTERVAL * 0.5` (a hidden speed-up),
    // which made it hard to "lower" missile fire rate in a way that felt obvious.
    // Keep missiles clearly slower than the base gun cadence.
    const interval = GUN_FIRE_INTERVAL * 1.20;
    const activeMissiles = game.ceceRockets.length;
    const maxActiveMissiles = isMobile ? 4 : 6;
    // Catch up smoothly if a frame stalls; cap spawns to avoid dumping
    // too many missiles in one frame.
    const MAX_MISSILES_PER_FRAME = 2;
    let spawned = 0;
    while (game.lastCeceShotTime >= interval && activeMissiles + spawned < maxActiveMissiles && spawned < MAX_MISSILES_PER_FRAME) {
      game.lastCeceShotTime -= interval;
      spawnCeceRocket(0, 1);
      spawned++;
    }
    if (spawned > 0) {
      playSfx('cece', 0.5, 60);
    }
  }

  for (let i = game.ceceRockets.length - 1; i >= 0; i--) {
    const r = game.ceceRockets[i];
    const m = r.mesh;
    if (m.userData) {
      m.userData.life = (m.userData.life || 0) + dt;
    }
    m.position.x += (m.userData.vx || 0) * dt;
    m.position.y += (m.userData.vy || 0) * dt;
    // Keep missiles on the gameplay plane.
    m.position.z = 0;

    const maxLife = (m.userData && typeof m.userData.maxLife === 'number') ? m.userData.maxLife : 0;
    if ((maxLife > 0 && (m.userData.life || 0) >= maxLife) || m.position.x > 90 || Math.abs(m.position.y) > 60) {
      scene.remove(m);
      game.ceceRockets.splice(i, 1);
      continue;
    }

    for (let j = game.pipes.length - 1; j >= 0; j--) {
      const p = game.pipes[j];

      // Analytic missile volume (fast + stable): sized to cover the
      // missile body + tip + fins without depending on decorative meshes.
      const halfLen = 2.6;
      const halfRad = 0.9;
      tmpCeceBox.min.set(m.position.x - halfLen, m.position.y - halfRad, m.position.z - halfRad);
      tmpCeceBox.max.set(m.position.x + halfLen, m.position.y + halfRad, m.position.z + halfRad);

      // Reuse the same analytic candle footprint used by bullets/rocket.
      const halfW = (p.hitWidth || PIPE_WIDTH) * 0.5;
      const halfD = (p.hitDepth || 4) * 0.5;
      const topHalfH = (p.topHeight || 160) * 0.5;
      const bottomHalfH = (p.bottomHeight || 160) * 0.5;

      tmpPipeBoxTop.min.set(
        p.top.position.x - halfW,
        p.top.position.y - topHalfH,
        -halfD
      );
      tmpPipeBoxTop.max.set(
        p.top.position.x + halfW,
        p.top.position.y + topHalfH,
        halfD
      );
      tmpPipeBoxTop.expandByScalar(-0.4);

      tmpPipeBoxBottom.min.set(
        p.bottom.position.x - halfW,
        p.bottom.position.y - bottomHalfH,
        -halfD
      );
      tmpPipeBoxBottom.max.set(
        p.bottom.position.x + halfW,
        p.bottom.position.y + bottomHalfH,
        halfD
      );
      tmpPipeBoxBottom.expandByScalar(-0.4);

      if (tmpCeceBox.intersectsBox(tmpPipeBoxTop) || tmpCeceBox.intersectsBox(tmpPipeBoxBottom)) {
        destroyPipe(p, m.position, 'missile');
        scene.remove(m);
        game.ceceRockets.splice(i, 1);
        break;
      }
    }
  }
}

function destroyPipe(pipe, hitPosition, cause) {
  const index = game.pipes.indexOf(pipe);
  if (index !== -1) {
    // If this candle hasn't already been counted as passed,
    // award score as a destroyed red candle.
    if (pipe.scored && !pipe.scored.value) {
      pipe.scored.value = true;
      incrementScore(false, true, true);
      // Softer, slightly lower-pitched score accent for
      // destroyed candles so they remain distinct from
      // clean passes.
      playScoreSfx({
        phase: getPhase(),
        combo: game.combo || 0,
        multiplier: game.multiplier || 1,
        challengeActive: game.challengeActive,
        slowActive: game.slowActive,
        doubleScoreActive: game.doubleScoreActive,
        nearMiss: false,
        isDestroyed: true,
      });
    }

    const explosionPos = hitPosition
      ? hitPosition.clone()
      : new THREE.Vector3(pipe.top.position.x, pipe.gapCenter, 0);

    // Powerup-specific candle destroy sounds.
    if (cause === 'gun') {
      // Duller/softer gun-candle impact (no WebAudio filter here).
      try {
        if (audio && audio.sfx && audio.sfx.gunCandle) {
          audio.sfx.gunCandle.playbackRate = 0.78;
        }
      } catch (e) {}
      playSfx('gunCandle', 0.38, 55);
    } else if (cause === 'missile') {
      playSfx('missileCandle', 1.0, 85);
    } else if (cause === 'invincibility') {
      playSfx('invinCandle', 1.0, 110);
    }
    spawnExplosion(explosionPos, cause);

    // Cause-specific impact response so each weapon "lands" differently.
    let shakeI = 0.35;
    let shakeT = 0.3;
    if (cause === 'gun') {
      shakeI = 0.32;
      shakeT = 0.22;
    } else if (cause === 'missile') {
      shakeI = 0.75;
      shakeT = 0.5;
    } else if (cause === 'invincibility') {
      shakeI = 0.55;
      shakeT = 0.38;
      // Electric disintegrations get a brief global flash.
      game.nearMissFlash = Math.max(game.nearMissFlash || 0, 0.55);
    }
    triggerCameraShake(shakeI, shakeT);

    scene.remove(pipe.top);
    scene.remove(pipe.bottom);
    game.pipes.splice(index, 1);
  }
}

function spawnExplosion(position, cause) {
  const group = new THREE.Group();
  const effect = (typeof cause === 'string' && cause)
    ? cause
    : ((cause === true) ? 'missile' : 'gun');

  const particleCount = (effect === 'gun')
    ? (isMobile ? 10 : 16)
    : (effect === 'invincibility')
      ? (isMobile ? 14 : 22)
      : (isMobile ? 22 : 34); // missile

  const duration = (effect === 'gun')
    ? 0.33
    : (effect === 'invincibility')
      ? 0.78
      : 0.98;

  const scaleMul = (effect === 'gun')
    ? 1.35
    : (effect === 'invincibility')
      ? 1.95
      : 2.65;

  for (let i = 0; i < particleCount; i++) {
    const radius = (effect === 'gun')
      ? (0.28 + Math.random() * 0.22)
      : (effect === 'invincibility')
        ? (0.30 + Math.random() * 0.28)
        : (0.55 + Math.random() * 0.70);
    const geo = new THREE.SphereGeometry(radius, 8, 8);

    let color = 0xf97316;
    let emissive = 0xf97316;
    let emissiveIntensity = 0.95;
    let opacity = 1.0;
    let roughness = 0.35;
    let metalness = 0.35;

    if (effect === 'gun') {
      // Dramatic "bullet hits metal target": bright sparks + dark chips.
      const chip = Math.random() < 0.24;
      if (chip) {
        color = 0x111827;
        emissive = 0x000000;
        emissiveIntensity = 0.0;
        opacity = 0.85;
        roughness = 0.85;
        metalness = 0.1;
      } else {
        color = 0xfef08a;
        emissive = 0xf97316;
        emissiveIntensity = 1.8;
        opacity = 0.92;
        roughness = 0.25;
        metalness = 0.2;
      }
    } else if (effect === 'invincibility') {
      // Electric disintegration: icy cyan + hot core.
      const hot = Math.random() < 0.42;
      if (hot) {
        color = 0x22d3ee;
        emissive = 0x7dd3fc;
        emissiveIntensity = 2.05;
        opacity = 0.92;
        roughness = 0.2;
        metalness = 0.15;
      } else {
        color = 0x0ea5e9;
        emissive = 0x22d3ee;
        emissiveIntensity = 1.6;
        opacity = 0.88;
        roughness = 0.3;
        metalness = 0.15;
      }
    } else {
      // Missile (Cece reference): mix hot cores with darker smoke puffs.
      const smoke = Math.random() < 0.50;
      if (smoke) {
        color = 0x111827;
        emissive = 0x000000;
        emissiveIntensity = 0.0;
        opacity = 0.85;
        roughness = 0.85;
        metalness = 0.1;
      } else {
        color = 0xf97316;
        emissive = 0xf97316;
        emissiveIntensity = 1.7;
        opacity = 1.0;
        roughness = 0.3;
        metalness = 0.25;
      }
    }

    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity,
      metalness,
      roughness,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    if (effect === 'invincibility') {
      // Keep electric pops crisp under ACES.
      mat.toneMapped = false;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, 0);
    // Store a simple velocity on the mesh object
    mesh.userData.kind = 'particle';
    const spread = (effect === 'gun') ? 26 : (effect === 'invincibility') ? 32 : 48;
    const spreadY = (effect === 'gun') ? 20 : (effect === 'invincibility') ? 26 : 38;
    mesh.userData.vx = (Math.random() - 0.5) * spread;
    mesh.userData.vy = (Math.random() - 0.5) * spreadY;
    mesh.userData.vz = (Math.random() - 0.5) * ((effect === 'missile') ? 18 : 10);
    group.add(mesh);
  }

  // Add signature accent layers per effect for instant recognition.
  if (effect === 'gun') {
    // Bright ping ring.
    const ringGeo = new THREE.TorusGeometry(0.7, 0.085, 12, 44);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf97316,
      emissiveIntensity: 1.75,
      metalness: 0.2,
      roughness: 0.22,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    ringMat.toneMapped = false;
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.userData.kind = 'ring';
    ring.rotation.x = Math.PI / 2;
    ring.position.z = 0.2;
    group.add(ring);

    // Ricochet streaks.
    const streakCount = isMobile ? 5 : 8;
    const streakMat = new THREE.LineBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    streakMat.toneMapped = false;
    for (let s = 0; s < streakCount; s++) {
      const len = 2.2 + Math.random() * 2.2;
      const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(len, 0, 0)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, streakMat);
      line.userData.kind = 'streak';
      const ang = Math.random() * Math.PI * 2;
      const spd = 22 + Math.random() * 22;
      line.rotation.z = ang;
      line.rotation.y = (Math.random() - 0.5) * 0.6;
      line.userData.vx = Math.cos(ang) * spd;
      line.userData.vy = Math.sin(ang) * spd;
      line.userData.vz = (Math.random() - 0.5) * 10;
      line.userData.spin = (Math.random() - 0.5) * 8.0;
      group.add(line);
    }

    // Small metal shards.
    const shardCount = isMobile ? 2 : 4;
    const shardGeo = new THREE.BoxGeometry(0.22, 0.12, 0.06);
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.95,
      roughness: 0.22,
      emissive: 0x0b1220,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    for (let d = 0; d < shardCount; d++) {
      const shard = new THREE.Mesh(shardGeo, shardMat);
      shard.userData.kind = 'debris';
      shard.userData.vx = (Math.random() - 0.5) * 38;
      shard.userData.vy = (Math.random() - 0.2) * 34;
      shard.userData.vz = (Math.random() - 0.5) * 14;
      shard.userData.grav = 36;
      shard.userData.avx = (Math.random() - 0.5) * 10;
      shard.userData.avy = (Math.random() - 0.5) * 10;
      shard.userData.avz = (Math.random() - 0.5) * 10;
      group.add(shard);
    }

    // Brief hot flash at impact point.
    const flashGeo = new THREE.SphereGeometry(0.65, 10, 10);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    flashMat.toneMapped = false;
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.userData.kind = 'flash';
    group.add(flash);
  } else if (effect === 'missile') {
    // Violent multi-stage blast: fireball + double shockwaves + heavy debris.
    const fireGeo = new THREE.SphereGeometry(0.9, 14, 12);
    const fireMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    fireMat.toneMapped = false;
    const fire = new THREE.Mesh(fireGeo, fireMat);
    fire.userData.kind = 'fireball';
    group.add(fire);

    const shockGeo = new THREE.RingGeometry(0.65, 1.08, 54);
    const shockMat = new THREE.MeshBasicMaterial({
      color: 0xfef2f2,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    shockMat.toneMapped = false;
    const shockA = new THREE.Mesh(shockGeo, shockMat);
    shockA.userData.kind = 'shockwave';
    shockA.userData.speed = 3.2;
    shockA.rotation.x = Math.PI / 2;
    shockA.position.z = 0.35;
    group.add(shockA);

    const shockB = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 48), shockMat.clone());
    shockB.userData.kind = 'shockwave';
    shockB.userData.speed = 4.1;
    shockB.rotation.x = Math.PI / 2;
    shockB.position.z = 0.15;
    group.add(shockB);

    const debrisCount = isMobile ? 7 : 12;
    const debrisGeo = new THREE.BoxGeometry(0.34, 0.22, 0.12);
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      metalness: 0.85,
      roughness: 0.45,
      emissive: 0x0b1220,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    for (let d = 0; d < debrisCount; d++) {
      const chunk = new THREE.Mesh(debrisGeo, debrisMat);
      chunk.userData.kind = 'debris';
      chunk.userData.vx = (Math.random() - 0.5) * 65;
      chunk.userData.vy = (Math.random() - 0.2) * 62;
      chunk.userData.vz = (Math.random() - 0.5) * 28;
      chunk.userData.grav = 42;
      chunk.userData.avx = (Math.random() - 0.5) * 12;
      chunk.userData.avy = (Math.random() - 0.5) * 12;
      chunk.userData.avz = (Math.random() - 0.5) * 12;
      chunk.scale.setScalar(0.85 + Math.random() * 0.55);
      group.add(chunk);
    }

    const smokeCount = isMobile ? 3 : 5;
    const smokeGeo = new THREE.SphereGeometry(0.95, 10, 10);
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.05,
      roughness: 0.95,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    for (let s = 0; s < smokeCount; s++) {
      const puff = new THREE.Mesh(smokeGeo, smokeMat);
      puff.userData.kind = 'smoke';
      puff.userData.vx = (Math.random() - 0.5) * 10;
      puff.userData.vy = 10 + Math.random() * 18;
      puff.userData.vz = (Math.random() - 0.5) * 8;
      puff.userData.spin = (Math.random() - 0.5) * 1.6;
      puff.scale.setScalar(0.75 + Math.random() * 0.5);
      group.add(puff);
    }
  } else if (effect === 'invincibility') {
    // Electric disintegration: ion bloom + crackle ring + arc lattice.
    const bloomGeo = new THREE.SphereGeometry(0.95, 16, 14);
    const bloomMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    bloomMat.toneMapped = false;
    const bloom = new THREE.Mesh(bloomGeo, bloomMat);
    bloom.userData.kind = 'ionBloom';
    group.add(bloom);

    const crackGeo = new THREE.RingGeometry(0.75, 1.35, 64);
    const crackMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    crackMat.toneMapped = false;
    const crack = new THREE.Mesh(crackGeo, crackMat);
    crack.userData.kind = 'crackleRing';
    crack.rotation.x = Math.PI / 2;
    crack.position.z = 0.25;
    group.add(crack);

    // Electric arcs: more, longer, with stronger flicker.
    const arcMat = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    arcMat.toneMapped = false;
    const arcCount = isMobile ? 7 : 12;
    for (let a = 0; a < arcCount; a++) {
      const pts = [];
      const segs = 7;
      const len = 2.1 + Math.random() * 1.8;
      const baseAng = Math.random() * Math.PI * 2;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const jitter = (Math.random() - 0.5) * 0.55;
        const r = t * len;
        pts.push(new THREE.Vector3(
          Math.cos(baseAng) * r + jitter,
          Math.sin(baseAng) * r - jitter,
          (Math.random() - 0.5) * 0.25
        ));
      }
      const arcGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const arc = new THREE.Line(arcGeo, arcMat);
      arc.userData.kind = 'arc';
      arc.userData.spin = (Math.random() - 0.5) * 3.0;
      arc.userData.seed = Math.random() * 1000;
      group.add(arc);
    }
    const haloGeo = new THREE.TorusGeometry(0.95, 0.105, 14, 56);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    haloMat.toneMapped = false;
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.userData.kind = 'electricHalo';
    halo.rotation.x = Math.PI / 2;
    halo.position.z = 0.25;
    group.add(halo);
  }

  group.position.copy(position);
  scene.add(group);
  game.explosions.push({ group, time: 0, duration, scaleMul, kind: effect });
}

function updateExplosions(dt) {
  for (let i = game.explosions.length - 1; i >= 0; i--) {
    const e = game.explosions[i];
    e.time += dt;
    const t = e.time / e.duration;
    const fade = Math.max(0, 1 - t);
    const scaleMul = (typeof e.scaleMul === 'number') ? e.scaleMul : 1.5;
    const scale = 1 + t * scaleMul;
    e.group.scale.setScalar(scale);
    for (const child of e.group.children) {
      const kind = child.userData && child.userData.kind;
      if (kind === 'particle') {
        child.position.x += (child.userData.vx || 0) * dt;
        child.position.y += (child.userData.vy || 0) * dt;
        child.position.z += (child.userData.vz || 0) * dt;
        if (child.material && child.material.transparent) {
          child.material.opacity = fade;
        }
      } else if (kind === 'debris') {
        child.position.x += (child.userData.vx || 0) * dt;
        child.position.y += (child.userData.vy || 0) * dt;
        child.position.z += (child.userData.vz || 0) * dt;
        const g = (child.userData.grav || 0);
        if (g) {
          child.userData.vy = (child.userData.vy || 0) - g * dt;
        }
        child.rotation.x += (child.userData.avx || 0) * dt;
        child.rotation.y += (child.userData.avy || 0) * dt;
        child.rotation.z += (child.userData.avz || 0) * dt;
        if (child.material && child.material.transparent) {
          child.material.opacity = Math.max(0, Math.min(1, fade * 1.05));
        }
      } else if (kind === 'streak') {
        child.position.x += (child.userData.vx || 0) * dt;
        child.position.y += (child.userData.vy || 0) * dt;
        child.position.z += (child.userData.vz || 0) * dt;
        child.rotation.z += (child.userData.spin || 0) * dt;
        // Shrink streaks quickly so they feel like ricochets.
        const s = Math.max(0.001, 1.0 - t * 1.6);
        child.scale.set(s, 1, 1);
        if (child.material && child.material.transparent) {
          child.material.opacity = fade * fade;
        }
      } else if (kind === 'ring') {
        child.rotation.z += dt * 2.8;
        if (child.material && child.material.transparent) {
          child.material.opacity = Math.min(1.0, fade * 1.2);
        }
      } else if (kind === 'shockwave') {
        // Expanding ring, slightly faster than the particle group.
        const speed = (child.userData && child.userData.speed) ? child.userData.speed : 2.8;
        const s = 1.0 + t * speed;
        child.scale.setScalar(s);
        if (camera) child.lookAt(camera.position);
        if (child.material && child.material.transparent) {
          child.material.opacity = fade * 0.65;
        }
      } else if (kind === 'smoke') {
        child.position.x += (child.userData.vx || 0) * dt;
        child.position.y += (child.userData.vy || 0) * dt;
        child.position.z += (child.userData.vz || 0) * dt;
        child.rotation.z += (child.userData.spin || 0) * dt;
        const s = 1.0 + t * 2.6;
        child.scale.setScalar(s);
        if (child.material && child.material.transparent) {
          child.material.opacity = fade * 0.65;
        }
      } else if (kind === 'fireball') {
        const s = 1.0 + t * 3.4;
        child.scale.setScalar(s);
        if (camera) child.lookAt(camera.position);
        if (child.material && child.material.transparent) {
          child.material.opacity = fade * 0.85;
        }
      } else if (kind === 'flash') {
        const s = 1.0 + t * 2.0;
        child.scale.setScalar(s);
        if (child.material && child.material.transparent) {
          child.material.opacity = Math.max(0, (1 - t * 3.6));
        }
      } else if (kind === 'arc') {
        child.rotation.z += (child.userData.spin || 0) * dt;
        if (child.material && child.material.transparent) {
          // Flicker a bit so it feels electric.
          const seed = (child.userData && child.userData.seed) ? child.userData.seed : child.id;
          const flicker = 0.55 + 0.45 * Math.sin((e.time * 30.0) + seed);
          child.material.opacity = fade * flicker;
        }
      } else if (kind === 'electricHalo') {
        child.rotation.z += dt * 2.1;
        const s = 1.0 + t * 1.9;
        child.scale.setScalar(s);
        if (camera) child.lookAt(camera.position);
        if (child.material && child.material.transparent) {
          child.material.opacity = fade * 0.7;
        }
      } else if (kind === 'ionBloom') {
        const s = 1.0 + t * 2.8;
        child.scale.setScalar(s);
        if (camera) child.lookAt(camera.position);
        if (child.material && child.material.transparent) {
          child.material.opacity = fade * 0.8;
        }
      } else if (kind === 'crackleRing') {
        child.rotation.z += dt * 2.4;
        const s = 1.0 + t * 2.2;
        child.scale.setScalar(s);
        if (camera) child.lookAt(camera.position);
        if (child.material && child.material.transparent) {
          const flicker = 0.75 + 0.25 * Math.sin(e.time * 22.0);
          child.material.opacity = fade * flicker;
        }
      } else {
        // Fallback: just fade if possible.
        if (child.material && child.material.transparent) {
          child.material.opacity = fade;
        }
      }
    }

    if (e.time >= e.duration) {
      scene.remove(e.group);
      game.explosions.splice(i, 1);
    }
  }
}

function updateInvincBeams(dt) {
  for (let i = game.invBeams.length - 1; i >= 0; i--) {
    const beam = game.invBeams[i];
    beam.life -= dt;
    if (beam.life <= 0 || !beam.mesh) {
      if (beam.mesh) scene.remove(beam.mesh);
      game.invBeams.splice(i, 1);
      continue;
    }

    const t = 1 - beam.life / beam.maxLife;
    const fade = Math.max(0, 1 - t * 1.6);
    const scaleY = 1 - t * 0.3;
    const scaleZ = 1 - t * 0.3;
    beam.mesh.scale.y = scaleY;
    beam.mesh.scale.z = scaleZ;
    if (beam.mesh.material && beam.mesh.material.transparent) {
      beam.mesh.material.opacity = 0.95 * fade;
      beam.mesh.material.emissiveIntensity = 1.2 + 0.5 * fade;
    }
  }
}

function triggerCameraShake(intensity, duration) {
  game.cameraShakeIntensity = Math.max(game.cameraShakeIntensity, intensity);
  game.cameraShakeTime = Math.max(game.cameraShakeTime, duration);
}

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const deltaMs = timestamp - lastTime;
  lastTime = timestamp;

  let dt = deltaMs / 1000;
  // Clamp excessively large deltas (tab switching, etc.)
  dt = Math.min(dt, 0.05);

  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    updateGame(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  if (camera) {
    // Update chase camera to follow rocket from behind/upper-right
    updateChaseCamera(dt);

    // Camera shake applied on top of the chase camera position
    let offsetX = 0;
    let offsetY = 0;
    if (game.cameraShakeTime > 0 && game.cameraShakeIntensity > 0) {
      const shake = game.cameraShakeIntensity;
      offsetX = (Math.random() - 0.5) * shake;
      offsetY = (Math.random() - 0.5) * shake * 0.7;
      game.cameraShakeTime -= dt;
      if (game.cameraShakeTime <= 0) {
        game.cameraShakeTime = 0;
        game.cameraShakeIntensity *= 0.4;
      } else {
        game.cameraShakeIntensity *= 0.96;
      }
    }
    camera.position.x += offsetX;
    camera.position.y += offsetY;
  }

  // Update premium wormhole portal (if present).
  if (wormhole3D && wormhole3D.group && wormhole3D.group.visible) {
    wormhole3D.update(dt, timestamp * 0.001, camera);
  }

  if (renderTarget && postScene && postCamera && postMaterial) {
    const uniforms = postMaterial.uniforms;
    let wormholeBoost = 0.0;
    let nextStrength = 0.0;
    let needsPost = false;

    if (uniforms) {
      slowWarpTime += dt;
      uniforms.uTime.value = slowWarpTime;

      // Drive ripple strength directly from Slow state so the
      // warp clearly ramps with the powerup and then fades. Wormhole
      // flips can add a brief extra kick so portals feel punchy.
      let targetStrength = 0.0;
      if (game && (game.slowActive || game.slowTimer > 0 || game.wormholeSlowTimer > 0 || game.slowWaves.length > 0)) {
        const overlay = Math.max(0, Math.min(1, game.slowVisual || 0));
        let timerFactor = 0;
        if (game.slowTimer > 0) {
          timerFactor = Math.max(0, Math.min(game.slowTimer / SLOW_DURATION, 1));
        }
        let wormholeFactor = 0;
        if (game.wormholeSlowTimer > 0) {
          // Half-strength ripple compared to full SLOW.
          wormholeFactor = 0.5 * Math.max(0, Math.min(game.wormholeSlowTimer / WORMHOLE_SLOW_DURATION, 1));
        }
        const base = Math.max(overlay, timerFactor, wormholeFactor);
        const pulse = 0.55 + 0.35 * Math.sin(slowWarpTime * 3.0);
        targetStrength = base * pulse;
        if (isMobile) {
          // Slightly softer on mobile for performance/comfort.
          targetStrength *= 0.7;
        }
      }

      // Add a short, decaying boost while an axis transition is
      // in progress so wormholes feel like they bend the screen.
      if (game && game.axisTransition && game.wormholeWarp > 0) {
        const wobble = 0.7 + 0.3 * Math.sin(slowWarpTime * 4.2);
        wormholeBoost = game.wormholeWarp * 0.45 * wobble;
        targetStrength += wormholeBoost;
        game.wormholeWarp = Math.max(0, game.wormholeWarp - dt * 1.6);
      }

      const current = uniforms.uStrength.value;
      nextStrength = current + (targetStrength - current) * 0.15;
      uniforms.uStrength.value = nextStrength;

      // Chromatic fringing stays tied mainly to wormhole-driven
      // warps so slow-motion ripples can remain more neutral.
      if ('uChromaticStrength' in uniforms) {
        uniforms.uChromaticStrength.value = wormholeBoost;
      }

      // If the post effect is effectively off, skip the entire offscreen pass.
      needsPost = (Math.abs(nextStrength) > 0.0008) || (Math.abs(wormholeBoost) > 0.0008);
    }

    if (!needsPost) {
      renderer.render(scene, camera);
    } else {
      // Render the 3D scene into an offscreen target first.
      renderer.setRenderTarget(renderTarget);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      if (uniforms) {
        uniforms.tDiffuse.value = renderTarget.texture;

        // Project the rocket into screen space so the ripple
        // originates from its apparent position.
        if (rocket && rocket.group && camera) {
          rocket.group.getWorldPosition(__tmpRocketWorldPos);
          __tmpRocketWorldPos.project(camera);
          const u = __tmpRocketWorldPos.x * 0.5 + 0.5;
          const v = __tmpRocketWorldPos.y * 0.5 + 0.5;
          uniforms.uCenter.value.set(u, v);
        }
      }

      renderer.render(postScene, postCamera);
    }
  } else {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}

// Boot
initThree();
updateHud();
requestAnimationFrame(loop);

// Expose a tiny debug handle so browser DevTools can inspect
// the current Moonshot run state without leaking too much
// surface area.
if (typeof window !== 'undefined') {
  window.moonshotGame = game;
}
