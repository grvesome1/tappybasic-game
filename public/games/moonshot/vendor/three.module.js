// Minimal shim to keep Moonshot's existing import path stable.
// Loads Three.js as a standard ESM module.
//
// Note: Vercel CSP must allow https://unpkg.com in `script-src`.
export * from 'https://unpkg.com/three@0.160.0/build/three.module.js';
