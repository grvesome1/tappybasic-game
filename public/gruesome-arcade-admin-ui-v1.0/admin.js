// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

(() => {
  'use strict';

  /**
   * Admin gate:
   * - Set this in public/index.html:
   *   window.__GA_ADMIN_WALLET__ = '0xYourWallet';
   */
  const ADMIN_WALLET = (window.__GA_ADMIN_WALLET__ || '').trim();

  const STORAGE_KEY = 'ga.admin.contracts.v1';

  // Function selectors (4 bytes) for common admin ops.
  const SELECTORS = {
    withdrawPot: '2686d6a2', // withdrawPot(address,uint256)
    sweepERC20: '503690d1', // sweepERC20(address,address,uint256)
    unlockTransfers: '364744cb', // unlockTransfersPermanently()
    setPromo: 'a87d43cb', // setPromo(bytes32,uint256)
    erc20BalanceOf: '70a08231', // balanceOf(address)
  };

  /**
   * Discreet signature marker for audit.
   * (Same content as plain signature, XOR'd with 0x5A, hex-encoded.)
   */
  const __SIG = 'SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f';

  const state = {
    address: null,
    isAdmin: false,
    contracts: {
      payments: '',
      vault: '',
      musd: '',
      proAvatar: '',
      promo: '',
    },
  };

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function normalizeAddr(a) {
    return (a || '').trim().toLowerCase();
  }

  function isHex(s) {
    return /^[0-9a-fA-F]+$/.test(s);
  }

  function isAddress(a) {
    const s = (a || '').trim();
    return /^0x[0-9a-fA-F]{40}$/.test(s);
  }

  function isBytes32Hex(h) {
    const s = (h || '').trim();
    return /^0x[0-9a-fA-F]{64}$/.test(s);
  }

  function toast(msg, kind = 'info') {
    const el = qs('#gaAdminToast');
    if (!el) return;
    el.textContent = msg;
    el.dataset.kind = kind;
    el.classList.add('is-visible');
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => {
      el.classList.remove('is-visible');
    }, 3200);
  }

  function setChip(text, ok = false) {
    const chip = qs('#gaAdminChip');
    const chipText = qs('#gaAdminChipText');
    if (chipText) chipText.textContent = text;
    if (chip) chip.classList.toggle('is-ok', !!ok);
  }

  function loadContracts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return;
      state.contracts = {
        payments: (obj.payments || '').trim(),
        vault: (obj.vault || '').trim(),
        musd: (obj.musd || '').trim(),
        proAvatar: (obj.proAvatar || '').trim(),
        promo: (obj.promo || '').trim(),
      };
    } catch {
      // ignore
    }
  }

  function saveContracts() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.contracts));
  }

  function hydrateContractInputs() {
    const map = {
      payments: '#gaAdminPaymentsAddr',
      vault: '#gaAdminVaultAddr',
      musd: '#gaAdminMusdAddr',
      proAvatar: '#gaAdminProAvatarAddr',
      promo: '#gaAdminPromoAddr',
    };
    for (const k of Object.keys(map)) {
      const el = qs(map[k]);
      if (el) el.value = state.contracts[k] || '';
    }
  }

  function readContractInputs() {
    const payments = (qs('#gaAdminPaymentsAddr')?.value || '').trim();
    const vault = (qs('#gaAdminVaultAddr')?.value || '').trim();
    const musd = (qs('#gaAdminMusdAddr')?.value || '').trim();
    const proAvatar = (qs('#gaAdminProAvatarAddr')?.value || '').trim();
    const promo = (qs('#gaAdminPromoAddr')?.value || '').trim();

    state.contracts = { payments, vault, musd, proAvatar, promo };
  }

  function requireAdminConfigured() {
    if (!isAddress(ADMIN_WALLET)) {
      toast('Admin wallet not configured. Set window.__GA_ADMIN_WALLET__ in public/index.html', 'err');
      return false;
    }
    return true;
  }

  function requireEthereum() {
    if (!window.ethereum || typeof window.ethereum.request !== 'function') {
      toast('No injected wallet found (window.ethereum). Install MetaMask / Rabby.', 'err');
      return false;
    }
    return true;
  }

  async function connect() {
    if (!requireAdminConfigured()) return;
    if (!requireEthereum()) return;

    try {
      // Prefer the Arcade wallet adapter if present, but fall back to eth_requestAccounts.
      const adapter = window.__ARCADE_WALLET_ADAPTER__ || window.ARCADE_WALLET_ADAPTER;
      let addr = null;

      if (adapter && typeof adapter.connect === 'function') {
        await adapter.connect();
        addr = adapter.address || adapter?.state?.address || null;
      }

      if (!addr) {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        addr = accounts?.[0] || null;
      }

      if (!addr || !isAddress(addr)) {
        toast('Wallet connection failed.', 'err');
        return;
      }

      state.address = addr;
      state.isAdmin = normalizeAddr(addr) === normalizeAddr(ADMIN_WALLET);

      qs('#gaAdminWallet')?.replaceChildren(document.createTextNode(ADMIN_WALLET));
      setChip(state.isAdmin ? 'Admin connected' : 'Not admin', state.isAdmin);

      if (!state.isAdmin) {
        toast('This wallet is not authorized for Admin Console.', 'err');
      } else {
        toast('Admin console unlocked.', 'ok');
      }

      lockUi(!state.isAdmin);

      // Auto-load saved contracts and refresh key panels.
      if (state.isAdmin) {
        loadContracts();
        hydrateContractInputs();
        await refreshBackend();
        await refreshBalances();
      }
    } catch (e) {
      toast(String(e?.message || e || 'Connect failed'), 'err');
    }
  }

  function lockUi(locked) {
    const toToggle = [
      '#gaAdminSaveIdentityBtn',
      '#gaAdminPreviewIdentityBtn',
      '#gaAdminRefreshExclusionBtn',
      '#gaAdminSaveContractsBtn',
      '#gaAdminLoadContractsBtn',
      '#gaAdminRefreshBalancesBtn',
      '#gaAdminWithdrawPaymentsBtn',
      '#gaAdminSweepVaultBtn',
      '#gaAdminUnlockTransfersBtn',
      '#gaAdminSetPromoBtn',
      '#gaAdminRefreshBackendBtn',
      '#gaAdminCopyBackendBtn',
    ];

    for (const sel of toToggle) {
      const el = qs(sel);
      if (el) el.disabled = !!locked;
    }

    // Always allow connect.
    qs('#gaAdminConnectBtn')?.removeAttribute('disabled');

    const pre = qs('#gaAdminBackendPre');
    if (pre && locked) pre.textContent = '{}';
  }

  // ===== ABI helpers =====

  function pad32(hexNo0x) {
    return (hexNo0x || '').padStart(64, '0');
  }

  function encAddress(addr) {
    if (!isAddress(addr)) throw new Error(`Invalid address: ${addr}`);
    return pad32(addr.slice(2).toLowerCase());
  }

  function encUint(value) {
    // value may be BigInt, number-like string, or number.
    let bi;
    if (typeof value === 'bigint') bi = value;
    else if (typeof value === 'number') bi = BigInt(Math.floor(value));
    else bi = BigInt(String(value));

    if (bi < 0n) throw new Error('uint256 cannot be negative');
    return bi.toString(16).padStart(64, '0');
  }

  function encBytes32(hex) {
    if (!isBytes32Hex(hex)) throw new Error('Expected 0x-prefixed bytes32 hex');
    return hex.slice(2);
  }

  function makeData(selector, ...args32) {
    return '0x' + selector + args32.join('');
  }

  function parseUnits(input, decimals) {
    const s = String(input || '').trim();
    if (!s) throw new Error('Amount required');
    if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) throw new Error('Invalid number');

    const [whole, fracRaw = ''] = s.split('.');
    const frac = fracRaw.slice(0, decimals).padEnd(decimals, '0');
    const w = BigInt(whole || '0');
    const f = BigInt(frac || '0');
    return w * (10n ** BigInt(decimals)) + f;
  }

  function formatUnits(bi, decimals, maxFrac = 6) {
    const d = BigInt(decimals);
    const neg = bi < 0n;
    const v = neg ? -bi : bi;
    const base = 10n ** d;
    const whole = v / base;
    const frac = v % base;
    let fracStr = frac.toString(10).padStart(decimals, '0');
    fracStr = fracStr.slice(0, Math.min(maxFrac, fracStr.length));
    fracStr = fracStr.replace(/0+$/g, '');
    return `${neg ? '-' : ''}${whole.toString(10)}${fracStr ? '.' + fracStr : ''}`;
  }

  async function ethCall(to, data) {
    const res = await window.ethereum.request({
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    });
    return res;
  }

  async function sendTx(to, data, valueWei = 0n) {
    if (!state.address) throw new Error('Not connected');
    if (!requireEthereum()) throw new Error('No wallet');

    const tx = {
      from: state.address,
      to,
      data,
    };

    if (valueWei && valueWei !== 0n) {
      tx.value = '0x' + valueWei.toString(16);
    }

    const hash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [tx],
    });

    return hash;
  }

  // ===== Actions =====

  async function saveIdentity() {
    const nickname = (qs('#gaAdminNickname')?.value || '').trim();
    const avatarUrl = (qs('#gaAdminAvatarUrl')?.value || '').trim();

    if (!nickname || nickname.length < 2) {
      toast('Nickname must be at least 2 chars.', 'err');
      return;
    }

    // Preview immediately.
    showIdentityPreview(nickname, avatarUrl);

    // Try to persist server-side if endpoint exists.
    try {
      const r = await fetch(`/api/ledger/profile?address=${encodeURIComponent(state.address)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patch: { nickname, avatarPng: avatarUrl }, sig: window.__SIG }),
      });
      if (!r.ok) {
        const t = await r.text();
        toast(`Saved locally only. Server rejected: ${t.slice(0, 140)}`, 'warn');
        return;
      }
      toast('Identity saved (server).', 'ok');
    } catch (e) {
      toast('Identity saved locally only (offline).', 'warn');
    }
  }

  function showIdentityPreview(nickname, avatarUrl) {
    const wrap = qs('#gaAdminIdentityPreview');
    const img = qs('#gaAdminIdentityPreviewImg');
    const nameEl = qs('#gaAdminIdentityPreviewName');

    if (nameEl) nameEl.textContent = nickname || '—';
    if (img) {
      img.src = avatarUrl || '';
      img.style.display = avatarUrl ? 'block' : 'none';
    }
    if (wrap) wrap.hidden = false;
  }

  async function refreshExclusion() {
    // Best-effort: if the backend adds a field later, show it.
    try {
      const r = await fetch('/api/epoch/status', { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      // Convention: backend may return excludedAddrs or payoutExcluded.
      let excluded = null;

      if (typeof j?.payoutExcluded === 'boolean') excluded = j.payoutExcluded;
      else if (Array.isArray(j?.excludedAddrs) && state.address) {
        excluded = j.excludedAddrs.map(normalizeAddr).includes(normalizeAddr(state.address));
      }

      qs('#gaAdminExcluded')?.replaceChildren(
        document.createTextNode(excluded === null ? 'Unknown (endpoint not reporting)' : excluded ? 'YES' : 'NO')
      );

      if (excluded === true) toast('Backend confirms: excluded.', 'ok');
      else if (excluded === false) toast('Backend says: NOT excluded (check env var!).', 'warn');
      else toast('Exclusion status unknown (needs backend support).', 'warn');
    } catch {
      qs('#gaAdminExcluded')?.replaceChildren(document.createTextNode('Unknown (offline)'));
      toast('Cannot check backend exclusion (offline).', 'warn');
    }
  }

  async function refreshBackend() {
    const out = {};
    try {
      const [d, w] = await Promise.all([
        fetch('/api/epoch/status', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/week/status', { credentials: 'include' }).then((r) => r.json()),
      ]);
      out.daily = d;
      out.weekly = w;
      qs('#gaAdminBackendPre').textContent = JSON.stringify(out, null, 2);
      toast('Backend status refreshed.', 'ok');
    } catch (e) {
      qs('#gaAdminBackendPre').textContent = JSON.stringify({ error: String(e?.message || e) }, null, 2);
      toast('Backend status fetch failed.', 'err');
    }
  }

  async function copyBackend() {
    const text = qs('#gaAdminBackendPre')?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied.', 'ok');
    } catch {
      toast('Copy failed.', 'err');
    }
  }

  async function refreshBalances() {
    readContractInputs();

    const payments = state.contracts.payments;
    const vault = state.contracts.vault;
    const musd = state.contracts.musd;

    if (!isAddress(payments) || !isAddress(vault) || !isAddress(musd)) {
      toast('Set ArcadePayments + Vault + mUSD addresses first.', 'warn');
      return;
    }

    try {
      const [balWeiHex, musdBalHex] = await Promise.all([
        window.ethereum.request({ method: 'eth_getBalance', params: [payments, 'latest'] }),
        ethCall(
          musd,
          '0x' + SELECTORS.erc20BalanceOf + encAddress(vault)
        ),
      ]);

      const ethWei = BigInt(balWeiHex);
      const musdBal = BigInt(musdBalHex);

      qs('#gaAdminPaymentsBal').textContent = `${formatUnits(ethWei, 18, 6)} ETH`;
      qs('#gaAdminVaultBal').textContent = `${formatUnits(musdBal, 18, 2)} mUSD`;

      toast('Balances updated.', 'ok');
    } catch (e) {
      toast(String(e?.message || e || 'Balance fetch failed'), 'err');
    }
  }

  async function withdrawPayments() {
    readContractInputs();

    const payments = state.contracts.payments;
    if (!isAddress(payments)) {
      toast('ArcadePayments address missing.', 'err');
      return;
    }

    const to = (qs('#gaAdminWithdrawTo')?.value || '').trim() || state.address;
    const amountEth = (qs('#gaAdminWithdrawEth')?.value || '').trim();

    if (!isAddress(to)) {
      toast('Withdraw "to" address is invalid.', 'err');
      return;
    }

    try {
      const amountWei = parseUnits(amountEth, 18);
      if (amountWei <= 0n) throw new Error('Amount must be > 0');

      const data = makeData(SELECTORS.withdrawPot, encAddress(to), encUint(amountWei));
      const hash = await sendTx(payments, data);
      toast(`Withdraw submitted: ${hash.slice(0, 10)}…`, 'ok');
    } catch (e) {
      toast(String(e?.message || e || 'Withdraw failed'), 'err');
    }
  }

  async function sweepVault() {
    readContractInputs();

    const vault = state.contracts.vault;
    const musd = state.contracts.musd;

    if (!isAddress(vault) || !isAddress(musd)) {
      toast('Vault and mUSD addresses required.', 'err');
      return;
    }

    const to = (qs('#gaAdminSweepTo')?.value || '').trim() || state.address;
    const amount = (qs('#gaAdminSweepMusd')?.value || '').trim();

    if (!isAddress(to)) {
      toast('Sweep "to" address is invalid.', 'err');
      return;
    }

    try {
      const amt = parseUnits(amount, 18);
      if (amt <= 0n) throw new Error('Amount must be > 0');

      const data = makeData(SELECTORS.sweepERC20, encAddress(musd), encAddress(to), encUint(amt));
      const hash = await sendTx(vault, data);
      toast(`Sweep submitted: ${hash.slice(0, 10)}…`, 'ok');
    } catch (e) {
      toast(String(e?.message || e || 'Sweep failed'), 'err');
    }
  }

  async function unlockTransfers() {
    readContractInputs();

    const pro = state.contracts.proAvatar;
    if (!isAddress(pro)) {
      toast('ArcadeProAvatar address missing.', 'err');
      return;
    }

    const ok = confirm('Unlock transfers permanently? This is irreversible.');
    if (!ok) return;

    try {
      const data = '0x' + SELECTORS.unlockTransfers;
      const hash = await sendTx(pro, data);
      toast(`Unlock submitted: ${hash.slice(0, 10)}…`, 'ok');
    } catch (e) {
      toast(String(e?.message || e || 'Unlock failed'), 'err');
    }
  }

  async function setPromo() {
    readContractInputs();

    const promo = state.contracts.promo;
    if (!isAddress(promo)) {
      toast('ArcadePromo address missing.', 'err');
      return;
    }

    const gameId = (qs('#gaAdminPromoGameId')?.value || '').trim();
    const gameHex = (qs('#gaAdminPromoGameIdHex')?.value || '').trim();
    const grant = (qs('#gaAdminPromoGrant')?.value || '').trim();

    if (!grant || !/^[0-9]+$/.test(grant)) {
      toast('Grant AC must be an integer.', 'err');
      return;
    }

    let gameBytes32 = null;

    if (isBytes32Hex(gameHex)) {
      gameBytes32 = gameHex;
    } else {
      // Use ethers if present.
      const ethers = window.ethers;
      if (ethers?.utils?.id && gameId) {
        gameBytes32 = ethers.utils.id(gameId);
      }
    }

    if (!gameBytes32) {
      toast('Need either a gameId string (with ethers) or a bytes32 hex in Advanced mode.', 'err');
      return;
    }

    try {
      const data = makeData(SELECTORS.setPromo, encBytes32(gameBytes32), encUint(BigInt(grant)));
      const hash = await sendTx(promo, data);
      toast(`Promo tx submitted: ${hash.slice(0, 10)}…`, 'ok');
    } catch (e) {
      toast(String(e?.message || e || 'Set promo failed'), 'err');
    }
  }

  function bind() {
    qs('#gaAdminConnectBtn')?.addEventListener('click', connect);
    qs('#gaAdminSaveIdentityBtn')?.addEventListener('click', saveIdentity);
    qs('#gaAdminPreviewIdentityBtn')?.addEventListener('click', () => {
      const nick = (qs('#gaAdminNickname')?.value || '').trim();
      const url = (qs('#gaAdminAvatarUrl')?.value || '').trim();
      if (!nick) return toast('Enter a nickname first.', 'warn');
      showIdentityPreview(nick, url);
    });

    qs('#gaAdminRefreshExclusionBtn')?.addEventListener('click', refreshExclusion);

    qs('#gaAdminSaveContractsBtn')?.addEventListener('click', () => {
      readContractInputs();
      saveContracts();
      toast('Saved.', 'ok');
    });

    qs('#gaAdminLoadContractsBtn')?.addEventListener('click', () => {
      loadContracts();
      hydrateContractInputs();
      toast('Loaded.', 'ok');
    });

    qs('#gaAdminRefreshBalancesBtn')?.addEventListener('click', refreshBalances);
    qs('#gaAdminWithdrawPaymentsBtn')?.addEventListener('click', withdrawPayments);
    qs('#gaAdminSweepVaultBtn')?.addEventListener('click', sweepVault);
    qs('#gaAdminUnlockTransfersBtn')?.addEventListener('click', unlockTransfers);
    qs('#gaAdminSetPromoBtn')?.addEventListener('click', setPromo);

    qs('#gaAdminRefreshBackendBtn')?.addEventListener('click', refreshBackend);
    qs('#gaAdminCopyBackendBtn')?.addEventListener('click', copyBackend);

    // Hook: if wallet changes accounts, lock UI again.
    if (window.ethereum?.on) {
      window.ethereum.on('accountsChanged', () => {
        state.address = null;
        state.isAdmin = false;
        lockUi(true);
        setChip('Not connected', false);
        toast('Account changed — reconnect.', 'warn');
      });
    }
  }

  function boot() {
    const root = qs('[data-ga-admin]');
    if (!root) return;

    // Pre-fill expected admin wallet.
    qs('#gaAdminWallet')?.replaceChildren(document.createTextNode(ADMIN_WALLET || '(not configured)'));

    // Start locked until connect.
    lockUi(true);
    setChip('Not connected', false);

    loadContracts();
    hydrateContractInputs();

    bind();
  }

  boot();
})();
