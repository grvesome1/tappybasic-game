/* built by gruesøme */
/* sig(enc:xor-0x5A,utf8,hex)=382f33362e7a38237a3d282f3f29a2373f */

/**
 * Arcade Activity Orb Monitor (v2.4)
 * - Standalone, no build step.
 * - Admin mode polls /api/admin/snapshot (requires admin session).
 * - Uses Iteration 4.3 adapter if present: /gruesome-arcade-3d-map-adapter-v1.0/ga3d-admin-adapter.js
 */

const CONFIG_KEY = 'ga.orb.config.v2.4';
const AUDIT_KEY  = 'ga.orb.audit.v2.4';
const MAX_AUDIT  = 400;

const DEFAULT_CFG = Object.freeze({
  ringSpeed: 1.00,     // multiplier
  orbitSpeed: 0.055,   // radians / second (autopilot)
  fogDensity: 0.028,   // exp2 density
  graphIntensity: 1.00,// multiplier
  particles: true,
  arcs: true,
  shell: true
});

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function loadJsonLS(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return fallback;
    return JSON.parse(raw);
  }catch{
    return fallback;
  }
}

function saveJsonLS(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); }catch{}
}

function ts(ms=Date.now()){
  const d = new Date(ms);
  const pad = (n)=>String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

function downloadText(filename, text, mime='application/json'){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}

function auditToCsv(rows){
  const esc = (s)=>('"'+String(s ?? '').replaceAll('"','""')+'"');
  const header = ['t','level','msg','meta'].join(',');
  const lines = rows.map(r=>[
    esc(r.t),
    esc(r.level),
    esc(r.msg),
    esc(r.meta ? JSON.stringify(r.meta) : '')
  ].join(','));
  return [header, ...lines].join('\n');
}

// FNV-1a hash → 32-bit
function hash32(str){
  let h = 2166136261;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashUnitSphere(str){
  const h = hash32(str);
  // Deterministic pseudo-random in [-1,1]
  const u1 = ((h & 0x3FF) / 1023) * 2 - 1;
  const u2 = (((h>>>10) & 0x3FF) / 1023) * 2 - 1;
  const u3 = (((h>>>20) & 0x3FF) / 1023) * 2 - 1;
  // Normalize
  const len = Math.hypot(u1,u2,u3) || 1;
  return { x: u1/len, y: u2/len, z: u3/len };
}

async function importFirst(urls){
  let lastErr = null;
  for(const u of urls){
    try{
      return await import(u);
    }catch(e){
      lastErr = e;
    }
  }
  throw lastErr || new Error('importFirst failed');
}

async function loadThree(){
  const threeUrls = [
    // Common local placements (if you already vendored Three)
    '/vendor/three/three.module.js',
    '/three.module.js',
    // CDN fallback
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'
  ];
  const controlsUrls = [
    '/vendor/three/OrbitControls.js',
    '/OrbitControls.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js'
  ];

  const THREE = await importFirst(threeUrls);
  const { OrbitControls } = await importFirst(controlsUrls);

  return { THREE, OrbitControls };
}

function makeEnvCanvasTexture(THREE){
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256; // 2:1 for equirect-like
  const ctx = c.getContext('2d');

  // Base gradient
  const g = ctx.createLinearGradient(0,0,0,c.height);
  g.addColorStop(0, '#0c1236');
  g.addColorStop(0.55, '#050713');
  g.addColorStop(1, '#020208');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,c.width,c.height);

  // Stars/noise
  const rnd = (seed)=>{ // mulberry32
    let t = seed >>> 0;
    return ()=> {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  };
  const r = rnd(1337);
  for(let i=0;i<1400;i++){
    const x = Math.floor(r()*c.width);
    const y = Math.floor(r()*c.height);
    const a = r()*0.9 + 0.1;
    const s = r() < 0.06 ? 2 : 1;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x,y,s,s);
  }

  // Soft nebula blobs
  for(let i=0;i<18;i++){
    const x = r()*c.width;
    const y = r()*c.height;
    const rad = 50 + r()*160;
    const cg = ctx.createRadialGradient(x,y,0,x,y,rad);
    const hue = 190 + r()*90;
    cg.addColorStop(0, `rgba(${Math.floor(hue)}, ${Math.floor(120+r()*80)}, 255, ${0.12+r()*0.12})`);
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(x,y,rad,0,Math.PI*2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function pickColor(THREE, kind, severity){
  const k = String(kind||'').toLowerCase();
  const s = String(severity||'').toLowerCase();
  if(s === 'err' || s === 'error' || s === 'critical') return new THREE.Color(0xff5078);
  if(s === 'warn' || s === 'warning') return new THREE.Color(0xffc45a);

  if(k.includes('epoch') || k.includes('payout') || k.includes('pot')) return new THREE.Color(0x5adcff);
  if(k.includes('activity')) return new THREE.Color(0x7dff9a);
  if(k.includes('catalog') || k.includes('schema')) return new THREE.Color(0xc9a7ff);
  if(k.includes('game')) return new THREE.Color(0x7aa6ff);
  return new THREE.Color(0xffffff);
}

function safeText(el, t){
  if(!el) return;
  el.textContent = String(t ?? '');
}

export async function initActivityOrbBackground(opts){
  const { THREE, OrbitControls } = await loadThree();

  const host = (typeof opts?.host === 'string')
    ? document.querySelector(opts.host)
    : (opts?.host instanceof HTMLElement ? opts.host : null);

  if(!host) throw new Error('initActivityOrbBackground: host not found');

  // Prevent double-init in same host (WebGL context safety).
  if(host.__gaOrbInstance){
    return host.__gaOrbInstance;
  }

  const cfg = { ...DEFAULT_CFG, ...(loadJsonLS(CONFIG_KEY, null) || {}) };
  cfg.ringSpeed = clamp(Number(cfg.ringSpeed)||DEFAULT_CFG.ringSpeed, 0, 3);
  cfg.orbitSpeed = clamp(Number(cfg.orbitSpeed)||DEFAULT_CFG.orbitSpeed, 0, 0.35);
  cfg.fogDensity = clamp(Number(cfg.fogDensity)||DEFAULT_CFG.fogDensity, 0, 0.09);
  cfg.graphIntensity = clamp(Number(cfg.graphIntensity)||DEFAULT_CFG.graphIntensity, 0, 2);

  const audit = loadJsonLS(AUDIT_KEY, []) || [];
  const pushAudit = (level, msg, meta) => {
    const entry = { t: ts(), level, msg, meta };
    audit.unshift(entry);
    if(audit.length > MAX_AUDIT) audit.length = MAX_AUDIT;
    saveJsonLS(AUDIT_KEY, audit);
    renderAudit();
    return entry;
  };

  // DOM hooks (optional: only exist in standalone page).
  const root = host;
  const hudStatus = root.querySelector('#hudStatus');
  const adminPanel = root.querySelector('#adminPanel');
  const auditHost = root.querySelector('#auditLog');

  // Three.js base
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050713, cfg.fogDensity);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0.2, 6.1);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  // Env map for glassy core
  const envTex = makeEnvCanvasTexture(THREE);
  scene.environment = envTex;

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(2.6, 2.1, 3.3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5adcff, 0.65);
  rim.position.set(-3.6, 1.2, -2.4);
  scene.add(rim);

  // Root group
  const world = new THREE.Group();
  scene.add(world);

  // Core sphere (glass)
  const coreGeo = new THREE.SphereGeometry(1.05, 64, 64);
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b2a6f,
    roughness: 0.12,
    metalness: 0.20,
    transmission: 0.68,
    thickness: 0.45,
    ior: 1.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
    emissive: 0x00111c,
    emissiveIntensity: 0.55
  });
  coreMat.envMapIntensity = 1.15;
  const core = new THREE.Mesh(coreGeo, coreMat);
  world.add(core);

  // Optional outer shell
  const shellGeo = new THREE.SphereGeometry(1.25, 48, 48);
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1030,
    roughness: 0.06,
    metalness: 0.0,
    transmission: 0.62,
    thickness: 0.18,
    ior: 1.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08
  });
  shellMat.envMapIntensity = 0.9;
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.visible = !!cfg.shell;
  world.add(shell);

  // Rings
  const rings = new THREE.Group();
  world.add(rings);

  function makeRing(radius, tube, colorHex, emissiveHex, opacity){
    const geo = new THREE.TorusGeometry(radius, tube, 14, 240);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: emissiveHex,
      emissiveIntensity: 1.1,
      roughness: 0.32,
      metalness: 0.25,
      transparent: true,
      opacity: opacity
    });
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  const r1 = makeRing(1.62, 0.018, 0x67e5ff, 0x2aaad6, 0.85);
  r1.rotation.x = Math.PI * 0.5;
  rings.add(r1);

  const r2 = makeRing(1.92, 0.016, 0x9f7dff, 0x5936ff, 0.70);
  r2.rotation.y = Math.PI * 0.5;
  r2.rotation.z = Math.PI * 0.15;
  rings.add(r2);

  const r3 = makeRing(2.22, 0.014, 0x7dff9a, 0x1fb35d, 0.55);
  r3.rotation.x = Math.PI * 0.28;
  r3.rotation.y = Math.PI * 0.28;
  rings.add(r3);

  // Particles cloud
  const particleGroup = new THREE.Group();
  world.add(particleGroup);

  let particles = null;
  function rebuildParticles(){
    if(particles){
      particleGroup.remove(particles);
      particles.geometry.dispose();
      particles.material.dispose();
      particles = null;
    }
    if(!cfg.particles) return;

    const count = 1500;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for(let i=0;i<count;i++){
      // distribute in a thick shell
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2 * Math.PI;
      const phi = Math.acos(2*v - 1);
      const rad = 2.6 + Math.random()*3.2;
      const x = rad * Math.sin(phi) * Math.cos(theta);
      const y = rad * Math.cos(phi);
      const z = rad * Math.sin(phi) * Math.sin(theta);
      pos[i*3+0]=x; pos[i*3+1]=y; pos[i*3+2]=z;
      const c = 0.55 + Math.random()*0.45;
      col[i*3+0]=c; col[i*3+1]=c; col[i*3+2]=c;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.020,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    particles = new THREE.Points(geo, mat);
    particleGroup.add(particles);
  }
  rebuildParticles();

  // Graph layer (admin snapshot)
  const graphRoot = new THREE.Group();
  world.add(graphRoot);

  // Pulses (activity)
  const pulseRoot = new THREE.Group();
  world.add(pulseRoot);
  const pulses = [];

  function spawnPulse(color, baseRadius=1.1, kind='generic'){
    const geo = new THREE.SphereGeometry(baseRadius, 24, 24);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.30,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const m = new THREE.Mesh(geo, mat);
    m.userData = { t0: performance.now(), kind };
    pulseRoot.add(m);
    pulses.push(m);
  }

  function clearGraph(){
    // Dispose old children
    for(const child of [...graphRoot.children]){
      graphRoot.remove(child);
      if(child.geometry) child.geometry.dispose();
      if(child.material){
        if(Array.isArray(child.material)) child.material.forEach(m=>m.dispose());
        else child.material.dispose();
      }
    }
  }

  function renderGraph(graph){
    clearGraph();
    if(!graph || !Array.isArray(graph.nodes)) return;

    const nodeMeshes = new Map();
    const nodeRadius = 2.65;
    for(const n of graph.nodes){
      const id = String(n.id ?? n.key ?? n.label ?? 'node');
      const u = hashUnitSphere(id);
      const r = nodeRadius + (Number(n.value)||0) * 0.002 * cfg.graphIntensity;
      const pos = new THREE.Vector3(u.x*r, u.y*r, u.z*r);

      const color = pickColor(THREE, n.kind, n.severity);
      const geo = new THREE.SphereGeometry(0.06 + clamp((Number(n.weight)||0)*0.002, 0, 0.08), 18, 18);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.15,
        transparent: true,
        opacity: 0.92
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.userData.node = n;
      graphRoot.add(mesh);
      nodeMeshes.set(id, mesh);
    }

    if(cfg.arcs && Array.isArray(graph.links)){
      for(const L of graph.links){
        const aId = String(L.source ?? L.a ?? '');
        const bId = String(L.target ?? L.b ?? '');
        const a = nodeMeshes.get(aId);
        const b = nodeMeshes.get(bId);
        if(!a || !b) continue;

        const mid = new THREE.Vector3().addVectors(a.position, b.position).multiplyScalar(0.5);
        mid.normalize().multiplyScalar(nodeRadius + 0.95);

        const curve = new THREE.QuadraticBezierCurve3(
          a.position.clone(),
          mid,
          b.position.clone()
        );

        const pts = curve.getPoints(32);
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const col = pickColor(THREE, L.kind, L.severity);
        const mat = new THREE.LineBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.26
        });
        const line = new THREE.Line(geo, mat);
        graphRoot.add(line);
      }
    }

    // Slight tilt so it reads as a “map” around the orb
    graphRoot.rotation.x = 0.18;
    graphRoot.rotation.y = -0.10;
  }

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.enablePan = false;
  controls.enabled = false;

  // Lifecycle
  let raf = 0;
  let alive = true;
  let adminEnabled = !!opts?.adminEnabled;
  let pollTimer = 0;
  let adminAdapter = null;
  let lastSnapshot = null;
  let lastSnapshotAt = 0;

  function setAdmin(on){
    adminEnabled = !!on;
    root.dataset.admin = adminEnabled ? '1' : '0';
    controls.enabled = adminEnabled;
    root.classList.toggle('orb-interactive', adminEnabled);

    if(adminEnabled){
      pushAudit('ok', 'admin_enabled');
      startPolling();
    }else{
      pushAudit('ok', 'admin_disabled');
      stopPolling();
    }
    return adminEnabled;
  }

  async function loadAdminAdapter(){
    if(adminAdapter) return adminAdapter;
    const url = String(opts?.adminAdapterUrl || '/gruesome-arcade-3d-map-adapter-v1.0/ga3d-admin-adapter.js');
    try{
      adminAdapter = await import(url);
      return adminAdapter;
    }catch(e){
      pushAudit('warn', 'admin_adapter_import_failed', { url, err: String(e?.message||e) });
      adminAdapter = null;
      return null;
    }
  }

  async function fetchAdminSnapshot(){
    // Prefer adapter if present.
    const ad = await loadAdminAdapter();
    if(ad?.fetchAdminSnapshot){
      return await ad.fetchAdminSnapshot();
    }
    if(ad?.getAdminSnapshot){
      return await ad.getAdminSnapshot();
    }
    const r = await fetch('/api/admin/snapshot', { credentials: 'include' });
    if(!r.ok){
      const txt = await r.text().catch(()=> '');
      const err = new Error(`snapshot_http_${r.status}`);
      err.status = r.status;
      err.body = txt;
      throw err;
    }
    return await r.json();
  }

  function snapshotToGraphFallback(snapshot){
    const nodes = [];
    const links = [];

    const now = snapshot?.now || Date.now();
    nodes.push({ id: 'now', label: 'now', kind: 'meta', value: now });

    if(snapshot?.daily){
      nodes.push({ id: 'daily', label: `daily ${snapshot.daily.ymd||''}`, kind: 'epoch', value: snapshot.daily.potCents||0 });
      links.push({ source:'now', target:'daily', kind:'epoch' });
    }
    if(snapshot?.weekly){
      nodes.push({ id: 'weekly', label: `weekly ${snapshot.weekly.yw||''}`, kind: 'epoch', value: snapshot.weekly.potCents||0 });
      links.push({ source:'now', target:'weekly', kind:'epoch' });
    }
    if(snapshot?.activity){
      nodes.push({ id:'act_day', label:'activity day', kind:'activity', value: snapshot.activity.todayScore||0 });
      nodes.push({ id:'act_week', label:'activity week', kind:'activity', value: snapshot.activity.weekScore||0 });
      links.push({ source:'daily', target:'act_day', kind:'activity' });
      links.push({ source:'weekly', target:'act_week', kind:'activity' });
    }
    if(snapshot?.catalogHealth){
      nodes.push({ id:'catalog', label:'catalog', kind:'catalog', value: (snapshot.catalogHealth.games||0) });
      links.push({ source:'now', target:'catalog', kind:'catalog' });
      const alerts = snapshot.catalogHealth.alerts || [];
      for(let i=0;i<Math.min(alerts.length, 12);i++){
        const a = alerts[i];
        const id = `alert_${i}`;
        nodes.push({ id, label: a.code||a.type||'alert', kind:'catalog', severity: a.level||a.severity||'warn', value: 1 });
        links.push({ source:'catalog', target:id, kind:'alert', severity: a.level||a.severity||'warn' });
      }
    }
    if(snapshot?.exclusions){
      nodes.push({ id:'excluded', label:'excluded', kind:'payout', value: snapshot.exclusions.payoutExcludedCount||0 });
      links.push({ source:'daily', target:'excluded', kind:'payout' });
    }

    return { nodes, links };
  }

  function updateFromSnapshot(snapshot, source='poll'){
    lastSnapshot = snapshot;
    lastSnapshotAt = Date.now();

    const ad = adminAdapter;
    const graph = (ad?.snapshotToGraph)
      ? ad.snapshotToGraph(snapshot)
      : snapshotToGraphFallback(snapshot);

    renderGraph(graph);

    // HUD summary (if present)
    if(hudStatus){
      const daily = snapshot?.daily?.ymd ? `${snapshot.daily.ymd}` : 'daily';
      const weekly = snapshot?.weekly?.yw ? `${snapshot.weekly.yw}` : 'weekly';
      const potD = snapshot?.daily?.potCents != null ? `$${(snapshot.daily.potCents/100).toFixed(2)}` : '--';
      const potW = snapshot?.weekly?.potCents != null ? `$${(snapshot.weekly.potCents/100).toFixed(2)}` : '--';
      const actD = snapshot?.activity?.todayScore != null ? snapshot.activity.todayScore : '--';
      const actW = snapshot?.activity?.weekScore != null ? snapshot.activity.weekScore : '--';
      hudStatus.textContent = `Snapshot (${source}) • ${daily} pot ${potD} • ${weekly} pot ${potW} • activity d:${actD} w:${actW} • ${ts(lastSnapshotAt)}`;
    }

    // Pulse on change
    spawnPulse(0x5adcff, 1.12, 'snapshot');
  }

  async function pollOnce(){
    try{
      const snap = await fetchAdminSnapshot();
      updateFromSnapshot(snap, 'poll');
      pushAudit('ok', 'snapshot_ok', { at: Date.now() });
    }catch(e){
      const status = e?.status || e?.statusCode || null;
      pushAudit('err', 'snapshot_failed', { status, err: String(e?.message||e) });
      if(hudStatus){
        hudStatus.textContent = status === 403
          ? 'Admin snapshot: 403 Forbidden (not admin / not signed in).'
          : `Admin snapshot error: ${String(e?.message||e)}`;
      }
      spawnPulse(0xff5078, 1.18, 'error');
    }
  }

  function startPolling(){
    stopPolling();
    // Poll quickly on enable, then every 5s.
    pollOnce();
    pollTimer = window.setInterval(pollOnce, 5000);
  }

  function stopPolling(){
    if(pollTimer){
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  }

  function renderAudit(){
    if(!auditHost) return;
    auditHost.innerHTML = '';
    const frag = document.createDocumentFragment();
    for(const e of audit.slice(0, 60)){
      const div = document.createElement('div');
      div.className = 'entry';
      const lvl = String(e.level||'').toLowerCase();
      const cls = (lvl === 'warn' || lvl === 'warning') ? 'warn'
        : (lvl === 'err' || lvl === 'error') ? 'err'
        : 'ok';
      div.innerHTML = `
        <span class="t">${e.t}</span>
        <span class="lvl ${cls}">${lvl || 'log'}</span>
        <span>${String(e.msg||'')}</span>
      `;
      frag.appendChild(div);
    }
    auditHost.appendChild(frag);
  }
  renderAudit();

  // Animation
  let tPrev = performance.now();
  let camAngle = 0;

  function resize(){
    const w = host.clientWidth;
    const h = host.clientHeight;
    if(w < 10 || h < 10) return;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function animate(){
    if(!alive) return;
    raf = requestAnimationFrame(animate);

    const tNow = performance.now();
    const dt = Math.min(0.05, (tNow - tPrev) / 1000);
    tPrev = tNow;

    // Core subtle motion
    core.rotation.y += dt * 0.10;
    core.rotation.x += dt * 0.06;
    shell.rotation.y += dt * 0.075;

    // Rings
    const rs = cfg.ringSpeed;
    r1.rotation.z += dt * 0.60 * rs;
    r2.rotation.x += dt * 0.48 * rs;
    r2.rotation.y += dt * 0.30 * rs;
    r3.rotation.y += dt * 0.40 * rs;
    r3.rotation.z += dt * 0.22 * rs;

    // Particles
    if(particles){
      particles.rotation.y += dt * 0.06;
      particles.rotation.x += dt * 0.03;
    }

    // Graph rotation (gentle)
    graphRoot.rotation.y += dt * 0.035 * cfg.graphIntensity;

    // Auto-orbit camera when not in admin mode
    if(!adminEnabled){
      camAngle += dt * cfg.orbitSpeed;
      const r = 6.1;
      const y = 0.22 + Math.sin(camAngle * 0.7) * 0.18;
      camera.position.set(Math.cos(camAngle)*r, y, Math.sin(camAngle)*r);
      camera.lookAt(0, 0.05, 0);
    }else{
      controls.update();
    }

    // Pulses lifecycle
    for(let i=pulses.length-1;i>=0;i--){
      const p = pulses[i];
      const age = (tNow - p.userData.t0);
      const life = 950;
      const k = clamp(age / life, 0, 1);
      p.scale.setScalar(1 + k*1.55);
      p.material.opacity = (1 - k) * 0.30;
      if(k >= 1){
        pulseRoot.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        pulses.splice(i,1);
      }
    }

    renderer.render(scene, camera);
  }

  // Resize + visibility handling
  const onResize = ()=>resize();
  window.addEventListener('resize', onResize, { passive: true });

  const onVis = ()=>{
    if(document.hidden){
      // reduce GPU churn while tab hidden
      renderer.setAnimationLoop(null);
    }
  };
  document.addEventListener('visibilitychange', onVis, { passive:true });

  resize();
  animate();

  // Public API
  const instance = {
    // Dispose everything (prevents WebGL context leaks).
    dispose(){
      if(!alive) return;
      alive = false;
      stopPolling();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);

      try{ controls.dispose(); }catch{}
      try{ renderer.dispose(); }catch{}

      clearGraph();
      rebuildParticles(); // this disposes old particles if any
      if(envTex && envTex.dispose) envTex.dispose();

      // Dispose rings/core/shell
      for(const obj of [core, shell, r1, r2, r3]){
        if(obj?.geometry) obj.geometry.dispose();
        if(obj?.material){
          if(Array.isArray(obj.material)) obj.material.forEach(m=>m.dispose());
          else obj.material.dispose();
        }
      }

      // Remove canvas
      try{
        if(renderer.domElement && renderer.domElement.parentNode === host){
          host.removeChild(renderer.domElement);
        }
      }catch{}

      delete host.__gaOrbInstance;
    },

    config: cfg,

    activity: {
      bumpMetric(key, delta=1){
        const k = String(key||'metric');
        const d = Number(delta)||1;
        pushAudit('ok', 'metric_bump', { key: k, delta: d });
        spawnPulse(0x5adcff, 1.12, k);
      },
      bumpSkillMetric(key, delta=1){
        const k = String(key||'skill');
        const d = Number(delta)||1;
        pushAudit('ok', 'skill_bump', { key: k, delta: d });
        spawnPulse(0x7aa6ff, 1.10, k);
      },
      bumpActivityBoard(key, delta=1){
        const k = String(key||'activity');
        const d = Number(delta)||1;
        pushAudit('ok', 'activity_bump', { key: k, delta: d });
        spawnPulse(0x7dff9a, 1.14, k);
      }
    },

    admin: {
      get enabled(){ return adminEnabled; },

      toggle(){ return setAdmin(!adminEnabled); },
      setEnabled(on){ return setAdmin(!!on); },

      injectSnapshot(snapshot, source='manual'){
        pushAudit('ok', 'snapshot_injected', { source });
        updateFromSnapshot(snapshot, source);
      },

      log(level, msg, meta){
        return pushAudit(level, msg, meta);
      },

      pollNow(){
        return pollOnce();
      },

      exportConfig(){
        downloadText('ga_orb_config_v2.4.json', JSON.stringify(cfg, null, 2));
      },

      importConfigFromPrompt(){
        const raw = prompt('Paste config JSON');
        if(!raw) return false;
        try{
          const next = JSON.parse(raw);
          cfg.ringSpeed = clamp(Number(next.ringSpeed)||cfg.ringSpeed, 0, 3);
          cfg.orbitSpeed = clamp(Number(next.orbitSpeed)||cfg.orbitSpeed, 0, 0.35);
          cfg.fogDensity = clamp(Number(next.fogDensity)||cfg.fogDensity, 0, 0.09);
          cfg.graphIntensity = clamp(Number(next.graphIntensity)||cfg.graphIntensity, 0, 2);
          cfg.particles = !!next.particles;
          cfg.arcs = !!next.arcs;
          cfg.shell = !!next.shell;

          shell.visible = !!cfg.shell;
          rebuildParticles();
          saveJsonLS(CONFIG_KEY, cfg);
          pushAudit('ok', 'config_imported');
          return true;
        }catch(e){
          pushAudit('err', 'config_import_failed', { err: String(e?.message||e) });
          return false;
        }
      },

      resetConfig(){
        Object.assign(cfg, DEFAULT_CFG);
        shell.visible = !!cfg.shell;
        rebuildParticles();
        saveJsonLS(CONFIG_KEY, cfg);
        pushAudit('ok', 'config_reset');
      },

      exportAuditJson(){
        downloadText('ga_orb_audit_v2.4.json', JSON.stringify(audit, null, 2));
      },

      exportAuditCsv(){
        downloadText('ga_orb_audit_v2.4.csv', auditToCsv(audit), 'text/csv');
      },

      clearAudit(){
        audit.length = 0;
        saveJsonLS(AUDIT_KEY, audit);
        renderAudit();
        pushAudit('warn', 'audit_cleared');
      },

      bindStandaloneControls(ui){
        // Called by /orb/index.html to wire sliders/buttons (safe no-op elsewhere).
        if(!ui) return;
        const setLabel = (el, t)=>safeText(el, t);

        const fmt = (n, digits=3)=>Number(n).toFixed(digits);

        const syncLabels = ()=>{
          setLabel(ui.ring?.label, `ringSpeed: ${fmt(cfg.ringSpeed, 2)}`);
          setLabel(ui.orbit?.label, `orbitSpeed: ${fmt(cfg.orbitSpeed, 3)} rad/s`);
          setLabel(ui.fog?.label, `fogDensity: ${fmt(cfg.fogDensity, 3)}`);
          setLabel(ui.graph?.label, `graphIntensity: ${fmt(cfg.graphIntensity, 2)}`);
        };
        syncLabels();

        const bindRange = (ref, onVal)=>{
          const input = ref?.input;
          if(!input) return;
          input.addEventListener('input', ()=>{
            onVal(Number(input.value||0));
            saveJsonLS(CONFIG_KEY, cfg);
            syncLabels();
          }, { passive:true });
        };

        bindRange(ui.ring, (v)=>{
          cfg.ringSpeed = clamp(v / 100, 0, 3);
        });

        bindRange(ui.orbit, (v)=>{
          cfg.orbitSpeed = clamp(v / 1000, 0, 0.35);
        });

        bindRange(ui.fog, (v)=>{
          cfg.fogDensity = clamp(v / 1000, 0, 0.09);
          scene.fog.density = cfg.fogDensity;
        });

        bindRange(ui.graph, (v)=>{
          cfg.graphIntensity = clamp(v / 100, 0, 2);
        });

        // Buttons
        ui.buttons?.exportCfg?.addEventListener('click', ()=>instance.admin.exportConfig());
        ui.buttons?.importCfg?.addEventListener('click', ()=>{
          const ok = instance.admin.importConfigFromPrompt();
          if(ui.hudStatus) ui.hudStatus.textContent = ok ? 'Config imported.' : 'Config import failed.';
          shell.visible = !!cfg.shell;
          rebuildParticles();
          syncLabels();
        });
        ui.buttons?.resetCfg?.addEventListener('click', ()=>{
          instance.admin.resetConfig();
          if(ui.hudStatus) ui.hudStatus.textContent = 'Config reset.';
          syncLabels();
        });
        ui.buttons?.auditJson?.addEventListener('click', ()=>instance.admin.exportAuditJson());
        ui.buttons?.auditCsv?.addEventListener('click', ()=>instance.admin.exportAuditCsv());
        ui.buttons?.auditClear?.addEventListener('click', ()=>{
          if(confirm('Clear audit log?')) instance.admin.clearAudit();
        });

        // Mirror admin toggle in DOM dataset (if provided)
        if(ui.adminPanel){
          ui.adminPanel.style.display = adminEnabled ? 'block' : 'none';
        }

        // Keep audit visible
        if(ui.auditHost){
          // already rendering to #auditLog; nothing else needed
        }

        // Keep admin button text in sync (optional)
        if(ui.adminButton){
          ui.adminButton.textContent = adminEnabled ? 'Admin: ON' : 'Admin: OFF';
        }

        // If we’re already in admin mode on boot, ensure polling.
        if(adminEnabled) startPolling();
      }
    }
  };

  // default admin state
  setAdmin(adminEnabled);

  host.__gaOrbInstance = instance;

  return instance;
}
