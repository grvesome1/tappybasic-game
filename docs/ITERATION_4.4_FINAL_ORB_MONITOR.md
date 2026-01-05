# Iteration 4.4 (Final): Activity Orb Monitor v2.4 + Launch Hooks

This iteration adds a **standalone 3D “Activity Orb” monitor page** that connects to the Iteration 4.3 **Admin Snapshot** data spine.

## What ships

### 1) New route: `/orb/`
Static page served from:
- `public/orb/index.html`
- `public/orb/integration/activity-orb.js`
- `public/orb/integration/activity-orb.css`

Open it in production at:
- `https://YOUR_DOMAIN/orb/`

### 2) Admin mode (real data)
When you toggle **Admin: ON**, the orb will:
- Poll `GET /api/admin/snapshot` every ~5 seconds (credentials included)
- Convert snapshot → `{ nodes, links }` using:
  - Preferred: `public/gruesome-arcade-3d-map-adapter-v1.0/ga3d-admin-adapter.js` (Iteration 4.3)
  - Fallback: a built-in snapshot→graph mapper

Non-admin users get `403 Forbidden` and see the error reflected in the HUD + audit log.

### 3) Persistence + audit exports
- Visual config persisted in LocalStorage: `ga.orb.config.v2.4`
- Audit log persisted in LocalStorage: `ga.orb.audit.v2.4`
- Exports:
  - Config JSON
  - Audit JSON
  - Audit CSV

### 4) WebGL safety
- Orb is **standalone** and runs only when `/orb/` is open (prevents adding GPU load to main SPA).
- `initActivityOrbBackground()` includes double-init protection on the host to reduce duplicate WebGL contexts.

## Notes / Integration

If you want a link visible only for the admin wallet:
- Add a button in your Admin panel or Settings that opens `/orb/` in a new tab.

This iteration intentionally avoids rewriting `public/index.html` to keep stability.


## Compatibility

- This iteration also adds a compatibility shim at:
  - `public/gruesome-arcade-3d-map-adapter-v1.0/ga3d-admin-adapter.js`
- It re-exports the Iteration 4.3 adapter (`/gruesome-arcade-metrics-map-adapter-v1.0/adminSnapshotAdapter.js`) so older integrations can import `getAdminSnapshot()`.
