// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

(function () {
  'use strict';

  // ===== Config =====
  const VERSION = '2.0';
  const LS = {
    board: 'arcade.ui.lbBoard',
    game: 'arcade.ui.lbGame',
    period: 'arcade.ui.lbPeriod',
    metric: 'arcade.ui.lbMetric',
    eligible: 'arcade.ui.lbEligible',
  };

  const DEFAULTS = {
    board: 'skill',
    period: 'daily',
    eligible: true,
  };

  // ===== Signatures (discreet) =====
  const SIG_PLAIN = 'built by gruesøme';
  // XOR(0x5A) of the plain signature, hex-encoded
  const SIG_ENC_XOR5A_HEX = '382f33362e7a38237a3d282f3f29a2373f';
  void SIG_PLAIN;
  void SIG_ENC_XOR5A_HEX;

  // ===== Helpers =====
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function lsGet(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }

  function lsSet(k, v) {
    try {
      localStorage.setItem(k, String(v));
    } catch {}
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function shortAddr(addr) {
    const s = String(addr || '');
    if (!s) return '';
    if (!s.startsWith('0x') || s.length < 12) return s;
    return s.slice(0, 6) + '…' + s.slice(-4);
  }

  function fmtInt(n) {
    n = Math.floor(Number(n) || 0);
    try {
      return n.toLocaleString();
    } catch {
      return String(n);
    }
  }

  function fmtMs(ms) {
    ms = Math.max(0, Math.floor(Number(ms) || 0));
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    const mm = ms % 1000;
    if (m > 0) return `${m}:${String(ss).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
    return `${ss}.${String(mm).padStart(3, '0')}s`;
  }

  function normalizeHttpUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('ipfs://')) {
      const cid = s.slice('ipfs://'.length);
      return `https://ipfs.io/ipfs/${cid.replace(/^ipfs\//, '')}`;
    }
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    if (s.startsWith('/')) return s;
    return '';
  }

  // Deterministic, dependency-free placeholder avatar (SVG data URL)
  function identiconSvg(seed) {
    const s = String(seed || '').toLowerCase();
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const a = (h >>> 0) % 360;
    const b = ((h >>> 8) >>> 0) % 360;
    const c = ((h >>> 16) >>> 0) % 360;
    const p1 = `${a} 85% 60%`;
    const p2 = `${b} 85% 55%`;
    const p3 = `${c} 85% 50%`;
    const initials = s.startsWith('0x') ? s.slice(2, 4).toUpperCase() : s.slice(0, 2).toUpperCase();
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">\n  <defs>\n    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">\n      <stop offset="0" stop-color="hsl(${p1})"/>\n      <stop offset="0.55" stop-color="hsl(${p2})"/>\n      <stop offset="1" stop-color="hsl(${p3})"/>\n    </linearGradient>\n    <filter id="n" x="-20%" y="-20%" width="140%" height="140%">\n      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="f"/>\n      <feColorMatrix type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.24  0 0 0 0 0.33  0 0 0 0.15 0" in="f" result="c"/>\n      <feBlend mode="soft-light" in="SourceGraphic" in2="c"/>\n    </filter>\n  </defs>\n  <rect rx="48" ry="48" x="0" y="0" width="256" height="256" fill="url(#g)"/>\n  <circle cx="128" cy="106" r="46" fill="rgba(255,255,255,0.18)"/>\n  <path d="M60 222c16-40 44-62 68-62s52 22 68 62" fill="rgba(255,255,255,0.14)"/>
  <text x="128" y="136" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="42" fill="rgba(255,255,255,0.72)" font-weight="700">${initials}</text>
  <rect rx="48" ry="48" x="0" y="0" width="256" height="256" fill="transparent" filter="url(#n)"/>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  // ===== Adapter =====
  const AD = window.__ARCADE_LB_ADAPTER__ || {};
  const apiJson = typeof AD.apiJson === 'function'
    ? AD.apiJson
    : async (url, opts) => {
        const res = await fetch(url, {
          method: (opts && opts.method) || 'GET',
          headers: (opts && opts.headers) || {},
          credentials: 'include',
          body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data && data.error ? String(data.error) : `HTTP_${res.status}`);
        return data;
      };

  const toast = typeof AD.toast === 'function' ? AD.toast : (t, m) => console.log('[toast]', t, m);
  const getSession = typeof AD.getSession === 'function' ? AD.getSession : () => ({ connected: false, address: null, pohVerified: false });
  const getEpoch = typeof AD.getEpoch === 'function' ? AD.getEpoch : () => ({});
  const getCatalog = typeof AD.getCatalog === 'function'
    ? AD.getCatalog
    : async () => {
        try {
          const r = await fetch('/arcade-games.json', { cache: 'no-store' });
          return await r.json();
        } catch {
          return { games: [] };
        }
      };

  const claimDaily = typeof AD.claimDaily === 'function' ? AD.claimDaily : async () => toast('Claim', 'Not available');
  const claimWeekly = typeof AD.claimWeekly === 'function' ? AD.claimWeekly : async () => toast('Claim', 'Not available');
  const openWallet = typeof AD.openWallet === 'function' ? AD.openWallet : () => {};

  // ===== DOM =====
  const root = document.querySelector('[data-ga-lb]');
  if (!root) return;

  const elOnlineDot = $('[data-ga-lb-online-dot]', root);
  const elOnline = $('[data-ga-lb-online]', root);
  const elSession = $('[data-ga-lb-session]', root);
  const elPoh = $('[data-ga-lb-poh]', root);

  const elBoards = $all('[data-ga-lb-board]', root);
  const elSkillOnly = $all('[data-ga-lb-skill-only]', root);

  const elGame = $('[data-ga-lb-game]', root);
  const elMetric = $('[data-ga-lb-metric]', root);
  const elPeriodBtns = $all('[data-ga-lb-period]', root);
  const elEligible = $('[data-ga-lb-eligible]', root);
  const elSearch = $('[data-ga-lb-search]', root);
  const elRefresh = $('[data-ga-lb-refresh]', root);

  const elMeta = $('[data-ga-lb-meta]', root);
  const elPodium = $('[data-ga-lb-podium]', root);
  const elRows = $('[data-ga-lb-rows]', root);
  const elEmpty = $('[data-ga-lb-empty]', root);

  const elHover = $('[data-ga-lb-hover]', root);
  const elHoverAvatar = $('[data-ga-lb-hover-avatar]', root);
  const elHoverName = $('[data-ga-lb-hover-name]', root);
  const elHoverAddr = $('[data-ga-lb-hover-addr]', root);
  const elHoverBadges = $('[data-ga-lb-hover-badges]', root);

  const elNext = $('[data-ga-lb-next]', root);
  const elClaimDaily = $('[data-ga-lb-claim-daily]', root);
  const elClaimWeekly = $('[data-ga-lb-claim-weekly]', root);
  const elTickets = $('[data-ga-lb-tickets]', root);
  const elWeekAct = $('[data-ga-lb-weekact]', root);

  const btnClaimDaily = $('[data-ga-lb-claim-daily-btn]', root);
  const btnClaimWeekly = $('[data-ga-lb-claim-weekly-btn]', root);
  const btnOpenWallet = $('[data-ga-lb-open-wallet]', root);

  // ===== State =====
  const state = {
    board: String(lsGet(LS.board) || DEFAULTS.board),
    gameId: String(lsGet(LS.game) || ''),
    period: String(lsGet(LS.period) || DEFAULTS.period),
    metricId: String(lsGet(LS.metric) || ''),
    eligible: String(lsGet(LS.eligible) || (DEFAULTS.eligible ? '1' : '0')) === '1',
    search: '',
    catalog: null,
    games: [],
    metricsByGame: {},
    metricInfo: null,
    entries: [],
    you: null,
    loading: false,
    lastFetchAt: 0,
    online: true,
  };

  function setOnline(ok, msg) {
    state.online = !!ok;
    if (elOnlineDot) elOnlineDot.className = 'gaLB__dot' + (ok ? ' is-on' : '');
    if (elOnline) elOnline.textContent = msg || (ok ? 'Online' : 'Offline');
  }

  function setSessionText() {
    const s = getSession() || {};
    const conn = !!s.connected;
    const addr = s.address ? shortAddr(s.address) : 'not connected';
    if (elSession) elSession.textContent = `Wallet: ${conn ? addr : 'not connected'}`;
    if (elPoh) elPoh.textContent = `PoH: ${s.pohVerified ? 'verified' : 'not verified'}`;
  }

  function getMetricList(gameId) {
    return (state.metricsByGame[gameId] || []).slice();
  }

  function getSelectedMetric(gameId) {
    const list = getMetricList(gameId);
    if (!list.length) return null;
    const found = list.find(m => m.id === state.metricId) || null;
    return found || list[0];
  }

  function pickDefaultGame() {
    const live = state.games.find(g => g.status === 'live');
    return live ? live.id : (state.games[0] ? state.games[0].id : 'moonshot');
  }

  function formatValue(metric, v) {
    if (!metric) return fmtInt(v);
    const f = String(metric.format || 'int');
    if (f === 'ms') return fmtMs(v);
    if (f === 'int') return fmtInt(v);
    return fmtInt(v);
  }

  function renderBoardControls() {
    // Board toggle
    elBoards.forEach(btn => {
      const b = btn.getAttribute('data-ga-lb-board');
      btn.classList.toggle('is-active', b === state.board);
    });

    // Period
    elPeriodBtns.forEach(btn => {
      const p = btn.getAttribute('data-ga-lb-period');
      btn.classList.toggle('is-active', p === state.period);
    });

    // Skill-only controls
    const isSkill = state.board === 'skill';
    elSkillOnly.forEach(node => {
      node.style.display = isSkill ? '' : 'none';
    });
    if (elEligible) elEligible.disabled = !isSkill;

    // Eligible state
    if (elEligible) elEligible.checked = !!state.eligible;
  }

  function renderHeader() {
    const isSkill = state.board === 'skill';
    if (!elMeta) return;

    if (!isSkill) {
      elMeta.innerHTML = `<div class="gaLB__metaLine"><span class="gaLB__metaKey">Activity</span><span class="gaLB__metaVal">Paid AC spent (diminishing returns)</span></div>`;
      return;
    }

    const game = state.games.find(g => g.id === state.gameId);
    const metric = getSelectedMetric(state.gameId);
    const mLabel = metric ? esc(metric.label || metric.id) : '—';
    const gLabel = game ? esc(game.name) : esc(state.gameId);
    const elig = state.eligible ? 'Paid-only (payout eligible)' : 'All runs (bragging rights)';

    elMeta.innerHTML = `
      <div class="gaLB__metaLine"><span class="gaLB__metaKey">Game</span><span class="gaLB__metaVal">${gLabel}</span></div>
      <div class="gaLB__metaLine"><span class="gaLB__metaKey">Metric</span><span class="gaLB__metaVal">${mLabel}</span></div>
      <div class="gaLB__metaLine"><span class="gaLB__metaKey">Eligibility</span><span class="gaLB__metaVal">${elig}</span></div>
    `;
  }

  function renderEmpty(msg) {
    if (elEmpty) {
      elEmpty.textContent = msg || 'No results.';
      elEmpty.style.display = '';
    }
    if (elPodium) elPodium.innerHTML = '';
    if (elRows) elRows.innerHTML = '';
  }

  function renderPodium(entries, metric) {
    if (!elPodium) return;
    const top3 = entries.slice(0, 3);
    const cards = top3
      .map((e, idx) => {
        const rank = idx + 1;
        const dn = esc(e.displayName || e.nickname || shortAddr(e.address));
        const val = esc(formatValue(metric, e.score));
        const tag = rank === 1 ? 'Champion' : (rank === 2 ? 'Runner-up' : 'Bronze');
        const av = normalizeHttpUrl(e.avatarPng) || identiconSvg(e.address);
        return `
          <div class="gaLB__podiumCard gaLB__podiumCard--${rank}" data-ga-lb-row data-addr="${esc(e.address)}">
            <div class="gaLB__podiumRank">#${rank}</div>
            <div class="gaLB__podiumAvatar"><img src="${esc(av)}" alt="" loading="lazy"></div>
            <div class="gaLB__podiumName">${dn}</div>
            <div class="gaLB__podiumVal">${val}</div>
            <div class="gaLB__podiumTag">${tag}</div>
          </div>
        `;
      })
      .join('');

    elPodium.innerHTML = cards;
  }

  function renderRows(entries, metric) {
    if (!elRows) return;

    const s = String(state.search || '').trim().toLowerCase();
    const filtered = !s
      ? entries
      : entries.filter(e => {
          const a = String(e.address || '').toLowerCase();
          const n = String(e.nickname || e.displayName || '').toLowerCase();
          return a.includes(s) || n.includes(s);
        });

    const rows = filtered
      .slice(0, 50)
      .map((e) => {
        const dn = esc(e.displayName || e.nickname || shortAddr(e.address));
        const addr = esc(shortAddr(e.address));
        const val = esc(formatValue(metric, e.score));
        const badge = e.me ? `<span class="gaLB__badge gaLB__badge--me">YOU</span>` : '';
        const pro = e.nickname ? `<span class="gaLB__badge">PRO</span>` : '';
        return `
          <div class="gaLB__row" data-ga-lb-row data-addr="${esc(e.address)}">
            <div class="gaLB__c gaLB__c--rank">${esc(String(e.rank))}</div>
            <div class="gaLB__c gaLB__c--player">
              <div class="gaLB__pName">${dn} ${badge} ${pro}</div>
              <div class="gaLB__pAddr">${addr}</div>
            </div>
            <div class="gaLB__c gaLB__c--score">${val}</div>
          </div>
        `;
      })
      .join('');

    elRows.innerHTML = rows || '';
    if (elEmpty) elEmpty.style.display = rows ? 'none' : '';
  }

  function findEntryByAddr(addr) {
    const a = String(addr || '').toLowerCase();
    return state.entries.find(e => String(e.address || '').toLowerCase() === a) || null;
  }

  function showHover(entry, anchorEl) {
    if (!elHover || !entry || !anchorEl) return;
    try {
      elHover.style.display = '';
      elHover.setAttribute('aria-hidden', 'false');

      const dn = entry.displayName || entry.nickname || shortAddr(entry.address);
      const av = normalizeHttpUrl(entry.avatarPng) || identiconSvg(entry.address);

      if (elHoverAvatar) {
        elHoverAvatar.innerHTML = `<img src="${esc(av)}" alt="" loading="lazy">`;
      }
      if (elHoverName) elHoverName.textContent = String(dn || '');
      if (elHoverAddr) elHoverAddr.textContent = shortAddr(entry.address);

      if (elHoverBadges) {
        const badges = [];
        if (entry.nickname) badges.push('Nickname');
        if (entry.avatarPng) badges.push('Avatar');
        if (entry.me) badges.push('You');
        elHoverBadges.innerHTML = badges.map(b => `<span class="gaLB__pill">${esc(b)}</span>`).join('') || '';
      }

      // Position
      const hostRect = root.getBoundingClientRect();
      const r = anchorEl.getBoundingClientRect();
      const x = clamp(r.left - hostRect.left + r.width - 12, 12, hostRect.width - 280);
      const y = clamp(r.top - hostRect.top + 8, 12, hostRect.height - 180);
      elHover.style.transform = `translate(${Math.floor(x)}px, ${Math.floor(y)}px)`;

      elHover.classList.remove('is-hide');
      elHover.classList.add('is-show');
    } catch {}
  }

  function hideHover() {
    if (!elHover) return;
    elHover.classList.remove('is-show');
    elHover.classList.add('is-hide');
    elHover.setAttribute('aria-hidden', 'true');
    // Leave it in DOM; CSS hides
  }

  function bindHover() {
    if (!root) return;
    root.addEventListener('pointerover', (ev) => {
      const row = ev.target && ev.target.closest ? ev.target.closest('[data-ga-lb-row]') : null;
      if (!row) return;
      const addr = row.getAttribute('data-addr');
      const entry = findEntryByAddr(addr);
      if (!entry) return;
      showHover(entry, row);
    });

    root.addEventListener('pointerout', (ev) => {
      const row = ev.target && ev.target.closest ? ev.target.closest('[data-ga-lb-row]') : null;
      if (!row) return;
      // If moving to another row, pointerover will immediately re-show.
      hideHover();
    });
  }

  async function fetchLeaderboard() {
    if (state.loading) return;
    state.loading = true;
    setOnline(true, 'Loading…');

    try {
      const isSkill = state.board === 'skill';
      const q = new URLSearchParams();
      q.set('board', isSkill ? 'skill' : 'activity');
      q.set('period', state.period);
      q.set('limit', '80');
      if (isSkill) {
        q.set('gameId', state.gameId);
        const m = getSelectedMetric(state.gameId);
        if (m && m.id) q.set('metric', m.id);
        q.set('eligible', state.eligible ? '1' : '0');
      }

      const data = await apiJson(`/api/leaderboard/top?${q.toString()}`);

      const entries = Array.isArray(data.entries) ? data.entries : [];
      const you = data.you || null;

      // Normalize + mark self
      const s = getSession() || {};
      const meAddr = String(s.address || '').toLowerCase();
      state.entries = entries.map((e) => {
        const a = String(e.address || '').toLowerCase();
        return {
          rank: Number(e.rank) || 0,
          address: a,
          score: Number(e.score) || 0,
          displayName: e.displayName || e.nickname || null,
          nickname: e.nickname || null,
          avatarPng: e.avatarPng || null,
          me: meAddr && a === meAddr,
        };
      });
      state.you = you;
      state.metricInfo = data.metric || null;
      state.lastFetchAt = Date.now();

      const metric = isSkill ? (state.metricInfo || getSelectedMetric(state.gameId) || null) : { id: 'activity', label: 'AC spent', format: 'int' };

      renderBoardControls();
      renderHeader();
      if (!state.entries.length) {
        renderEmpty('No results yet.');
      } else {
        if (elEmpty) elEmpty.style.display = 'none';
        renderPodium(state.entries, metric);
        renderRows(state.entries, metric);
      }

      setOnline(true, 'Online');
    } catch (e) {
      setOnline(false, 'Offline');
      renderEmpty('Offline. Leaderboards unavailable.');
      console.error(e);
    } finally {
      state.loading = false;
    }
  }

  function renderPayouts() {
    const e = getEpoch() || {};

    const nextMs = Number(e.nextPayoutAt || e.nextDailyPayoutAt || 0) || 0;
    const now = Date.now();
    const left = Math.max(0, nextMs - now);
    const hh = Math.floor(left / 3600000);
    const mm = Math.floor((left % 3600000) / 60000);
    const ss = Math.floor((left % 60000) / 1000);

    if (elNext) elNext.textContent = `Next: ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    const d = Number(e.claimable || e.dayClaimable || 0) || 0;
    const w = Number(e.weekClaimable || 0) || 0;

    if (elClaimDaily) elClaimDaily.textContent = `${d.toFixed(2)} mUSD`;
    if (elClaimWeekly) elClaimWeekly.textContent = `${w.toFixed(2)} mUSD`;

    if (elTickets) elTickets.textContent = String(e.todayTickets || 0);
    if (elWeekAct) elWeekAct.textContent = fmtInt(e.weekActivity || 0);

    const s = getSession() || {};
    const canClaim = !!s.connected;
    if (btnClaimDaily) btnClaimDaily.disabled = !canClaim || d <= 0;
    if (btnClaimWeekly) btnClaimWeekly.disabled = !canClaim || w <= 0;
  }

  async function setCatalog(cat) {
    state.catalog = cat || { games: [] };
    state.games = Array.isArray(state.catalog.games) ? state.catalog.games : [];

    // Build metrics map
    state.metricsByGame = {};
    state.games.forEach(g => {
      const list = Array.isArray(g.metrics) ? g.metrics : [];
      state.metricsByGame[g.id] = list.map(m => ({
        id: String(m.id || ''),
        label: String(m.label || m.id || ''),
        direction: String(m.direction || 'desc'),
        format: String(m.format || 'int'),
      })).filter(m => m.id);
    });

    // Defaults
    if (!state.gameId) state.gameId = String(lsGet(LS.game) || '') || pickDefaultGame();
    if (!getMetricList(state.gameId).find(m => m.id === state.metricId)) {
      const def = getMetricList(state.gameId)[0];
      state.metricId = def ? def.id : '';
    }

    // Populate select(s)
    if (elGame) {
      elGame.innerHTML = state.games
        .filter(g => g.status === 'live')
        .map(g => `<option value="${esc(g.id)}">${esc(g.name || g.id)}</option>`)
        .join('');
      elGame.value = state.gameId;
    }

    populateMetricSelect();
  }

  function populateMetricSelect() {
    if (!elMetric) return;
    const list = getMetricList(state.gameId);
    elMetric.innerHTML = list.map(m => `<option value="${esc(m.id)}">${esc(m.label || m.id)}</option>`).join('');
    if (list.find(m => m.id === state.metricId)) elMetric.value = state.metricId;
    else if (list[0]) { state.metricId = list[0].id; elMetric.value = state.metricId; }
  }

  function bindControls() {
    elBoards.forEach(btn => {
      btn.addEventListener('click', () => {
        state.board = btn.getAttribute('data-ga-lb-board') || 'skill';
        lsSet(LS.board, state.board);
        renderBoardControls();
        renderHeader();
        fetchLeaderboard();
      });
    });

    if (elGame) {
      elGame.addEventListener('change', () => {
        state.gameId = String(elGame.value || '');
        lsSet(LS.game, state.gameId);
        populateMetricSelect();
        renderHeader();
        fetchLeaderboard();
      });
    }

    if (elMetric) {
      elMetric.addEventListener('change', () => {
        state.metricId = String(elMetric.value || '');
        lsSet(LS.metric, state.metricId);
        renderHeader();
        fetchLeaderboard();
      });
    }

    elPeriodBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        state.period = btn.getAttribute('data-ga-lb-period') || 'daily';
        lsSet(LS.period, state.period);
        renderBoardControls();
        fetchLeaderboard();
      });
    });

    if (elEligible) {
      elEligible.addEventListener('change', () => {
        state.eligible = !!elEligible.checked;
        lsSet(LS.eligible, state.eligible ? '1' : '0');
        renderHeader();
        fetchLeaderboard();
      });
    }

    if (elSearch) {
      elSearch.addEventListener('input', () => {
        state.search = String(elSearch.value || '');
        // Just rerender rows; no refetch
        const isSkill = state.board === 'skill';
        const metric = isSkill ? (state.metricInfo || getSelectedMetric(state.gameId) || null) : { id: 'activity', label: 'AC spent', format: 'int' };
        renderRows(state.entries, metric);
      });
    }

    if (elRefresh) {
      elRefresh.addEventListener('click', () => fetchLeaderboard());
    }

    btnClaimDaily?.addEventListener('click', async () => {
      try {
        await claimDaily();
        renderPayouts();
      } catch (e) {
        toast('Claim failed', (e && e.message) ? String(e.message) : 'error');
      }
    });

    btnClaimWeekly?.addEventListener('click', async () => {
      try {
        await claimWeekly();
        renderPayouts();
      } catch (e) {
        toast('Claim failed', (e && e.message) ? String(e.message) : 'error');
      }
    });

    btnOpenWallet?.addEventListener('click', () => openWallet());
  }

  // Public controller for the parent SPA.
  window.__GA_LB_V2__ = {
    version: VERSION,
    onShow: () => {
      setSessionText();
      renderPayouts();
      if (!state.lastFetchAt || Date.now() - state.lastFetchAt > 8000) {
        fetchLeaderboard();
      }
    },
    refresh: () => fetchLeaderboard(),
  };

  // Boot sequence
  (async () => {
    try {
      setSessionText();
      bindControls();
      bindHover();

      // Catalog
      const cat = await getCatalog();
      await setCatalog(cat || { games: [] });

      // Initial render
      renderBoardControls();
      renderHeader();
      renderPayouts();

      await fetchLeaderboard();

      // Periodic payout countdown refresh
      setInterval(() => {
        try { renderPayouts(); } catch {}
      }, 1000);
    } catch (e) {
      setOnline(false, 'Offline');
      renderEmpty('Failed to load leaderboard bundle.');
      console.error(e);
    }
  })();
})();
