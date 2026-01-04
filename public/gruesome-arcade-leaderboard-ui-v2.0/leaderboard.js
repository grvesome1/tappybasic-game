// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

(() => {
  'use strict';

  const VERSION = '2.1';
  const CHANNEL = 'gaLBv2';

  const AD = window.__ARCADE_LB_ADAPTER__ || null;
  if (!AD) {
    console.warn('[gaLB] adapter not found (window.__ARCADE_LB_ADAPTER__).');
    return;
  }

  const apiJson = typeof AD.apiJson === 'function' ? AD.apiJson : null;
  const toast = typeof AD.toast === 'function' ? AD.toast : (() => {});
  const shortAddr = typeof AD.shortAddr === 'function' ? AD.shortAddr : (a => String(a || '').slice(0, 6) + '…' + String(a || '').slice(-4));
  const openWallet = typeof AD.openWallet === 'function' ? AD.openWallet : (() => {});
  const getSession = typeof AD.getSession === 'function' ? AD.getSession : (() => ({ connected: false, address: null, pohVerified: false }));
  const getEpoch = typeof AD.getEpoch === 'function' ? AD.getEpoch : (() => ({}));
  const getCatalog = typeof AD.getCatalog === 'function' ? AD.getCatalog : (async () => null);
  const claimDaily = typeof AD.claimDaily === 'function' ? AD.claimDaily : null;
  const claimWeekly = typeof AD.claimWeekly === 'function' ? AD.claimWeekly : null;

  const root = document.querySelector('[data-ga-lb]');
  if (!root) {
    console.warn('[gaLB] root not found ([data-ga-lb]).');
    return;
  }

  // ---------- DOM ----------
  const $ = (sel, el = root) => el.querySelector(sel);
  const $$ = (sel, el = root) => Array.from(el.querySelectorAll(sel));

  const elOnlineDot = $('[data-ga-lb-online-dot]');
  const elOnline = $('[data-ga-lb-online]');
  const elSession = $('[data-ga-lb-session]');
  const elPoh = $('[data-ga-lb-poh]');

  const elBoards = $$('[data-ga-lb-board]');
  const elGame = $('[data-ga-lb-game]');
  const elMetric = $('[data-ga-lb-metric]');
  const elPeriodBtns = $$('[data-ga-lb-period-btn]');
  const elEligible = $('[data-ga-lb-eligible]');
  const elSearch = $('[data-ga-lb-search]');
  const elRefresh = $('[data-ga-lb-refresh]');

  const elTitle = $('[data-ga-lb-title]');
  const elSub = $('[data-ga-lb-sub]');
  const elPill = $('[data-ga-lb-pill]');

  const elMetaBar = $('[data-ga-lb-meta]');
  const elMetaHint = $('[data-ga-lb-meta-hint]');
  const elMetaText = $('[data-ga-lb-meta-text]');

  const elPodium = $('[data-ga-lb-podium]');
  const elRows = $('[data-ga-lb-rows]');

  const elYou = $('[data-ga-lb-you]');
  const elUpdated = $('[data-ga-lb-updated]');

  const elEmpty = $('[data-ga-lb-empty]');
  const elEmptyTitle = $('[data-ga-lb-empty-title]');
  const elEmptySub = $('[data-ga-lb-empty-sub]');

  const elHover = $('[data-ga-lb-hover]');
  const elHoverAvatar = $('[data-ga-lb-hover-avatar]');
  const elHoverName = $('[data-ga-lb-hover-name]');
  const elHoverAddr = $('[data-ga-lb-hover-addr]');
  const elHoverBadges = $('[data-ga-lb-hover-badges]');

  const elNext = $('[data-ga-lb-next]');
  const elClaimDaily = $('[data-ga-lb-claim-daily]');
  const elClaimWeekly = $('[data-ga-lb-claim-weekly]');
  const elTickets = $('[data-ga-lb-tickets]');
  const elWeekAct = $('[data-ga-lb-weekact]');

  const elClaimDailyBtn = $('[data-ga-lb-claim-daily-btn]');
  const elClaimWeeklyBtn = $('[data-ga-lb-claim-weekly-btn]');
  const elOpenWalletBtn = $('[data-ga-lb-open-wallet]');

  // ---------- utils ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const now = () => Date.now();
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  const LS = {
    board: 'ga.lb.v2.board',
    game: 'ga.lb.v2.game',
    metric: 'ga.lb.v2.metric',
    period: 'ga.lb.v2.period',
    eligible: 'ga.lb.v2.eligible',
    search: 'ga.lb.v2.search'
  };

  function lsGet(k, fallback = null) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : v; } catch { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, String(v)); } catch {}
  }
  function lsGetBool(k, fallback = false) {
    const v = lsGet(k, null);
    if (v == null) return fallback;
    return v === '1' || v === 'true' || v === 'yes';
  }

  function fmtInt(n) {
    const x = Number(n || 0);
    if (!Number.isFinite(x)) return '0';
    return Math.round(x).toLocaleString();
  }

  function fmtUsd(usd) {
    const x = Number(usd || 0);
    if (!Number.isFinite(x)) return '0.00 mUSD';
    return `${x.toFixed(2)} mUSD`;
  }

  function fmtBp(bp) {
    const x = Number(bp || 0);
    if (!Number.isFinite(x)) return '0.00%';
    return `${(x / 100).toFixed(2)}%`;
  }

  function fmtPct(pct) {
    const x = Number(pct || 0);
    if (!Number.isFinite(x)) return '0.00%';
    return `${x.toFixed(2)}%`;
  }

  function fmtMs(ms) {
    const t = Number(ms || 0);
    if (!Number.isFinite(t)) return '0ms';
    const s = Math.max(0, t) / 1000;
    if (s < 60) return `${s.toFixed(3)}s`;
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return `${m}:${r.toFixed(3).padStart(6, '0')}`;
  }

  function fmtCountdown(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const hh = String(Math.floor(t / 3600)).padStart(2, '0');
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  function dirOf(metric) {
    if (!metric) return 'desc';
    const d = String(metric.direction || metric.dir || '').toLowerCase();
    if (d === 'asc' || d === 'desc') return d;
    const k = String(metric.kind || '').toLowerCase();
    if (k === 'lower') return 'asc';
    if (k === 'higher') return 'desc';
    return 'desc';
  }

  function labelOf(metric, fallbackId) {
    if (metric && metric.label) return String(metric.label);
    return String(fallbackId || 'metric');
  }

  function unitOf(metric) {
    const u = metric && (metric.unit || metric.units);
    return u ? String(u) : '';
  }

  function formatValue(metric, v) {
    const f = String((metric && metric.format) || 'int').toLowerCase();
    if (f === 'ms') return fmtMs(v);
    if (f === 'bp') return fmtBp(v);
    if (f === 'pct' || f === 'percent') return fmtPct(v);
    if (f === 'usd' || f === 'musd') return fmtUsd(v);
    // fall back
    return fmtInt(v);
  }

  function directionHint(metric) {
    return dirOf(metric) === 'asc' ? 'Lower is better' : 'Higher is better';
  }

  function periodLabel(p) {
    if (p === 'weekly') return 'Weekly';
    if (p === 'all') return 'All-time';
    return 'Daily';
  }

  function gameLabel(gameId, catalog) {
    const g = (catalog && Array.isArray(catalog.games)) ? catalog.games.find(x => x && x.id === gameId) : null;
    return g && g.name ? String(g.name) : String(gameId || 'game');
  }

  function parseIsoMs(iso) {
    if (!iso) return 0;
    const t = Date.parse(String(iso));
    return Number.isFinite(t) ? t : 0;
  }

  function nextUtcMidnightMs() {
    const d = new Date();
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0));
    return next.getTime();
  }

  function nextUtcMondayMs() {
    const d = new Date();
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
    const dayNum = date.getUTCDay() || 7; // 1..7 (Mon..Sun)
    const daysToNextMon = 8 - dayNum;
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysToNextMon, 0, 0, 0));
    return next.getTime();
  }

  function usdFromClaimable(obj) {
    // Supports:
    // - number (usd)
    // - { record: { totalUsd } }
    // - { record: { totalCents } }
    // - { totalUsd } / { totalCents }
    if (obj == null) return 0;
    if (typeof obj === 'number') return Number.isFinite(obj) ? obj : 0;
    if (typeof obj === 'string') {
      const n = Number(obj);
      return Number.isFinite(n) ? n : 0;
    }
    const rec = obj && obj.record ? obj.record : obj;
    if (!rec) return 0;
    const usd = rec.totalUsd != null ? Number(rec.totalUsd) : (rec.usd != null ? Number(rec.usd) : NaN);
    if (Number.isFinite(usd)) return usd;
    const cents = rec.totalCents != null ? Number(rec.totalCents) : (rec.cents != null ? Number(rec.cents) : NaN);
    if (Number.isFinite(cents)) return Math.max(0, cents) / 100;
    return 0;
  }

  function claimedFlag(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return !!obj.claimed;
  }

  // ---------- state ----------
  const state = {
    catalog: null,
    metricsLib: null,

    board: lsGet(LS.board, 'skill'),
    period: lsGet(LS.period, 'daily'),
    eligible: lsGetBool(LS.eligible, true),

    gameId: lsGet(LS.game, ''),
    metricId: lsGet(LS.metric, ''),

    q: lsGet(LS.search, ''),

    loading: false,
    entries: [],
    you: null,
    metricInfo: null,
    lastFetchAt: 0,
    lastError: ''
  };

  function isEmbedded() {
    try { return window.parent && window.parent !== window; } catch { return false; }
  }

  // ---------- catalog + metrics ----------
  const metricsByGame = new Map();

  async function loadMetricsLibrary() {
    // Optional: only used for richer descriptions.
    try {
      const r = await fetch('/arcade-metrics-library.json', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !Array.isArray(j.metrics)) return null;
      const map = new Map();
      for (const m of j.metrics) {
        if (!m || !m.id) continue;
        map.set(String(m.id), m);
      }
      return map;
    } catch {
      return null;
    }
  }

  function metricDesc(metricId) {
    if (!metricId) return '';
    const m = state.metricsLib ? state.metricsLib.get(String(metricId)) : null;
    if (m && m.desc) return String(m.desc);
    return '';
  }

  function setCatalog(catalog) {
    state.catalog = catalog;
    metricsByGame.clear();

    const games = (catalog && Array.isArray(catalog.games)) ? catalog.games : [];
    for (const g of games) {
      if (!g || !g.id) continue;
      const list = [];
      const metrics = Array.isArray(g.metrics) ? g.metrics : [];
      for (const m of metrics) {
        if (!m || !m.id) continue;
        list.push({
          id: String(m.id),
          label: String(m.label || m.id),
          direction: dirOf(m),
          kind: m.kind ? String(m.kind) : undefined,
          format: String(m.format || 'int'),
          unit: m.unit ? String(m.unit) : '',
          eligible: (m.eligible == null) ? true : !!m.eligible,
          desc: (m.desc ? String(m.desc) : metricDesc(m.id))
        });
      }
      metricsByGame.set(String(g.id), list);
    }

    // default game
    if (!state.gameId || !metricsByGame.has(state.gameId)) {
      const live = games.find(x => x && x.id && x.status === 'live');
      const first = live || games.find(x => x && x.id);
      state.gameId = first ? String(first.id) : 'moonshot';
    }

    // default metric per game
    const curGame = games.find(x => x && x.id === state.gameId) || null;
    const mList = metricsByGame.get(state.gameId) || [];
    const want = curGame && curGame.defaultMetric ? String(curGame.defaultMetric) : '';
    const exists = (id) => !!mList.find(x => x && x.id === id);
    if (!state.metricId || !exists(state.metricId)) {
      state.metricId = (want && exists(want)) ? want : (mList[0] ? String(mList[0].id) : 'score');
    }

    populateGameSelect();
    populateMetricSelect();
    renderControlsState();
  }

  function populateGameSelect() {
    if (!elGame) return;
    const games = (state.catalog && Array.isArray(state.catalog.games)) ? state.catalog.games : [];
    const options = games
      .filter(g => g && g.id)
      .map(g => ({
        id: String(g.id),
        name: String(g.name || g.id),
        status: String(g.status || 'live')
      }));

    // live first, then coming soon
    options.sort((a, b) => {
      if (a.status === b.status) return a.name.localeCompare(b.name);
      if (a.status === 'live') return -1;
      if (b.status === 'live') return 1;
      return a.status.localeCompare(b.status);
    });

    elGame.innerHTML = options
      .map(o => `<option value="${esc(o.id)}">${esc(o.name)}${o.status !== 'live' ? ' (soon)' : ''}</option>`)
      .join('');

    elGame.value = state.gameId;
  }

  function populateMetricSelect() {
    if (!elMetric) return;
    const list = metricsByGame.get(state.gameId) || [];
    elMetric.innerHTML = list.map(m => {
      const suffix = m.eligible ? '' : ' (no payout)';
      return `<option value="${esc(m.id)}">${esc(m.label)}${suffix}</option>`;
    }).join('');
    elMetric.value = state.metricId;
  }

  function getSelectedMetric() {
    const list = metricsByGame.get(state.gameId) || [];
    return list.find(m => m && m.id === state.metricId) || null;
  }

  // ---------- session/network ----------
  function setOnline(ok) {
    if (!elOnlineDot || !elOnline) return;
    elOnlineDot.style.background = ok ? 'rgba(34,211,238,.85)' : 'rgba(255,90,120,.75)';
    elOnline.textContent = ok ? 'Network: online' : 'Network: offline';
  }

  function renderSession() {
    const s = getSession();
    const addr = s && s.address ? String(s.address) : '';
    const connected = !!(s && s.connected && addr);
    const poh = !!(s && s.pohVerified);

    if (elSession) elSession.textContent = connected ? `Wallet: ${shortAddr(addr)}` : 'Wallet: not connected';
    if (elPoh) elPoh.textContent = connected ? (poh ? 'PoH: verified' : 'PoH: not verified') : 'PoH: —';

    if (elClaimDailyBtn) elClaimDailyBtn.disabled = !connected;
    if (elClaimWeeklyBtn) elClaimWeeklyBtn.disabled = !connected;
  }

  // ---------- header/meta ----------
  function renderHeader() {
    const metric = getSelectedMetric();
    const pLabel = periodLabel(state.period);

    if (state.board === 'activity') {
      if (elTitle) elTitle.textContent = `Activity · Paid Spend · ${pLabel}`;
      if (elSub) elSub.textContent = 'Rewards based on paid AC spent (diminishing returns).';
      if (elPill) elPill.textContent = 'Activity';
      if (elMetaHint) elMetaHint.textContent = 'Global board';
      if (elMetaText) elMetaText.textContent = 'Counts paid Credits spent; free/promo do not increase Activity.';
      return;
    }

    const gLabel = gameLabel(state.gameId, state.catalog);
    const mLabel = labelOf(metric, state.metricId);

    if (elTitle) elTitle.textContent = `${gLabel} · ${mLabel} · ${pLabel}`;

    const eligibleText = state.eligible ? 'Paid-only (payout eligible)' : 'All runs (no payouts)';
    const hint = metric ? directionHint(metric) : 'Higher is better';
    const unit = metric && unitOf(metric) ? ` · Unit: ${unitOf(metric)}` : '';
    if (elSub) elSub.textContent = `${eligibleText} · ${hint}${unit}`;

    if (elPill) elPill.textContent = state.eligible ? 'Paid-only' : 'All runs';

    const desc = metric && metric.desc ? metric.desc : '';
    if (elMetaHint) elMetaHint.textContent = hint;

    if (elMetaText) {
      if (desc) {
        const payout = (metric && metric.eligible === false) ? ' (This metric does not pay out yet.)' : '';
        elMetaText.textContent = `${desc}${payout}`;
      } else {
        const payout = (metric && metric.eligible === false) ? 'This metric does not pay out yet.' : ' '; 
        elMetaText.textContent = payout;
      }
    }
  }

  function renderControlsState() {
    // board buttons
    for (const b of elBoards) {
      const id = b.getAttribute('data-ga-lb-board');
      b.classList.toggle('is-active', id === state.board);
    }

    // period buttons
    for (const b of elPeriodBtns) {
      const id = b.getAttribute('data-ga-lb-period-btn');
      b.classList.toggle('is-active', id === state.period);
    }

    const isSkill = state.board === 'skill';
    for (const el of $$('[data-ga-lb-skill-only]')) {
      el.style.display = isSkill ? '' : 'none';
    }

    if (elEligible) {
      elEligible.checked = !!state.eligible;
      elEligible.disabled = !isSkill;
    }

    if (elGame) elGame.value = state.gameId;
    if (elMetric) elMetric.value = state.metricId;

    if (elSearch && elSearch.value !== state.q) elSearch.value = state.q;

    renderHeader();
  }

  // ---------- rendering ----------
  function clearHover() {
    if (!elHover) return;
    elHover.classList.remove('is-show');
    elHover.style.left = '-9999px';
    elHover.style.top = '-9999px';
  }

  function renderEmpty(title, sub) {
    if (!elEmpty) return;
    elEmpty.hidden = false;
    if (elEmptyTitle) elEmptyTitle.textContent = title || 'No results';
    if (elEmptySub) elEmptySub.textContent = sub || 'Try switching to another board, metric, or period.';
  }

  function hideEmpty() {
    if (!elEmpty) return;
    elEmpty.hidden = true;
  }

  function renderPodium(entries, metric) {
    if (!elPodium) return;

    const top3 = entries.slice(0, 3);
    if (!top3.length) {
      elPodium.innerHTML = '';
      return;
    }

    const tags = ['Champion', 'Runner-up', 'Top 3'];
    const tagPills = ['gaLB__pill gaLB__pill--good', 'gaLB__pill', 'gaLB__pill'];

    elPodium.innerHTML = top3.map((e, i) => {
      const name = e.displayName || shortAddr(e.address);
      const val = formatValue(metric, e.value);
      const tag = tags[i] || 'Top';
      const pillCls = tagPills[i] || 'gaLB__pill';

      const avatar = e.avatarPng
        ? `<div class="gaLB__podiumAvatar"><img alt="" src="${esc(e.avatarPng)}" /></div>`
        : `<div class="gaLB__podiumAvatar"><img alt="" src="${esc(identicon(e.address))}" /></div>`;

      return `
        <div class="gaLB__podiumCard" data-ga-lb-row data-addr="${esc(e.address)}">
          <div class="gaLB__podiumTop">
            <div class="gaLB__rankBadge">#${i + 1}</div>
            <div class="${pillCls}">${esc(tag)}</div>
          </div>
          <div class="gaLB__podiumPlayer">
            ${avatar}
            <div>
              <div class="gaLB__podiumName">${esc(name)}</div>
              <div class="gaLB__podiumTag">${esc(shortAddr(e.address))}</div>
            </div>
          </div>
          <div class="gaLB__podiumValue">${esc(val)}</div>
        </div>
      `;
    }).join('');
  }

  function renderRows(entries, metric) {
    if (!elRows) return;

    const header = `
      <div class="gaLB__row gaLB__row--head">
        <div class="gaLB__rowRank">#</div>
        <div class="gaLB__rowPlayer">
          <div class="gaLB__rowName">Player</div>
          <div class="gaLB__rowAddr">Address / nickname</div>
        </div>
        <div class="gaLB__rowValue">${esc(labelOf(metric, state.metricId))}${unitOf(metric) ? `<span class="gaLB__rowUnit">${esc(unitOf(metric))}</span>` : ''}</div>
      </div>
    `;

    const rows = entries.map((e, idx) => {
      const rank = idx + 1;
      const me = state.you && state.you.address && String(state.you.address).toLowerCase() === String(e.address).toLowerCase();
      const name = e.displayName || shortAddr(e.address);
      const addr = shortAddr(e.address);
      const val = formatValue(metric, e.value);

      const badges = [
        me ? '<span class="gaLB__badge gaLB__badge--me">You</span>' : '',
        e.nickname ? '<span class="gaLB__badge gaLB__badge--pro">PRO</span>' : ''
      ].join('');

      const unit = unitOf(metric);

      return `
        <div class="gaLB__row" data-ga-lb-row data-addr="${esc(e.address)}">
          <div class="gaLB__rowRank">#${rank}</div>
          <div class="gaLB__rowPlayer">
            <div class="gaLB__rowName">${esc(name)} ${badges}</div>
            <div class="gaLB__rowAddr">${esc(addr)}</div>
          </div>
          <div class="gaLB__rowValue">${esc(val)}${unit ? `<span class="gaLB__rowUnit">${esc(unit)}</span>` : ''}</div>
        </div>
      `;
    }).join('');

    elRows.innerHTML = header + rows;
  }

  function renderYou(metric) {
    if (!elYou) return;
    if (!state.you || !state.you.address) {
      elYou.textContent = 'You: —';
      return;
    }
    const rank = state.you.rank ? Number(state.you.rank) : 0;
    const val = isNum(state.you.value) ? formatValue(metric, state.you.value) : '—';
    elYou.textContent = rank > 0 ? `You: #${rank} · ${val}` : `You: ${val}`;
  }

  function renderUpdated() {
    if (!elUpdated) return;
    if (!state.lastFetchAt) {
      elUpdated.textContent = 'Updated: —';
      return;
    }
    const age = Math.max(0, now() - state.lastFetchAt);
    const sec = Math.floor(age / 1000);
    const msg = sec < 5 ? 'just now' : `${sec}s ago`;
    elUpdated.textContent = `Updated: ${msg}`;
  }

  function renderStatus() {
    setOnline(true);
    renderSession();
  }

  function renderPayouts() {
    const e = getEpoch() || {};

    // Next countdown based on selected period (weekly shows weekly countdown)
    const nextDailyMs = Number(e.nextPayoutAt || e.nextDailyPayoutAt || 0) || parseIsoMs(e.nextEpochAtUtc) || nextUtcMidnightMs();
    const nextWeeklyMs = Number(e.nextWeeklyPayoutAt || 0) || parseIsoMs(e.nextWeekAtUtc) || nextUtcMondayMs();
    const target = state.period === 'weekly' ? nextWeeklyMs : nextDailyMs;

    if (elNext) {
      const msLeft = Math.max(0, target - now());
      elNext.textContent = `Next: ${fmtCountdown(msLeft)}`;
    }

    const dailyUsd = usdFromClaimable(e.claimable ?? e.dayClaimable ?? e.dailyClaimableUsd ?? 0);
    const weeklyUsd = usdFromClaimable(e.weekClaimable ?? e.weeklyClaimableUsd ?? 0);

    if (elClaimDaily) elClaimDaily.textContent = fmtUsd(dailyUsd);
    if (elClaimWeekly) elClaimWeekly.textContent = fmtUsd(weeklyUsd);

    // Tickets + activity
    const tix = Number(e.todayTickets || 0) || 0;
    if (elTickets) elTickets.textContent = fmtInt(tix);

    const weekAct = Number(e.weekActScore || e.weekActivity || 0) || 0;
    if (elWeekAct) elWeekAct.textContent = fmtInt(weekAct);

    // Button enablement based on claim state
    if (elClaimDailyBtn) {
      const claimed = claimedFlag(e.claimable);
      elClaimDailyBtn.disabled = !getSession().connected || claimed || dailyUsd <= 0 || !claimDaily;
    }
    if (elClaimWeeklyBtn) {
      const claimed = claimedFlag(e.weekClaimable);
      elClaimWeeklyBtn.disabled = !getSession().connected || claimed || weeklyUsd <= 0 || !claimWeekly;
    }
  }

  // ---------- hover ----------
  function findEntryByAddr(addr) {
    const a = String(addr || '').toLowerCase();
    return state.entries.find(e => String(e.address || '').toLowerCase() === a) || null;
  }

  function identicon(addr) {
    // tiny deterministic SVG (no deps)
    const a = String(addr || '0x0');
    let h = 0;
    for (let i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
    const c1 = `hsl(${h % 360} 80% 60% / .9)`;
    const c2 = `hsl(${(h * 7) % 360} 80% 55% / .9)`;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="14" fill="rgba(255,255,255,.06)"/>
        <circle cx="22" cy="22" r="16" fill="${c1}"/>
        <circle cx="46" cy="42" r="18" fill="${c2}" opacity=".85"/>
      </svg>
    `.trim();
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function showHoverForRow(rowEl) {
    try {
      if (!elHover) return;
      const addr = rowEl.getAttribute('data-addr') || '';
      const entry = findEntryByAddr(addr);
      if (!entry) return;

      const rect = rowEl.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();

      const left = clamp(rect.left - rootRect.left + rect.width + 10, 10, rootRect.width - 270);
      const top = clamp(rect.top - rootRect.top, 10, rootRect.height - 170);

      elHover.style.left = `${left}px`;
      elHover.style.top = `${top}px`;

      const avatarUrl = entry.avatarPng || identicon(entry.address);
      if (elHoverAvatar) elHoverAvatar.innerHTML = `<img alt="" src="${esc(avatarUrl)}" />`;
      if (elHoverName) elHoverName.textContent = entry.displayName || shortAddr(entry.address);
      if (elHoverAddr) elHoverAddr.textContent = shortAddr(entry.address);

      const s = getSession();
      const me = s && s.address && String(s.address).toLowerCase() === String(entry.address).toLowerCase();

      const pills = [];
      if (entry.nickname) pills.push('<span class="gaLB__pill gaLB__pill--good">PRO</span>');
      if (me) pills.push('<span class="gaLB__pill">You</span>');
      if (entry.pohVerified) pills.push('<span class="gaLB__pill gaLB__pill--warn">PoH</span>');
      if (elHoverBadges) elHoverBadges.innerHTML = pills.join('');

      elHover.classList.add('is-show');
    } catch {
      // Never break the board due to hover errors.
    }
  }

  function bindHover() {
    if (!elHover) return;
    root.addEventListener('pointerover', (ev) => {
      const row = ev.target && ev.target.closest ? ev.target.closest('[data-ga-lb-row]') : null;
      if (!row) return;
      showHoverForRow(row);
    });

    root.addEventListener('pointerout', (ev) => {
      const row = ev.target && ev.target.closest ? ev.target.closest('[data-ga-lb-row]') : null;
      if (!row) return;
      clearHover();
    });

    window.addEventListener('scroll', clearHover, { passive: true });
    window.addEventListener('resize', clearHover);
  }

  // ---------- fetch ----------
  async function fetchLeaderboard() {
    if (!apiJson) return;
    if (state.loading) return;
    state.loading = true;
    hideEmpty();
    clearHover();

    try {
      renderHeader();

      const q = {};
      if (state.board === 'activity') {
        q.board = 'activity';
        q.period = state.period;
      } else {
        q.board = 'skill';
        q.period = state.period;
        q.gameId = state.gameId;
        q.metric = state.metricId;
        if (state.eligible) q.eligible = '1';
      }
      q.limit = '50';

      const qs = Object.entries(q).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
      const url = `/api/leaderboard/top?${qs}`;

      const data = await apiJson(url);

      const entries = Array.isArray(data && data.entries) ? data.entries : [];
      const norm = entries.map((e) => {
        const address = String(e.address || '').toLowerCase();
        const value = Number(e.value != null ? e.value : e.score != null ? e.score : 0);

        // Prefer server-enriched displayName; fall back to nickname (if present) then address.
        const displayName = e.displayName ? String(e.displayName) : (e.nickname ? String(e.nickname) : '');

        return {
          address,
          value: Number.isFinite(value) ? value : 0,
          displayName,
          nickname: e.nickname ? String(e.nickname) : '',
          avatarPng: e.avatarPng ? String(e.avatarPng) : '',
          pohVerified: !!e.pohVerified,
        };
      });

      // Search filter (client-side)
      const qStr = String(state.q || '').trim().toLowerCase();
      const filtered = qStr
        ? norm.filter(e => e.address.includes(qStr) || (e.nickname && e.nickname.toLowerCase().includes(qStr)) || (e.displayName && e.displayName.toLowerCase().includes(qStr)))
        : norm;

      const metric = (state.board === 'skill') ? (data && data.metric ? data.metric : getSelectedMetric()) : { id: 'acSpent', label: 'AC spent', format: 'int', direction: 'desc' };

      state.entries = filtered;
      state.metricInfo = metric;
      state.you = data && data.you ? data.you : null;
      state.lastFetchAt = now();
      state.lastError = '';

      renderHeader();
      renderPodium(filtered, metric);
      renderRows(filtered, metric);
      renderYou(metric);
      renderUpdated();

      if (!filtered.length) {
        const help = isEmbedded() ? 'No results. If you are embedded, ensure the parent is granting runs (RUN_GRANTED) and submitting results (RUN_RESULT).' : 'No results yet. Play a run and come back.';
        renderEmpty('No entries yet', help);
      }

      renderPayouts();
    } catch (err) {
      state.lastError = String(err && err.message ? err.message : err);
      renderEmpty('Failed to load leaderboard', 'Try refreshing. If this persists, check /api/leaderboard/top in DevTools network.');
      toast('Leaderboard', 'Failed to load leaderboard.');
    } finally {
      state.loading = false;
    }
  }

  // ---------- bindings ----------
  function bindControls() {
    for (const b of elBoards) {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-ga-lb-board');
        if (!id) return;
        state.board = id;
        lsSet(LS.board, id);
        renderControlsState();
        fetchLeaderboard();
      });
    }

    for (const b of elPeriodBtns) {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-ga-lb-period-btn');
        if (!id) return;
        state.period = id;
        lsSet(LS.period, id);
        renderControlsState();
        fetchLeaderboard();
      });
    }

    if (elGame) {
      elGame.addEventListener('change', () => {
        state.gameId = elGame.value;
        lsSet(LS.game, state.gameId);

        // Reset metric based on new game default
        const g = state.catalog && Array.isArray(state.catalog.games) ? state.catalog.games.find(x => x && x.id === state.gameId) : null;
        const list = metricsByGame.get(state.gameId) || [];
        const want = g && g.defaultMetric ? String(g.defaultMetric) : '';
        const exists = (id) => !!list.find(x => x && x.id === id);
        state.metricId = (want && exists(want)) ? want : (list[0] ? list[0].id : 'score');
        lsSet(LS.metric, state.metricId);

        populateMetricSelect();
        renderControlsState();
        fetchLeaderboard();
      });
    }

    if (elMetric) {
      elMetric.addEventListener('change', () => {
        state.metricId = elMetric.value;
        lsSet(LS.metric, state.metricId);
        renderControlsState();
        fetchLeaderboard();
      });
    }

    if (elEligible) {
      elEligible.addEventListener('change', () => {
        state.eligible = !!elEligible.checked;
        lsSet(LS.eligible, state.eligible ? '1' : '0');
        renderControlsState();
        fetchLeaderboard();
      });
    }

    if (elSearch) {
      elSearch.value = state.q || '';
      elSearch.addEventListener('input', () => {
        state.q = elSearch.value;
        lsSet(LS.search, state.q);
        // no refetch; just re-render filtered from existing data
        fetchLeaderboard();
      });
    }

    if (elRefresh) {
      elRefresh.addEventListener('click', () => fetchLeaderboard());
    }

    if (elClaimDailyBtn) {
      elClaimDailyBtn.addEventListener('click', () => {
        if (!claimDaily) return;
        claimDaily();
      });
    }

    if (elClaimWeeklyBtn) {
      elClaimWeeklyBtn.addEventListener('click', () => {
        if (!claimWeekly) return;
        claimWeekly();
      });
    }

    if (elOpenWalletBtn) {
      elOpenWalletBtn.addEventListener('click', () => openWallet());
    }
  }

  // ---------- boot ----------
  async function boot() {
    try {
      renderStatus();
      bindControls();
      bindHover();

      state.metricsLib = await loadMetricsLibrary();

      const catalog = await getCatalog();
      if (catalog) setCatalog(catalog);

      renderControlsState();
      renderPayouts();
      fetchLeaderboard();

      // Update the countdown once per second (cheap)
      setInterval(() => {
        try {
          renderSession();
          renderPayouts();
          renderUpdated();
        } catch {}
      }, 1000);
    } catch (e) {
      console.warn('[gaLB] boot error', e);
    }
  }

  // public API (used by index.html loader)
  window.__GA_LB_V2__ = {
    version: VERSION,
    onShow: () => {
      // When tab becomes visible
      renderSession();
      renderPayouts();
      fetchLeaderboard();
    },
    refresh: () => fetchLeaderboard(),
  };

  boot();
})();
