/* built by gruesøme */
/* SIG_ENC_XOR5A_UTF8_HEX=382f33362e7a38237a3d282f3f2999e2373f */

(() => {
  "use strict";

  const SIG_PLAIN = "built by gruesøme";
  const SIG_ENC_XOR5A_UTF8_HEX = "382f33362e7a38237a3d282f3f2999e2373f";

  /** @type {HTMLElement|null} */
  const root = document.querySelector("[data-ga-wallet]");
  if (!root) return;

  const cfg = {
    creditUsd: 0.01,
    maxBonus: 0.15,
    // Jan 30, 2026 00:00:00 UTC
    lifetimeEndUtcMs: Date.UTC(2026, 0, 30, 0, 0, 0),
    sliderMin: 0.10,
    sliderMax: 100.0,
    sliderStep: 0.10,
    ethUsdFallback: 2300,
  };

  const els = {
    netPill: root.querySelector("#gaNetPill"),
    netLabel: root.querySelector("#gaNetLabel"),
    pohPill: root.querySelector("#gaPohPill"),
    pohLabel: root.querySelector("#gaPohLabel"),
    gpNow: root.querySelector("#gaGpNow"),
    gpNow2: root.querySelector("#gaGpNow2"),
    addr: root.querySelector("#gaAddr"),
    chain: root.querySelector("#gaChain"),
    paidCredits: root.querySelector("#gaPaidCredits"),
    promoCredits: root.querySelector("#gaPromoCredits"),
    nextPayout: root.querySelector("#gaNextPayout"),
    proStatus: root.querySelector("#gaProStatus"),
    proExp: root.querySelector("#gaProExp"),

    btnConnect: root.querySelector("#gaBtnConnect"),
    btnTutorial: root.querySelector("#gaBtnTutorial"),

    segBtns: Array.from(root.querySelectorAll("[data-ga-mode]")),
    amountLabel: root.querySelector("#gaAmountLabel"),
    amountPrefix: root.querySelector("#gaAmountPrefix"),
    amountInput: root.querySelector("#gaAmountInput"),
    btnMax: root.querySelector("#gaBtnMax"),
    presets: Array.from(root.querySelectorAll("[data-ga-preset]")),
    slider: root.querySelector("#gaSlider"),

    baseCredits: root.querySelector("#gaBaseCredits"),
    bonusPct: root.querySelector("#gaBonusPct"),
    bonusCredits: root.querySelector("#gaBonusCredits"),
    totalCredits: root.querySelector("#gaTotalCredits"),
    eff: root.querySelector("#gaEff"),
    quoteLine: root.querySelector("#gaQuoteLine"),

    btnBuy: root.querySelector("#gaBtnBuy"),
    btnExact: root.querySelector("#gaBtnExact"),

    planActivateBtns: Array.from(root.querySelectorAll("[data-ga-activate]")),
    lifetimeLeft: root.querySelector("#gaLifetimeLeft"),

    btnOpenStudio: root.querySelector("#gaBtnOpenStudio"),
    btnMintAvatar: root.querySelector("#gaBtnMintAvatar"),
    avatarGate: root.querySelector("#gaAvatarGate"),
    avatarToken: root.querySelector("#gaAvatarToken"),
    avatarLink: root.querySelector("#gaAvatarLink"),

    toastHost: root.querySelector("#gaToastHost"),
    modal: root.querySelector("#gaModal"),
  };

  const state = {
    connected: false,
    address: null,
    chainId: null,
    chainName: null,
    pohVerified: false,

    paidCredits: 0,
    promoCredits: 0,
    nextPayoutAt: null, // ms

    gpToday: 0,

    membership: {
      tier: 0,
      expiresAt: null, // ms
      active: false,
    },

    avatar: {
      minted: false,
      tokenId: null,
      explorerUrl: null,
    },

    mode: "usd", // "usd" | "credits"
    usd: 1.00,
    creditsTarget: 100,
    ethUsd: cfg.ethUsdFallback,
    ethQuote: null,
    lastQuoteAt: 0,
  };

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function formatAddress(addr){
    if (!addr) return "—";
    const a = String(addr);
    if (a.length <= 12) return a;
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
  }

  function fmtInt(n){
    const x = Math.round(Number(n) || 0);
    return x.toLocaleString(undefined);
  }

  function fmtMoney(n, digits=2){
    const x = Number(n) || 0;
    return x.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function fmtPct(n, digits=1){
    const x = Number(n) || 0;
    return `${(x*100).toFixed(digits)}%`;
  }

  function msToClock(ms){
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s/3600)).padStart(2,"0");
    const mm = String(Math.floor((s%3600)/60)).padStart(2,"0");
    const ss = String(s%60).padStart(2,"0");
    return `${hh}:${mm}:${ss}`;
  }

  function msToHuman(ms){
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s/86400);
    const h = Math.floor((s%86400)/3600);
    const m = Math.floor((s%3600)/60);
    return `${d}d ${h}h ${m}m`;
  }

  function computeBonusPct(usd){
    // Smooth curve: bonus approaches maxBonus as usd grows.
    // Tuned so that ~ $25 = noticeable, $100 = strong, no cliffs.
    const u = Math.max(0, Number(usd) || 0);
    const k = 1 - Math.exp(-u / 40); // 0..~1
    const raw = cfg.maxBonus * k;
    // floor tiny bonuses to 0 below $1 to avoid noise
    if (u < 1.0) return 0;
    return clamp(raw, 0, cfg.maxBonus);
  }

  function computePurchase(mode, amount){
    if (mode === "credits"){
      const credits = Math.max(0, Math.floor(Number(amount) || 0));
      const usd = credits * cfg.creditUsd;
      const bonusPct = computeBonusPct(usd);
      const bonusCredits = Math.floor(credits * bonusPct);
      const totalCredits = credits + bonusCredits;
      const eff = totalCredits > 0 ? usd / totalCredits : cfg.creditUsd;
      return { usd, baseCredits: credits, bonusPct, bonusCredits, totalCredits, eff };
    }
    // usd mode
    const usd = Math.max(0, Number(amount) || 0);
    const baseCredits = Math.floor(usd / cfg.creditUsd);
    const bonusPct = computeBonusPct(usd);
    const bonusCredits = Math.floor(baseCredits * bonusPct);
    const totalCredits = baseCredits + bonusCredits;
    const eff = totalCredits > 0 ? usd / totalCredits : cfg.creditUsd;
    return { usd, baseCredits, bonusPct, bonusCredits, totalCredits, eff };
  }

  function setNetPill(connected, chainName){
    if (!els.netLabel || !els.netPill) return;
    els.netLabel.textContent = connected ? (chainName || "Connected") : "Not connected";
    const dot = els.netPill.querySelector(".ga-dot");
    if (dot) dot.classList.toggle("ga-dot--good", !!connected);
    if (dot) dot.classList.toggle("ga-dot--bad", !connected);
  }

  function setPohPill(verified){
    if (!els.pohLabel || !els.pohPill) return;
    els.pohLabel.textContent = verified ? "PoH verified" : "PoH not verified";
    const dot = els.pohPill.querySelector(".ga-dot");
    if (dot){
      dot.classList.toggle("ga-dot--good", !!verified);
      dot.classList.toggle("ga-dot--warn", !verified);
    }
  }

  function toast(title, msg, kind="info"){
    if (!els.toastHost) return;
    const t = document.createElement("div");
    t.className = "ga-toast";
    const ico = kind === "ok" ? "#i-check" : (kind === "bad" ? "#i-x" : "#i-info");
    t.innerHTML = `
      <div class="ga-toast__ico"><svg class="ga-ico" aria-hidden="true"><use href="./assets/icons.svg${ico}"></use></svg></div>
      <div>
        <div class="ga-toast__title">${escapeHtml(title)}</div>
        <div class="ga-toast__msg">${escapeHtml(msg)}</div>
      </div>
    `;
    els.toastHost.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateY(6px)";
      t.style.transition = "opacity .18s ease, transform .18s ease";
      setTimeout(() => t.remove(), 220);
    }, 3200);
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
  }

  function openModal(){
    if (!els.modal) return;
    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden","false");
  }
  function closeModal(){
    if (!els.modal) return;
    els.modal.classList.remove("is-open");
    els.modal.setAttribute("aria-hidden","true");
  }

  function setMode(mode){
    state.mode = mode;
    for (const b of els.segBtns){
      const on = b.getAttribute("data-ga-mode") === mode;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    }
    if (mode === "credits"){
      els.amountLabel.textContent = "Target credits";
      els.amountPrefix.textContent = "";
      els.amountInput.value = String(state.creditsTarget);
      els.slider.value = String(clamp(state.usd, cfg.sliderMin, cfg.sliderMax));
    } else {
      els.amountLabel.textContent = "USD preview";
      els.amountPrefix.textContent = "$";
      els.amountInput.value = fmtMoney(state.usd, 2);
      els.slider.value = String(clamp(state.usd, cfg.sliderMin, cfg.sliderMax));
    }
    renderPurchase();
  }

  function parseInputValue(){
    const v = (els.amountInput.value || "").trim();
    if (state.mode === "credits"){
      const n = Math.floor(Number(v));
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async function refreshQuote(p){
    // Adapter may provide live pricing. If not, show fallback estimate.
    const now = Date.now();
    if (now - state.lastQuoteAt < 1500) return; // avoid spam
    state.lastQuoteAt = now;

    try{
      const q = await adapter.quoteEthForUsd(p.usd);
      if (q && Number.isFinite(q.ethUsd)) state.ethUsd = q.ethUsd;
      if (q && Number.isFinite(q.ethAmount)) state.ethQuote = q.ethAmount;
    } catch {
      state.ethQuote = (p.usd / state.ethUsd);
    }
  }

  function renderPurchase(){
    const amount = parseInputValue();
    if (state.mode === "credits"){
      state.creditsTarget = Math.max(0, amount);
    } else {
      state.usd = Math.max(0, amount);
    }

    const p = computePurchase(state.mode, amount);
    els.baseCredits.textContent = fmtInt(p.baseCredits);
    els.bonusPct.textContent = fmtPct(p.bonusPct, 1);
    els.bonusCredits.textContent = fmtInt(p.bonusCredits);
    els.totalCredits.textContent = fmtInt(p.totalCredits);
    els.eff.textContent = fmtMoney(p.eff, 4);

    // Quote line
    const estEth = state.ethQuote ?? (p.usd / state.ethUsd);
    els.quoteLine.textContent = p.usd > 0
      ? `Est. ${estEth.toFixed(6)} ETH · ${fmtMoney(state.ethUsd,0)} USD/ETH (preview)`
      : "—";

    // Buttons
    const canBuy = state.connected && p.totalCredits >= 1;
    els.btnBuy.disabled = !canBuy;
    els.btnExact.disabled = !canBuy;

    // Update slider in USD mode only
    if (state.mode !== "credits"){
      const sv = clamp(p.usd, cfg.sliderMin, cfg.sliderMax);
      if (Number(els.slider.value) !== sv) els.slider.value = String(sv);
    }

    // async quote refresh (best-effort)
    refreshQuote(p);
  }

  function render(){
    setNetPill(state.connected, state.chainName);
    setPohPill(state.pohVerified);

    els.addr.textContent = state.connected ? formatAddress(state.address) : "—";
    els.chain.textContent = state.connected ? `Chain: ${state.chainName || state.chainId || "—"}` : "Connect to view on-chain state";

    els.paidCredits.textContent = fmtInt(state.paidCredits);
    els.promoCredits.textContent = fmtInt(state.promoCredits);

    els.gpNow.textContent = String(clamp(state.gpToday, 0, 10));
    els.gpNow2.textContent = String(clamp(state.gpToday, 0, 10));

    // Membership
    const tier = state.membership.tier || 0;
    const active = !!state.membership.active;
    const tierName = tier === 3 ? "Lifetime / Annual" : (tier === 2 ? "PRO Prime" : (tier === 1 ? "Studio" : "Not active"));
    els.proStatus.textContent = active ? tierName : "Not active";
    els.proExp.textContent = active && state.membership.expiresAt
      ? `Expires: ${new Date(state.membership.expiresAt).toUTCString().replace("GMT","UTC")}`
      : "—";

    // Avatar gate (studio required)
    const studioOk = tier >= 1 && active;
    els.btnOpenStudio.disabled = !state.connected || !studioOk;
    els.btnMintAvatar.disabled = !state.connected || !studioOk || state.avatar.minted;

    if (!state.connected){
      els.btnConnect.textContent = "Connect wallet";
      els.btnConnect.disabled = false;
    } else {
      els.btnConnect.textContent = "Connected";
      els.btnConnect.disabled = true;
    }

    if (state.avatar.minted){
      els.avatarToken.textContent = state.avatar.tokenId ? String(state.avatar.tokenId) : "Minted";
      if (state.avatar.explorerUrl){
        els.avatarLink.href = state.avatar.explorerUrl;
        els.avatarLink.style.pointerEvents = "auto";
        els.avatarLink.style.opacity = "1";
      } else {
        els.avatarLink.href = "#";
        els.avatarLink.style.pointerEvents = "none";
        els.avatarLink.style.opacity = "0.6";
      }
    } else {
      els.avatarToken.textContent = "—";
      els.avatarLink.href = "#";
      els.avatarLink.style.pointerEvents = "none";
      els.avatarLink.style.opacity = "0.6";
    }

    // Activate buttons text states
    for (const btn of els.planActivateBtns){
      const card = btn.closest("[data-ga-tier]");
      const t = card ? Number(card.getAttribute("data-ga-tier")) : 0;
      if (!state.connected){
        btn.textContent = "Connect to activate";
        btn.disabled = true;
        continue;
      }
      if (active && tier === t){
        btn.textContent = "Active";
        btn.disabled = true;
      } else if (active && t < tier){
        btn.textContent = "Lower tier";
        btn.disabled = true;
      } else if (active && t > tier){
        btn.textContent = "Upgrade (tx)";
        btn.disabled = false;
      } else {
        btn.textContent = "Activate (tx)";
        btn.disabled = false;
      }
    }

    renderPurchase();
  }

  function tick(){
    // Next payout countdown
    if (state.nextPayoutAt){
      const ms = state.nextPayoutAt - Date.now();
      els.nextPayout.textContent = ms > 0 ? msToClock(ms) : "Soon";
    } else {
      els.nextPayout.textContent = "—";
    }

    // Lifetime window
    const left = cfg.lifetimeEndUtcMs - Date.now();
    els.lifetimeLeft.textContent = left > 0 ? msToHuman(left) : "Ended";
  }

  /** Adapter selection (real adapter can be injected by the arcade shell) */
  const adapter = (window.__ARCADE_WALLET_ADAPTER__ && typeof window.__ARCADE_WALLET_ADAPTER__ === "object")
    ? window.__ARCADE_WALLET_ADAPTER__
    : createMockAdapter();

  function createMockAdapter(){
    const mock = {
      async connect(){
        // Demo-only: pretend to connect
        await delay(450);
        return { address: "0xBEEF...CAFE00000000000000000000000000000000", chainId: 59141, chainName: "Linea" };
      },
      async getSnapshot(address){
        await delay(280);
        return {
          pohVerified: false,
          paidCredits: 0,
          promoCredits: 0,
          nextPayoutAt: Date.now() + 1000*60*73,
          gpToday: 0,
          membership: { tier: 0, expiresAt: null, active: false },
          avatar: { minted: false, tokenId: null, explorerUrl: null },
          ethUsd: cfg.ethUsdFallback,
        };
      },
      async quoteEthForUsd(usd){
        await delay(120);
        const ethUsd = cfg.ethUsdFallback;
        return { ethUsd, ethAmount: (Number(usd)||0)/ethUsd };
      },
      async buyCredits(payload){
        await delay(650);
        return { txHash: "0xTX_BUY_DEMO" };
      },
      async activateMembership(tier){
        await delay(650);
        return { txHash: "0xTX_PRO_DEMO", tier };
      },
      async openAvatarStudio(){
        await delay(50);
        // no-op
      },
      async mintAvatar(){
        await delay(650);
        return { txHash: "0xTX_AVATAR_DEMO", tokenId: "SBT" };
      }
    };
    return mock;
  }

  function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

  async function onConnect(){
    try{
      toast("Connecting", "Requesting wallet connection…");
      const c = await adapter.connect();
      state.connected = true;
      state.address = c.address || null;
      state.chainId = c.chainId || null;
      state.chainName = c.chainName || null;

      const snap = await adapter.getSnapshot(state.address);
      applySnapshot(snap);
      toast("Connected", "Wallet session established.", "ok");
      render();
    } catch (e){
      toast("Connect failed", (e && e.message) ? e.message : "Wallet connection was rejected.", "bad");
    }
  }

  function applySnapshot(snap){
    if (!snap) return;
    state.pohVerified = !!snap.pohVerified;
    state.paidCredits = Number(snap.paidCredits) || 0;
    state.promoCredits = Number(snap.promoCredits) || 0;
    state.nextPayoutAt = snap.nextPayoutAt ? Number(snap.nextPayoutAt) : null;
    state.gpToday = Number(snap.gpToday) || 0;
    if (snap.membership){
      state.membership.tier = Number(snap.membership.tier) || 0;
      state.membership.expiresAt = snap.membership.expiresAt ? Number(snap.membership.expiresAt) : null;
      state.membership.active = !!snap.membership.active;
    }
    if (snap.avatar){
      state.avatar.minted = !!snap.avatar.minted;
      state.avatar.tokenId = snap.avatar.tokenId || null;
      state.avatar.explorerUrl = snap.avatar.explorerUrl || null;
    }
    if (Number.isFinite(snap.ethUsd)) state.ethUsd = snap.ethUsd;
  }

  async function onBuy(kind){
    const amount = parseInputValue();
    const p = computePurchase(state.mode, amount);
    if (!state.connected) return toast("Not connected", "Connect your wallet first.", "bad");
    if (p.totalCredits < 1) return toast("Amount too small", "Select an amount that yields at least 1 Credit.", "bad");

    try{
      const label = kind === "exact" ? "Exact buy" : "Buy credits";
      toast(label, "Sending transaction…");
      const res = await adapter.buyCredits({ usd: p.usd, baseCredits: p.baseCredits, minTotalCredits: p.totalCredits, mode: state.mode });
      toast("Tx sent", res && res.txHash ? res.txHash : "Transaction submitted.", "ok");

      // Demo: optimistic update
      state.paidCredits += p.totalCredits;
      state.gpToday = Math.min(10, state.gpToday + 1);
      render();
    } catch (e){
      toast("Tx failed", (e && e.message) ? e.message : "Transaction failed.", "bad");
    }
  }

  async function onActivateTier(tier){
    if (!state.connected) return toast("Not connected", "Connect your wallet first.", "bad");
    const t = Number(tier) || 0;
    if (![1,2,3].includes(t)) return;

    try{
      toast("Activating", `Submitting membership tx (tier ${t})…`);
      const res = await adapter.activateMembership(t);
      toast("Tx sent", res && res.txHash ? res.txHash : "Membership transaction submitted.", "ok");

      // Demo optimistic membership state
      const now = Date.now();
      state.membership.tier = Math.max(state.membership.tier, t);
      state.membership.active = true;

      if (t === 1 || t === 2){
        // monthly 30 days
        const base = Math.max(now, state.membership.expiresAt || 0);
        state.membership.expiresAt = base + 30*24*3600*1000;
      } else if (t === 3){
        if (now < cfg.lifetimeEndUtcMs){
          state.membership.expiresAt = null; // represent lifetime as null in UI demo
        } else {
          const base = Math.max(now, state.membership.expiresAt || 0);
          state.membership.expiresAt = base + 365*24*3600*1000;
        }
      }

      state.gpToday = Math.min(10, state.gpToday + 1);
      render();
    } catch (e){
      toast("Tx failed", (e && e.message) ? e.message : "Membership tx failed.", "bad");
    }
  }

  async function onOpenStudio(){
    if (!state.connected) return toast("Not connected", "Connect your wallet first.", "bad");
    if (!state.membership.active || state.membership.tier < 1) return toast("Locked", "Activate Studio or PRO to use Avatar Studio.", "bad");
    try{
      await adapter.openAvatarStudio();
      toast("Studio", "Open your Avatar Studio route/modal from the adapter.", "ok");
    } catch (e){
      toast("Studio error", (e && e.message) ? e.message : "Unable to open studio.", "bad");
    }
  }

  async function onMintAvatar(){
    if (!state.connected) return toast("Not connected", "Connect your wallet first.", "bad");
    if (!state.membership.active || state.membership.tier < 1) return toast("Locked", "Activate Studio or PRO to mint an avatar.", "bad");
    if (state.avatar.minted) return toast("Already minted", "This wallet already has a locked avatar.", "bad");

    try{
      toast("Mint avatar", "Submitting mint transaction…");
      const res = await adapter.mintAvatar();
      toast("Tx sent", res && res.txHash ? res.txHash : "Avatar mint submitted.", "ok");

      state.avatar.minted = true;
      state.avatar.tokenId = res && res.tokenId ? res.tokenId : "SBT";
      state.gpToday = Math.min(10, state.gpToday + 1);
      render();
    } catch (e){
      toast("Mint failed", (e && e.message) ? e.message : "Avatar mint failed.", "bad");
    }
  }

  // Wire events
  els.btnConnect.addEventListener("click", onConnect);
  els.btnTutorial.addEventListener("click", openModal);

  if (els.modal){
    els.modal.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.hasAttribute && t.hasAttribute("data-ga-close")) closeModal();
    });
    for (const x of els.modal.querySelectorAll("[data-ga-close]")){
      x.addEventListener("click", closeModal);
    }
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && els.modal.classList.contains("is-open")) closeModal();
    });
  }

  for (const b of els.segBtns){
    b.addEventListener("click", () => setMode(b.getAttribute("data-ga-mode")));
  }

  els.amountInput.addEventListener("input", () => renderPurchase());
  els.amountInput.addEventListener("blur", () => {
    // Normalize formatting
    if (state.mode === "usd"){
      const n = parseInputValue();
      els.amountInput.value = fmtMoney(n, 2);
    } else {
      els.amountInput.value = String(Math.floor(parseInputValue()));
    }
    renderPurchase();
  });

  els.btnMax.addEventListener("click", () => {
    // Best value default: $25 in preview
    if (state.mode === "credits"){
      state.creditsTarget = 2500; // $25 worth
      els.amountInput.value = String(state.creditsTarget);
    } else {
      state.usd = 25;
      els.amountInput.value = fmtMoney(state.usd, 2);
      els.slider.value = "25";
    }
    renderPurchase();
  });

  for (const p of els.presets){
    p.addEventListener("click", () => {
      const v = Number(p.getAttribute("data-ga-preset"));
      if (state.mode === "credits"){
        const credits = Math.floor((v / cfg.creditUsd));
        state.creditsTarget = credits;
        els.amountInput.value = String(credits);
      } else {
        state.usd = v;
        els.amountInput.value = fmtMoney(v, 2);
        els.slider.value = String(clamp(v, cfg.sliderMin, cfg.sliderMax));
      }
      renderPurchase();
    });
  }

  els.slider.addEventListener("input", () => {
    const v = clamp(Number(els.slider.value), cfg.sliderMin, cfg.sliderMax);
    if (state.mode === "credits"){
      const credits = Math.floor((v / cfg.creditUsd));
      state.creditsTarget = credits;
      els.amountInput.value = String(credits);
    } else {
      state.usd = v;
      els.amountInput.value = fmtMoney(v, 2);
    }
    renderPurchase();
  });

  els.btnBuy.addEventListener("click", () => onBuy("buy"));
  els.btnExact.addEventListener("click", () => onBuy("exact"));

  for (const btn of els.planActivateBtns){
    btn.addEventListener("click", () => {
      const card = btn.closest("[data-ga-tier]");
      const tier = card ? card.getAttribute("data-ga-tier") : "0";
      onActivateTier(tier);
    });
  }

  els.btnOpenStudio.addEventListener("click", onOpenStudio);
  els.btnMintAvatar.addEventListener("click", onMintAvatar);

  // Initialize slider config
  els.slider.min = String(cfg.sliderMin);
  els.slider.max = String(cfg.sliderMax);
  els.slider.step = String(cfg.sliderStep);

  // Initial render
  setMode("usd");
  render();
  tick();
  setInterval(tick, 1000);
})();