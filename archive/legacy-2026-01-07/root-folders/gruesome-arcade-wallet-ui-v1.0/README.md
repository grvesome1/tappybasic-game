# Gruesøme’s Arcade – Wallet UI v1.0

**built by gruesøme**  
`SIG_ENC_XOR5A_UTF8_HEX=382f33362e7a38237a3d282f3f2999e2373f`

## What this is
A **professional-grade**, UI-first wallet page replacement for the arcade:

- Clear hierarchy: Account → Buy Credits → PRO Membership → Avatar
- Cleaner copy + correct launch tier semantics
- Adapter-based wiring so you can plug in real Web3 logic without rewriting UI
- No framework/build step required

## Files
- `wallet-panel.html` – drop-in markup (component)
- `wallet.css` – scoped UI styles (root `.ga-wallet`)
- `wallet.js` – behavior + adapter interface (mock adapter by default)
- `assets/icons.svg` – inline icon sprites
- `index.html` – standalone demo wrapper

## Integration (Arcade repo)
Option A (recommended): **Drop-in component**
1. Copy these files into your arcade `public/` (example: `public/ui/wallet/`).
2. In your wallet route/view, inject the markup from `wallet-panel.html` and include:
   - `wallet.css`
   - `wallet.js`
   - `assets/icons.svg`

Option B: **Iframe**
Host `index.html` and iframe it from the dashboard. (Useful during early integration.)

## Adapter pattern (real wiring)
If your arcade shell provides a real adapter, set:

```js
window.__ARCADE_WALLET_ADAPTER__ = {
  connect: async () => ({ address, chainId, chainName }),
  getSnapshot: async (address) => ({
    pohVerified,
    paidCredits,
    promoCredits,
    nextPayoutAt,
    gpToday,
    membership: { tier, expiresAt, active },
    avatar: { minted, tokenId, explorerUrl },
    ethUsd
  }),
  quoteEthForUsd: async (usd) => ({ ethUsd, ethAmount }),
  buyCredits: async ({ usd, baseCredits, minTotalCredits, mode }) => ({ txHash }),
  activateMembership: async (tier) => ({ txHash }),
  openAvatarStudio: async () => {},
  mintAvatar: async () => ({ txHash, tokenId }),
};
```

If not provided, the UI runs with a mock adapter for demo.

## Tier semantics (launch)
- Tier 1 ($2/mo): Studio + small achievement drops. **Pays tournament entry.**
- Tier 2 ($25/mo): PRO boost pool eligibility + **free tournament entry** + airdrop eligibility.
- Tier 3 ($100): Lifetime if minted before **Jan 30, 2026**, annual after. Same perks as Tier 2.

## Notes
- USD is shown as a preview anchor. Final ETH is quoted at tx time.
- Avatar is **permanent lock once minted** (no edit system after mint).
