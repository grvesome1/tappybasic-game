/* built by gruesøme */
/* Z3J1ZXPDuG1l */
/* SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f2999e2373f */

const VERSION = document.documentElement.dataset.version || '2.7';
const LS_SELECTION_KEY = `avatar_studio_selection_${VERSION}`;
const LS_MINT_KEY = `avatar_studio_mint_${VERSION}`;
const LS_NICK_KEY = `avatar_studio_nick_${VERSION}`;
const NICK_MAX = 24;

// ---- Embedded bridge (Arcade dashboard) ----
const EMBED = {
  channel: 'GRUESOME_ARCADE_V1',
  enabled: false,
  requestSeq: 0,
  pendingMint: null,
  snapshotTimer: 0,
  previewTimer: 0,
  lastPreviewPng: null,
  promoBusy: false,
};

function isEmbedded(){
  try { return window.parent && window.parent !== window; } catch { return false; }
}

function sameOriginMessage(ev){
  try { return !!ev && ev.origin === window.location.origin; } catch { return false; }
}

function postToParent(type, payload){
  if (!EMBED.enabled) return false;
  const msg = { channel: EMBED.channel, type, requestId: String(++EMBED.requestSeq), payload: payload || {} };

  // Prefer same-origin targetOrigin for safety, but fall back to '*' when
  // embedded under a strict sandbox (opaque origin 'null') to avoid throwing.
  try {
    window.parent.postMessage(msg, window.location.origin);
    return true;
  } catch {}

  try {
    window.parent.postMessage(msg, '*');
    return true;
  } catch {
    return false;
  }
}

async function selectionPreviewPng(sel){
  const safeSel = normalizeSelection(sel || defaultSelection());
  const base = await renderAvatar(safeSel);
  const out = document.createElement('canvas');
  out.width = 512;
  out.height = 512;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.clearRect(0,0,512,512);
  octx.drawImage(base, 0, 0, 512, 512);
  return out.toDataURL('image/png');
}

function schedulePostSnapshot(){
  if (!EMBED.enabled) return;
  if (EMBED.snapshotTimer) clearTimeout(EMBED.snapshotTimer);
  EMBED.snapshotTimer = setTimeout(() => {
    EMBED.snapshotTimer = 0;
    postSnapshot().catch(()=>{});
  }, 450);
}

async function postSnapshot(){
  if (!EMBED.enabled) return;
  try{
    const sel = deepClone(state.selection || defaultSelection());
    const dna = compactDNA(sel);
    const hash = await sha256Hex(dna);
    const nickname = sanitizeNickname(state.nickname || '');
    let previewPng = null;
    try {
      previewPng = await selectionPreviewPng(sel);
      EMBED.lastPreviewPng = previewPng;
    } catch {
      previewPng = EMBED.lastPreviewPng;
    }

    const studioState = { version: VERSION, selection: sel, minted: !!state.minted, nickname };
    postToParent('GA_STUDIO_SNAPSHOT', {
      nickname,
      dna,
      hash,
      minted: !!state.minted,
      tokenId: state.mintRecord?.tokenId || (state.minted ? (state.mintRecord?.tokenId || '') : ''),
      explorerUrl: state.mintRecord?.explorerUrl || '',
      previewPng: previewPng || '',
      studioState,
    });
  } catch {
    // best-effort only
  }
}

function buildRandomSelection(){
  const sel = {};
  for (const [cat] of CAT_ORDER){
    sel[cat] = randomPick(cat);
  }
  return normalizeSelection(sel);
}

async function postRandomPreviewToParent(){
  if (!EMBED.enabled) return;
  if (EMBED.promoBusy) return;
  EMBED.promoBusy = true;
  try{
    const sel = buildRandomSelection();
    const png = await selectionPreviewPng(sel);
    postToParent('GA_STUDIO_RANDOM_PREVIEW', { previewPng: png || '' });
  } catch {
    postToParent('GA_STUDIO_RANDOM_PREVIEW', { previewPng: '' });
  } finally {
    EMBED.promoBusy = false;
  }
}

function requestMintViaParent(source){
  if (!EMBED.enabled) return false;
  const sel = deepClone(state.selection || defaultSelection());
  const nickname = sanitizeNickname(state.nickname || '');
  // Hash is computed async; send DNA now, hash best-effort.
  const dna = compactDNA(sel);
  postToParent('GA_STUDIO_REQUEST_MINT', { source: String(source || 'studio'), dna, nickname });
  return true;
}

function sanitizeNickname(input){
  let s = String(input ?? '').trim();
  if(!s) return '';
  s = s.replace(/\s+/g,' ');
  s = s.replace(/[^a-zA-Z0-9 _\.-]/g,'').trim();
  if(!s) return '';
  if(s.length > NICK_MAX) s = s.slice(0, NICK_MAX);
  return s;
}


const $ = (sel) => document.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function toast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 1600);
}

function safeJSONParse(str){
  try{ return JSON.parse(str); }catch{ return null; }
}

function deepClone(x){
  return JSON.parse(JSON.stringify(x));
}

function downloadBlob(filename, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    toast('Copied');
  }catch{
    toast('Clipboard blocked');
  }
}

async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b => b.toString(16).padStart(2,'0')).join('');
}

// ---- Traits loading ----

function ensureNoneFirst(list){
  if(!Array.isArray(list)) return list;
  const idx = list.findIndex(t => t?.id === 'none');
  if(idx > 0){
    const [noneTrait] = list.splice(idx, 1);
    list.unshift(noneTrait);
  }
  return list;
}

async function loadTraits(){
  const res = await fetch('traits.json', { cache: 'no-store' });
  if(!res.ok) throw new Error(`Failed to load traits.json (${res.status})`);
  const data = await res.json();
  if(data && typeof data === 'object'){
    for(const cat of Object.keys(data)){
      ensureNoneFirst(data[cat]);
    }
  }
  return data;
}

// Desired category order in UI + DNA
const CAT_ORDER = [
  ['background','Background'],
  ['outfit','Outfit'],
  ['head','Head'],
  ['eyes','Eyes'],
  ['mouth','Mouth'],
  ['hair','Hair'],
  ['eyewear','Eyewear'],
  ['helmet','Helmet'],
  ['accessory','Accessory'],
  ['effect','Effect'],
];

const DRAW_ORDER = ['background','outfit','head','eyes','mouth','hair','eyewear','helmet','accessory','effect'];

const PONYTAIL_BEHIND_HEAD_MASKS = [
  // Main vertical ponytail block.
  { x: 0, y: 20, w: 47, h: 108 },
  // Tiny ear-adjacent chip that tends to peek through.
  { x: 47, y: 54, w: 4, h: 22 },
];

let traitDB = null;
let imgCache = new Map();
let assetProblems = new Set();

function getTrait(cat, id){
  const list = traitDB?.[cat] || [];
  return list.find(t => t.id === id) || list[0] || null;
}

function defaultSelection(){
  const sel = {};
  for(const [cat] of CAT_ORDER){
    const list = traitDB?.[cat] || [];
    const none = list.find(t => t.id === 'none');
    sel[cat] = (none ? 'none' : (list[0]?.id || 'none'));
  }
  return sel;
}

function normalizeSelection(sel){
  const out = {};
  for(const [cat] of CAT_ORDER){
    const list = traitDB?.[cat] || [];
    const ids = new Set(list.map(t => t.id));
    const wanted = sel?.[cat];
    out[cat] = ids.has(wanted) ? wanted : (ids.has('none') ? 'none' : (list[0]?.id || 'none'));
  }
  return out;
}

async function loadImage(url){
  if(imgCache.has(url)) return imgCache.get(url);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
  // If a load fails, don't permanently poison the cache.
  p.catch(() => imgCache.delete(url));
  imgCache.set(url, p);
  return p;
}

function markAssetProblem(file){
  if(assetProblems.has(file)) return;
  assetProblems.add(file);
  const chip = $('#chipStatus');
  const text = $('#chipStatusText');
  if(text) text.textContent = 'Assets: missing files';
  if(chip) chip.classList.add('bad');
  toast('Missing asset file');
}

// ---- Hands (auto) ----

const SLEEVE = {
  navy:    '#25467a',
  crimson: '#8b1e2d',
  steel:   '#4b5563',
  neon:    '#18a34a',
  blue:    '#2256a6',
  black:   '#1f2937',
};

const GLOVE_OVERRIDE = true; // hands match outfit sleeve (glove look)

const SKIN = {
  porcelain: '#FFE0BD',
  light:     '#F1C27D',
  tan:       '#E0AC69',
  brown:     '#C68642',
  deep:      '#8D5524',
  olive:     '#BAA487',
};

function getOutfitVariant(outfitId){
  const id = String(outfitId || '').toLowerCase();
  const keys = Object.keys(SLEEVE);

  for(const k of keys){
    if(id === k) return k;
    if(id.endsWith('_' + k)) return k;
    if(id.includes('_' + k + '_')) return k;
    if(id.includes('_' + k)) return k;
  }

  if(id.includes('_red') || id.endsWith('red')) return 'crimson';
  if(id.includes('_white') || id.endsWith('white')) return 'steel';
  if(id.includes('_olive') || id.endsWith('olive')) return 'steel';
  return 'navy';
}

function shadeHex(hex, amt){
  const h = hex.replace('#','');
  const n = parseInt(h,16);
  let r = (n>>16)&255;
  let g = (n>>8)&255;
  let b = n&255;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

function getHandPose(accessoryId){
  // Hands are the only “body” geometry now (no drawn arms). We place them to sit
  // naturally at the bottom and snap to grips for handheld accessories.
  const pose = {
    left:  { x: 28, y: 108, style: 'relax' },
    right: { x: 94, y: 108, style: 'relax' },
  };

  // --- Right-hand handhelds ---
  if(['pistol','revolver'].includes(accessoryId)){
    pose.right = { x: 96, y: 100, style: 'grip' };
  }
  if(['coffee','scanner','microchip','plasma_orb','trophy'].includes(accessoryId)){
    pose.right = { x: 90, y: 104, style: 'grip' };
  }
  if(['sword','greatsword','katana','blade_neon','axe','hammer','baton'].includes(accessoryId)){
    pose.right = { x: 88, y: 102, style: 'gripTall' };
  }

  if(accessoryId === 'greatsword'){
    pose.right.x += 6;
  }

  // --- Left-hand weapons ---
  if(['smg','rifle','shotgun','guitar'].includes(accessoryId)){
    pose.left = { x: 24, y: 102, style: 'gripL' };
  }

  if(accessoryId === 'guitar'){
    pose.left.y -= 3;
  }

  // SMG: slight right-hand nudge
  if(accessoryId === 'smg'){
    pose.right.x += 4;
    pose.right.y -= 4;
  }

  // --- Two-hand rifles (rifle1/rifle2) ---
  if(['rifle1','rifle2'].includes(accessoryId)){
    // Requested offsets from the default relaxed pose:
    // left: +10x, -10y; right: +5x, -10y
    pose.left = { x: 48, y: 103, style: 'gripL' };
    pose.right = { x: 101, y: 94, style: 'grip' };
  }

  if(accessoryId === 'rifle2'){
    pose.left.x += 4;
  }

  if(accessoryId === 'rifle1'){
    pose.right.x -= 3;
  }

  // Shotgun: treat like a two-hand long gun (similar to rifles)
  if(accessoryId === 'shotgun'){
    pose.left = { x: 51, y: 98, style: 'gripL' };
    pose.right = { x: 95, y: 95, style: 'grip' };
  }

  // Items that don’t need a hand snap
  if(['drone','flag','none'].includes(accessoryId)){
    // keep default
  }

  return pose;
}

function drawPixelHand(ctx, x, y, base, variant='relax', flip=false){
  const outline = shadeHex(base, -55);
  const shade = shadeHex(base, -22);
  const hi = shadeHex(base, 20);

  // 9x9 micro-sprites. '.' transparent, 'o' outline, 'b' base, 's' shade, 'h' highlight
  const SPRITES = {
    relax: [
      '...oooo..',
      '..obbbbo.',
      '..obbbbo.',
      '..obbbbo.',
      '..obbbbo.',
      '..obbbbo.',
      '..osbbso.',
      '...oohoo.',
      '....ss...',
    ],
    grip: [
      '..ooooo..',
      '.obbbbo..',
      '.obbbbo..',
      '.obbbbo..',
      '.obbbbo..',
      '.obbbbo..',
      '.osbbso..',
      '..oohoo..',
      '...ss....',
    ],
    gripTall: [
      '..ooooo..',
      '.obbbbo..',
      '.obbbbo..',
      '.obbbbo..',
      '.obbbbo..',
      '.obbbbo..',
      '.osbbso..',
      '..oohoo..',
      '...ss....',
    ],
    gripL: [
      '..ooooo..',
      '..obbbbo.',
      '..obbbbo.',
      '..obbbbo.',
      '..obbbbo.',
      '..obbbbo.',
      '..osbbso.',
      '..oohoo..',
      '...ss....',
    ],
  };

  const sprite = SPRITES[variant] || SPRITES.relax;
  const h = sprite.length;
  const w = sprite[0].length;

  for(let ry=0; ry<h; ry++){
    const row = sprite[ry];
    for(let rx=0; rx<w; rx++){
      const ch = row[rx];
      if(ch === '.') continue;
      const px = flip ? (w-1-rx) : rx;
      let color = base;
      if(ch === 'o') color = outline;
      else if(ch === 's') color = shade;
      else if(ch === 'h') color = hi;
      ctx.fillStyle = color;
      ctx.fillRect((x+px)|0, (y+ry)|0, 1, 1);
    }
  }
}

function drawAutoHands(ctx, sleeveColor, skinHex, leftHand, rightHand){
  // If outfits have gloves, hands should match sleeves.
  const base = GLOVE_OVERRIDE ? shadeHex(sleeveColor, -8) : skinHex;
  drawPixelHand(ctx, leftHand.x, leftHand.y, base, leftHand.style, true);
  drawPixelHand(ctx, rightHand.x, rightHand.y, base, rightHand.style, false);
}

// ---- Rendering ----

const BASE_OFFSET = {
  head:    { dx: -6, dy: 12 },
  eyes:    { dx: -6, dy: 11 },
  mouth:   { dx: -6, dy:  8 },
  eyewear: { dx: -6, dy: 11 },
  hair:    { dx: -8, dy: -6 },
  helmet:  { dx: -6, dy: -3 },
  effect:  { dx: -6, dy:  0 },
  accessory:{ dx: 0, dy:  0 },
};

function extraOffset(cat, id){
  let dx = 0, dy = 0;

  // Hair tuning by style
  if(cat === 'hair'){
    if(String(id).startsWith('afro_')) dy -= 7;
    if(String(id).startsWith('buzz_')) dy += 10;
    if(String(id).startsWith('fringe_')) dy += 10;
    if(String(id).startsWith('messy_')) { dx += 1; dy += 8; }
    if(String(id).startsWith('mohawk_')) dy += 6;
    if(String(id).startsWith('spiky_')) { dx += 0; dy += 13; }
    if(String(id).startsWith('ponytail_')) { dx += 6; dy += 13; }
    if(String(id).startsWith('dread_')) dy -= 2;
  }

  // Eyewear: keep centered with eyes (no per-item nudges)

  // Helmet tuning
  if(cat === 'helmet'){
    if(id === 'skull') dy += 15;
    if(id === 'biker') dy += 15;
    if(id === 'riot'){ dx += 0; dy += 14; }
    if(id === 'crown'){ dx -= 1; dy += 8; }
    if(id === 'bandana'){ dx += 22; dy -= 1; }
    if(id === 'space'){ dx += 5; dy -= 3; }
    if(id === 'tactical') dy += 3;
  }

  // Effects
  if(cat === 'effect'){
    if(id === 'smoke'){ dx += 4; dy -= 4; }
  }

  // Accessories
  if(cat === 'accessory'){
    if(id === 'revolver'){ dx += 2; dy -= 2; }
    if(id === 'greatsword') dx += 6;
    if(id === 'blade_neon'){ dx += 5; dy += 5; }
    if(id === 'guitar') dx -= 5;
    if(id === 'trophy'){ dx -= 8; dy += 2; }
    if(id === 'scanner'){ dx -= 8; dy -= 5; }
    if(id === 'flag'){ dx += 6; dy += 2; }
    if(id === 'coffee'){ dx -= 14; dy += 0; }
  }

  return { dx, dy };
}

function offsetFor(cat, id){
  const base = BASE_OFFSET[cat] || { dx: 0, dy: 0 };
  const ex = extraOffset(cat, id);
  return { dx: base.dx + ex.dx, dy: base.dy + ex.dy };
}

async function renderAvatar(selection){
  const base = document.createElement('canvas');
  base.width = 128; base.height = 128;
  const bctx = base.getContext('2d');
  bctx.imageSmoothingEnabled = false;
  bctx.clearRect(0,0,128,128);

  const ponytailTrait = String(selection.hair || '').startsWith('ponytail_')
    ? getTrait('hair', selection.hair)
    : null;
  const ponytailOffset = ponytailTrait ? offsetFor('hair', ponytailTrait.id) : null;
  let ponytailBackDrawn = false;

  const outfitId = selection.outfit;
  const headId = selection.head;
  const accessoryId = selection.accessory;

  // Special-case: cigar/cigarette should be visible above helmets, but without
  // the baked-in mouth pixels from those assets.
  const mouthOverlayId = (selection.mouth === 'cigar' || selection.mouth === 'cigarette')
    ? selection.mouth
    : null;
  let mouthOverlayDrawn = false;

  const pose = getHandPose(accessoryId);

  // Determine glove/sleeve color from outfit variant
  const outfitVariant = getOutfitVariant(outfitId);
  const sleeveColor = SLEEVE[outfitVariant] || SLEEVE.navy;
  const skinHex = SKIN[headId] || SKIN.porcelain;

  for(const cat of DRAW_ORDER){
    let trait = getTrait(cat, selection[cat]);
    if(!trait) continue;

    // If mouth is cigar/cigarette, draw a neutral mouth in the mouth layer.
    if(cat === 'mouth' && mouthOverlayId){
      trait = getTrait('mouth', 'neutral') || trait;
    }

    const {dx,dy} = offsetFor(cat, trait.id);

    if(cat === 'head' && ponytailTrait && ponytailOffset && !ponytailBackDrawn){
      ponytailBackDrawn = true;
      try{
        const pimg = await loadImage(ponytailTrait.file);
        bctx.save();
        bctx.beginPath();
        for(const m of PONYTAIL_BEHIND_HEAD_MASKS){
          bctx.rect(
            ponytailOffset.dx + m.x,
            ponytailOffset.dy + m.y,
            m.w,
            m.h,
          );
        }
        bctx.clip();
        bctx.drawImage(pimg, ponytailOffset.dx, ponytailOffset.dy, 128, 128);
        bctx.restore();
      }catch(err){
        console.error(err);
        markAssetProblem(ponytailTrait.file);
      }
    }

    // Hands should appear above accessories, but below effects.
    if(cat === 'effect'){
      drawAutoHands(bctx, sleeveColor, skinHex, pose.left, pose.right);
    }

    try{
      const img = await loadImage(trait.file);

      if(cat === 'hair' && ponytailTrait && trait.id === ponytailTrait.id){
        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = 128;
        overlayCanvas.height = 128;
        const octx = overlayCanvas.getContext('2d');
        octx.imageSmoothingEnabled = false;
        octx.clearRect(0, 0, 128, 128);

        octx.drawImage(img, 0, 0, 128, 128);
        octx.globalCompositeOperation = 'destination-out';
        for(const m of PONYTAIL_BEHIND_HEAD_MASKS){
          octx.fillRect(m.x, m.y, m.w, m.h);
        }
        octx.globalCompositeOperation = 'source-over';

        bctx.drawImage(overlayCanvas, dx, dy, 128, 128);
        continue;
      }

      let drawX = dx;
      let drawY = dy;
      let drawW = 128;
      let drawH = 128;

      // Per-trait scaling/cropping (kept local to rendering only)
      if(cat === 'hair' && String(trait.id).startsWith('afro_')){
        const scale = 0.85; // 15% smaller
        const cropBottomPx = 20;

        const baseDestH = Math.round(128 * scale);
        drawW = Math.round(128 * scale);
        drawH = baseDestH;

        // Keep the same top alignment as the previous afro scaling.
        drawX = dx + Math.round((128 - drawW) / 2);
        drawY = dy + Math.round((128 - baseDestH) / 2);

        // Clean slice: draw normally, clip away the bottom rows (no stretching).
        const cropH = Math.max(0, drawH - Math.round(cropBottomPx * scale));
        bctx.save();
        bctx.beginPath();
        bctx.rect(drawX, drawY, drawW, cropH);
        bctx.clip();
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
        bctx.restore();
      }else if(cat === 'hair' && String(trait.id).startsWith('spiky_')){
        const scale = 1.10; // 10% bigger
        drawW = Math.round(128 * scale);
        drawH = Math.round(128 * scale);
        drawX = dx + Math.round((128 - drawW) / 2);
        drawY = dy + Math.round((128 - drawH) / 2);
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }else if(cat === 'helmet' && trait.id === 'biker'){
        const scale = 1.10; // 10% bigger
        drawW = Math.round(128 * scale);
        drawH = Math.round(128 * scale);
        drawX = dx + Math.round((128 - drawW) / 2);
        drawY = dy + Math.round((128 - drawH) / 2);
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }else if(cat === 'helmet' && trait.id === 'skull'){
        const scale = 1.10; // 10% bigger
        drawW = Math.round(128 * scale);
        drawH = Math.round(128 * scale);
        drawX = dx + Math.round((128 - drawW) / 2);
        drawY = dy + Math.round((128 - drawH) / 2);
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }else if(cat === 'helmet' && trait.id === 'tactical'){
        const scale = 0.90; // 10% smaller
        drawW = Math.round(128 * scale);
        drawH = Math.round(128 * scale);
        drawX = dx + Math.round((128 - drawW) / 2);
        drawY = dy + Math.round((128 - drawH) / 2);
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }else if(cat === 'helmet' && trait.id === 'space'){
        const scale = 0.731025; // 5% smaller again
        drawW = Math.round(128 * scale);
        drawH = Math.round(128 * scale);
        drawX = dx + Math.round((128 - drawW) / 2);
        drawY = dy + Math.round((128 - drawH) / 2);
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }else if(cat === 'accessory' && trait.id === 'pistol'){
        const scale = 1.1025; // 5% bigger again
        drawW = Math.round(128 * scale);
        drawH = Math.round(128 * scale);
        drawX = dx - Math.round((drawW - 128) / 2);
        drawY = dy - Math.round((drawH - 128) / 2) - 5;
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }else if(cat === 'accessory' && trait.id === 'smg'){
        const scale = 1.05; // 5% bigger
        drawW = Math.round(128 * scale);
        drawH = Math.round(128 * scale);
        drawX = dx - Math.round((drawW - 128) / 2);
        drawY = dy - Math.round((drawH - 128) / 2);
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }else if(cat === 'accessory' && trait.id === 'katana'){
        const scale = 1.26; // 5% bigger
        drawW = Math.round(128 * scale);
        drawH = Math.round(128 * scale);
        drawX = dx - Math.round((drawW - 128) / 2) - 11;
        drawY = dy - Math.round((drawH - 128) / 2) - 12;
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }else if(cat === 'accessory' && (trait.id === 'rifle1' || trait.id === 'rifle2')){
        const scale = 1.63296; // 10% smaller
        drawW = Math.round(128 * scale);
        drawH = Math.round(128 * scale);
        // Keep the same center as the unscaled draw (dx,dy with 128x128).
        drawX = dx - Math.round((drawW - 128) / 2) + 18;
        drawY = dy - Math.round((drawH - 128) / 2) - 28;
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }else if(cat === 'accessory' && trait.id === 'shotgun'){
        // Match the current rifle sizing/placement tuning.
        const scale = 1.551312; // 5% smaller
        drawW = Math.round(128 * scale);
        drawH = Math.round(128 * scale);
        drawX = dx - Math.round((drawW - 128) / 2) + 12;
        drawY = dy - Math.round((drawH - 128) / 2) - 25;
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }else if(cat === 'eyewear' && trait.id === 'analyzer'){
        // Analyzer: a small single-eye overlay over the avatar's right eye.
        const scale = 0.20; // 5x smaller
        drawW = Math.max(1, Math.round(128 * scale));
        drawH = Math.max(1, Math.round(128 * scale));

        // Position within the 128x128 eyewear frame.
        // "Avatar's right" == viewer's left.
        const localCenterX = 88;
        const localCenterY = 48;
        drawX = dx + localCenterX - Math.round(drawW / 2);
        drawY = dy + localCenterY - Math.round(drawH / 2);

        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }else if(cat === 'eyewear' && trait.id === 'monocle'){
        // Monocle is directional: mirror it and nudge slightly upward.
        drawX = dx;
        drawY = dy - 5;
        drawW = 128;
        drawH = 128;
        bctx.save();
        bctx.translate(drawX + drawW, drawY);
        bctx.scale(-1, 1);
        bctx.drawImage(img, 0, 0, drawW, drawH);
        bctx.restore();
      }else{
        bctx.drawImage(img, drawX, drawY, drawW, drawH);
      }
    }catch(err){
      console.error(err);
      markAssetProblem(trait.file);
      // Fall through; we still want to attempt mouth overlay draw for this layer.
    }

    // After accessories render, draw cigar/cigarette overlay on top of accessories.
    // This keeps it visible above helmets and accessories, but still below effects.
    if(cat === 'accessory' && mouthOverlayId && !mouthOverlayDrawn){
      mouthOverlayDrawn = true;
      try{
        const overlayTrait = getTrait('mouth', mouthOverlayId);
        const neutralTrait = getTrait('mouth', 'neutral');
        if(overlayTrait && neutralTrait){
          const [overlayImg, neutralImg] = await Promise.all([
            loadImage(overlayTrait.file),
            loadImage(neutralTrait.file),
          ]);

          const overlayCanvas = document.createElement('canvas');
          overlayCanvas.width = 128;
          overlayCanvas.height = 128;
          const octx = overlayCanvas.getContext('2d');
          octx.imageSmoothingEnabled = false;
          octx.clearRect(0, 0, 128, 128);

          const { dx: odx, dy: ody } = offsetFor('mouth', overlayTrait.id);
          const { dx: ndx, dy: ndy } = offsetFor('mouth', neutralTrait.id);

          // Draw full cigar/cigarette mouth asset.
          octx.drawImage(overlayImg, odx, ody, 128, 128);
          // Punch out the neutral mouth pixels to leave only the item.
          octx.globalCompositeOperation = 'destination-out';
          octx.drawImage(neutralImg, ndx, ndy, 128, 128);
          octx.globalCompositeOperation = 'source-over';

          bctx.drawImage(overlayCanvas, 0, 0);
        }
      }catch(err){
        console.error(err);
        // Don't hard-fail rendering if overlay can't draw.
      }
    }
  }

  return base;
}

// ---- Metadata / DNA ----

function compactDNA(sel){
  const map = {
    background: 'bg',
    outfit: 'o',
    head: 'h',
    eyes: 'e',
    mouth: 'm',
    hair: 'hr',
    eyewear: 'ew',
    helmet: 'hl',
    accessory: 'a',
    effect: 'fx',
  };
  const parts = [];
  for(const [cat] of CAT_ORDER){
    const short = map[cat] || cat;
    parts.push(`${short}=${sel[cat] || 'none'}`);
  }
  return parts.join(';');
}

function buildMetadata(sel, dna, hash, minted, nickname){
  const nick = sanitizeNickname(nickname);
  const attrs = [];
  for(const [cat,label] of CAT_ORDER){
    attrs.push({ trait_type: label, value: sel[cat] || 'none' });
  }
  if(nick) attrs.unshift({ trait_type: 'Nickname', value: nick });

  return {
    name: nick ? `Gruesøme PRO Avatar — ${nick}` : 'Gruesøme PRO Avatar',
    description: minted
      ? 'Gen1 PRO Avatar (starts soulbound) for Gruesøme’s Arcade. Nickname shows on leaderboards/public pages while PRO is active and SBT. tokenURI immutable. When the next Avatar Studio releases, this NFT will unlock and become tradeable.'
      : 'Unminted draft. Customize your Gen1 PRO Avatar, set a nickname, then mint/lock. After minting it starts soulbound; when the next Avatar Studio releases, it will unlock and become tradeable.',
    image: 'ipfs://__REPLACE_WITH_PINNED_PNG_CID__',
    external_url: 'https://gruesomesarcade.com',
    dna,
    hash,
    minted: !!minted,
    attributes: attrs,
  };
}

// ---- State + UI ----

const state = {
  tab: CAT_ORDER[0][0],
  search: '',
  selection: null,
  minted: false,
  nickname: '',
  mintRecord: null,
  busy: false,
  pendingRender: false,
};

function setInteractivityUI(){
  const editLocked = state.minted || state.busy;
  const actionLocked = state.busy;

  // Buttons that change DNA / selection
  for(const id of ['btnRandom','btnRoll','btnMint']){
    const b = $('#'+id);
    if(!b) continue;
    b.disabled = editLocked;
  }

  // Export action (PNG is only available after mint)
  {
    const b = $('#btnExport');
    if(b) b.disabled = actionLocked || !state.minted;
  }

  // Copy/download helpers
  for(const id of ['btnCopyDNA','btnCopyHash','btnCopyJSON','btnDownloadJSON']){
    const b = $('#'+id);
    if(!b) continue;
    b.disabled = actionLocked;
  }

  // Soft-disable trait interactions
  $('#search').disabled = editLocked;
  const nickEl = $('#nickname');
  if(nickEl) nickEl.disabled = editLocked;
  $('#tabs').classList.toggle('disabled', editLocked);
  $('#grid').classList.toggle('disabled', editLocked);
}

function setMintUI(){
  const pill = $('#mintPill');
  const mintMeta = $('#mintMeta');
  if(state.minted){
    pill.textContent = 'Minted (locked)';
    pill.style.borderColor = 'rgba(16,185,129,.55)';
    pill.style.background = 'rgba(16,185,129,.12)';
    mintMeta.textContent = state.mintRecord?.mintedAt ? state.mintRecord.mintedAt : 'yes';
  }else{
    pill.textContent = 'Not minted';
    pill.style.borderColor = '';
    pill.style.background = '';
    mintMeta.textContent = 'no';
  }

  setInteractivityUI();
}

function rebuildTabs(){
  const tabs = $('#tabs');
  tabs.innerHTML = '';
  for(const [cat,label] of CAT_ORDER){
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = state.tab === cat;
    btn.className = 'tab' + (isActive ? ' active' : '');
    btn.textContent = label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.tabIndex = isActive ? 0 : -1;
    btn.addEventListener('click', () => {
      if(state.minted) return toast('Minted — editing locked');
      state.tab = cat;
      rebuildTabs();
      rebuildGrid();
    });
    tabs.appendChild(btn);
  }
}

function rarityClass(r){
  // CSS expects `r-*` classes.
  if(!r) return 'r-common';
  const x = String(r).toLowerCase();
  if(x.includes('legend')) return 'r-legendary';
  if(x.includes('uncommon')) return 'r-uncommon';
  // Keep epic visually grouped with rare without adding new styling tokens.
  if(x.includes('epic')) return 'r-rare';
  if(x.includes('rare')) return 'r-rare';
  return 'r-common';
}

function rebuildGrid(){
  const grid = $('#grid');
  grid.innerHTML = '';

  const cat = state.tab;
  const list = traitDB?.[cat] || [];
  const q = (state.search || '').trim().toLowerCase();

  const filtered = list.filter(t => {
    if(!q) return true;
    return (t.name || '').toLowerCase().includes(q) || (t.id || '').toLowerCase().includes(q);
  });

  $('#gridCount').textContent = `${filtered.length} items`;

  for(const t of filtered){
    const card = document.createElement('div');
    const active = state.selection[cat] === t.id;
    card.className = 'card' + (active ? ' active' : '') + (state.minted ? ' locked' : '');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', active ? 'true' : 'false');

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const img = document.createElement('img');
    img.alt = t.name;
    img.src = t.file;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    thumb.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'meta';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = t.name;

    const tags = document.createElement('div');
    tags.className = 'tags';
    const r = document.createElement('div');
    r.className = 'tag ' + rarityClass(t.rarity);
    r.textContent = (t.rarity || 'common');
    tags.appendChild(r);

    meta.appendChild(name);
    meta.appendChild(tags);

    card.appendChild(thumb);
    card.appendChild(meta);

    card.addEventListener('click', () => {
      if(state.minted) return toast('Minted — editing locked');
      state.selection[cat] = t.id;
      persistSelection();
      rebuildGrid();
      render();
    });

    card.addEventListener('keydown', (e) => {
      if(state.minted) return;
      if(e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar'){
        e.preventDefault();
        card.click();
      }
    });

    grid.appendChild(card);
  }
}

function isTypingInField(){
  const el = document.activeElement;
  if(!el) return false;
  const tag = el.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!el.isContentEditable;
}

function initAntiSaveUI(){
  // Best-effort deterrent: cannot fully prevent saving (screenshots/DevTools still work).
  document.addEventListener('contextmenu', (e) => {
    if(isTypingInField()) return;
    const t = e.target;
    if(!t) return;
    const tag = t.tagName;
    if(tag === 'IMG' || tag === 'CANVAS') e.preventDefault();
  }, { capture: true });

  document.addEventListener('dragstart', (e) => {
    const t = e.target;
    if(!t) return;
    const tag = t.tagName;
    if(tag === 'IMG' || tag === 'CANVAS') e.preventDefault();
  }, { capture: true });
}

function persistSelection(){
  try{
    localStorage.setItem(LS_SELECTION_KEY, JSON.stringify({
      version: VERSION,
      selection: state.selection,
      savedAt: new Date().toISOString(),
    }));
  }catch{}
}

let _metaToken = 0;
async function updateMeta(sel){
  const token = ++_metaToken;
  const dna = compactDNA(sel);
  $('#dna').textContent = dna;

  const hash = await sha256Hex(dna);
  if(token !== _metaToken) return;

  $('#hash').textContent = hash.slice(0, 12) + '…';
  $('#hashFull').textContent = hash;

  const meta = buildMetadata(sel, dna, hash, state.minted, state.nickname);
  const json = JSON.stringify(meta, null, 2);
  $('#metaJson').textContent = json;
  $('#metaSize').textContent = `${new Blob([json]).size} bytes`;
}

async function render(){
  if(state.busy){
    state.pendingRender = true;
    return;
  }
  state.busy = true;
  setInteractivityUI();
  try{
    const canvas = $('#canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const sel = deepClone(state.selection);
    const base = await renderAvatar(sel);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);

    await updateMeta(sel);
    schedulePostSnapshot();
  }finally{
    state.busy = false;
    setInteractivityUI();

    if(state.pendingRender){
      state.pendingRender = false;
      // Fire-and-forget to avoid deep recursion.
      queueMicrotask(() => render());
    }
  }
}

function randomPick(cat){
  const list = traitDB?.[cat] || [];
  if(!list.length) return 'none';
  const idx = Math.floor(Math.random() * list.length);
  return list[idx].id;
}

function randomizeAll(){
  if(state.minted) return toast('Minted — editing locked');
  for(const [cat] of CAT_ORDER){
    state.selection[cat] = randomPick(cat);
  }
  persistSelection();
  rebuildGrid();
  render();
}

function rollTab(){
  if(state.minted) return toast('Minted — editing locked');
  state.selection[state.tab] = randomPick(state.tab);
  persistSelection();
  rebuildGrid();
  render();
}

async function exportPNG(filename){
  if(!state.minted) return toast('Mint (lock) to export PNG');
  if(state.busy) return toast('Working…');
  state.busy = true;
  setInteractivityUI();
  try{
    const sel = deepClone(state.selection);
    const base = await renderAvatar(sel);
  const out = document.createElement('canvas');
  out.width = 512;
  out.height = 512;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.clearRect(0,0,512,512);
  octx.drawImage(base, 0, 0, 512, 512);
  const blob = await new Promise(res => out.toBlob(res, 'image/png'));
  if(!blob) return toast('Export failed');
  downloadBlob(filename, blob);
  }finally{
    state.busy = false;
    setInteractivityUI();
  }
}

async function mintLock(){
  if(state.minted) return toast('Already minted');

  const dna = compactDNA(state.selection);
  const hash = await sha256Hex(dna);

  const ok = confirm('Mint & lock this avatar DNA?\n\nAfter minting, you will NOT be able to edit traits in this app.');
  if(!ok) return;

  // Embedded mode: request mint from the dashboard (simulated / staged on Linea).
  if (EMBED.enabled){
    if (state.busy) return toast('Working…');
    state.busy = true;
    setInteractivityUI();
    toast('Submitting mint request…');
    requestMintViaParent('studio_button');
    return;
  }

  const record = {
    version: VERSION,
    mintedAt: new Date().toISOString(),
    dna,
    hash,
    nickname: state.nickname,
    selection: deepClone(state.selection),
  };

  try{
    localStorage.setItem(LS_MINT_KEY, JSON.stringify(record));
  }catch{}

  state.minted = true;
  state.mintRecord = record;
  setMintUI();
  rebuildTabs();
  rebuildGrid();
  await render();

  // Auto-download PNG after mint (best-effort; browser may still block downloads).
  try{
    await exportPNG(`avatar_${hash.slice(0,8)}.png`);
  }catch{}

  toast('Minted (locked)');
}

function loadMintRecord(){
  const raw = localStorage.getItem(LS_MINT_KEY);
  const rec = safeJSONParse(raw);
  if(!rec || !rec.selection) return null;
  if(rec.version !== VERSION) return null;
  return rec;
}

// ---- Boot ----

(async function main(){
  EMBED.enabled = isEmbedded();
  try {
    const modeText = $('#chipModeText');
    if (modeText) modeText.textContent = EMBED.enabled ? 'Mode: embedded (dashboard)' : 'Mode: standalone (assets)';
  } catch {}

  if (EMBED.enabled){
    window.addEventListener('message', (ev) => {
      if (!sameOriginMessage(ev)) return;
      const m = ev.data;
      if (!m || m.channel !== EMBED.channel) return;

      if (m.type === 'GA_STUDIO_INIT'){
        const p = m.payload || {};
        try{
          const incomingState = p.studioState || null;
          const incomingSel = incomingState?.selection || null;
          const incomingNick = p.nickname != null ? String(p.nickname || '') : (incomingState?.nickname || '');
          if (!state.minted){
            if (incomingSel) state.selection = normalizeSelection(incomingSel);
            if (incomingNick != null) state.nickname = sanitizeNickname(incomingNick);
          }
          // If parent says minted, lock locally as well.
          if (typeof p.minted === 'boolean' && p.minted){
            state.minted = true;
          }
          rebuildTabs();
          rebuildGrid();
          setMintUI();
          render().catch(()=>{});
          schedulePostSnapshot();
        } catch {}
        return;
      }

      if (m.type === 'GA_STUDIO_REQUEST_SNAPSHOT'){
        postSnapshot().catch(()=>{});
        return;
      }

      if (m.type === 'GA_STUDIO_REQUEST_RANDOM_PREVIEW'){
        postRandomPreviewToParent().catch(()=>{});
        return;
      }

      if (m.type === 'GA_STUDIO_REQUEST_MINT'){
        // Parent is asking us to initiate mint: request via parent handler.
        requestMintViaParent('wallet');
        return;
      }

      if (m.type === 'GA_STUDIO_MINT_RESULT'){
        const r = m.payload || {};

        // Forward result to parent so the wallet adapter promise resolves.
        postToParent('GA_STUDIO_MINT_RESULT', r);

        // Apply result locally for UI lock.
        state.busy = false;
        setInteractivityUI();
        if (r && r.ok){
          try{
            const sel = deepClone(state.selection || defaultSelection());
            const dna = compactDNA(sel);
            // Record tokenId/explorerUrl for display if provided.
            state.minted = true;
            state.mintRecord = {
              version: VERSION,
              mintedAt: new Date().toISOString(),
              dna,
              hash: '',
              nickname: state.nickname,
              selection: sel,
              tokenId: r.tokenId || '',
              explorerUrl: r.explorerUrl || '',
            };
            setMintUI();
            rebuildTabs();
            rebuildGrid();
            render().catch(()=>{});
            schedulePostSnapshot();
            toast('Minted (locked)');
          } catch {
            toast('Minted (locked)');
          }
        } else {
          toast(r && r.error ? String(r.error) : 'Mint failed');
        }
        return;
      }
    });
  }

  try{
    traitDB = await loadTraits();
    $('#chipStatusText').textContent = 'Assets: loaded';
  }catch(err){
    console.error(err);
    $('#chipStatusText').textContent = 'Assets: failed to load';
    toast('Failed to load assets');
    return;
  }

  // Mint record takes precedence (hard lock)
  const mintRec = loadMintRecord();
  if(mintRec){
    state.minted = true;
    state.mintRecord = mintRec;
    state.selection = normalizeSelection(mintRec.selection);
    state.nickname = sanitizeNickname(mintRec.nickname || '');
  }else{
    const saved = safeJSONParse(localStorage.getItem(LS_SELECTION_KEY));
    state.selection = normalizeSelection(saved?.selection || defaultSelection());
    state.nickname = sanitizeNickname(localStorage.getItem(LS_NICK_KEY) || '');
  }

  rebuildTabs();
  rebuildGrid();
  setMintUI();
  await render();

  // Mint & Metadata collapse toggle
  const metaTogglePill = $('#metaTogglePill');
  const mintPanel = $('#mintPanel');
  let metaCollapsed = true;

  function applyMetaCollapsed(){
    if(!metaTogglePill || !mintPanel) return;
    document.body.classList.toggle('isMetaCollapsed', metaCollapsed);
    mintPanel.hidden = metaCollapsed;
    metaTogglePill.setAttribute('aria-expanded', metaCollapsed ? 'false' : 'true');
    metaTogglePill.textContent = metaCollapsed ? 'Metadata ▸' : 'Metadata ▾';

    if(metaCollapsed && mintPanel.contains(document.activeElement)){
      metaTogglePill.focus();
    }
  }

  if(metaTogglePill && mintPanel){
    metaTogglePill.addEventListener('click', () => {
      metaCollapsed = !metaCollapsed;
      applyMetaCollapsed();
    });
    applyMetaCollapsed();
  }

  // UI events
  initAntiSaveUI();
  $('#btnRandom').addEventListener('click', randomizeAll);
  $('#btnRoll').addEventListener('click', rollTab);
  {
    const btnExport = $('#btnExport');
    if(btnExport){
      btnExport.addEventListener('click', async () => {
        if(!state.minted) return toast('Mint (lock) to export PNG');
        const hash = $('#hashFull').textContent || 'avatar';
        await exportPNG(`avatar_${hash.slice(0,8)}.png`);
      });
    }
  }
  $('#btnMint').addEventListener('click', mintLock);

  // Nickname (set-once; used for wallet + public display while active + SBT)
  const nickEl = $('#nickname');
  const nickCount = $('#nickCount');
  function updateNickUI(){
    if(nickEl){
      if(state.minted) nickEl.value = state.nickname;
      if(!state.minted) nickEl.value = state.nickname;
    }
    if(nickCount) nickCount.textContent = `${state.nickname.length}/${NICK_MAX}`;
  }
  if(nickEl){
    nickEl.value = state.nickname;
    nickEl.addEventListener('input', ()=>{
      if(state.minted) return;
      state.nickname = sanitizeNickname(nickEl.value);
      localStorage.setItem(LS_NICK_KEY, state.nickname);
      updateNickUI();
      // Update metadata preview without re-rendering the whole avatar
      updateMeta(deepClone(state.selection));
    });
    nickEl.addEventListener('blur', ()=>{ nickEl.value = state.nickname; });
  }
  updateNickUI();

  $('#btnCopyDNA').addEventListener('click', () => copyToClipboard($('#dna').textContent));
  $('#btnCopyHash').addEventListener('click', () => copyToClipboard($('#hashFull').textContent));
  $('#btnCopyJSON').addEventListener('click', () => copyToClipboard($('#metaJson').textContent));
  $('#btnDownloadJSON').addEventListener('click', () => {
    const hash = $('#hashFull').textContent || 'avatar';
    const json = $('#metaJson').textContent || '{}';
    downloadBlob(`avatar_${hash.slice(0,8)}.json`, new Blob([json], { type: 'application/json' }));
  });

  $('#search').addEventListener('input', (e) => {
    state.search = e.target.value;
    rebuildGrid();
  });

  // keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
      e.preventDefault();
      toast('Save is disabled in Studio');
      return;
    }

    // Don't hijack typing in inputs.
    if(isTypingInField()) return;

    if(e.key === '/' && document.activeElement !== $('#search')){
      e.preventDefault();
      $('#search').focus();
    }
    if(e.key.toLowerCase() === 'r'){
      e.preventDefault();
      rollTab();
    }
  });

  // Notify parent that we’re ready in embedded mode.
  if (EMBED.enabled){
    postToParent('GA_STUDIO_READY', { version: VERSION });
    schedulePostSnapshot();
  }
})();
