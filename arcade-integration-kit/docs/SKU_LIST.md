# Standard SKU List (v2)

SKU IDs are **bytes32**. Recommended: `ethers.encodeBytes32String("AC_500")`.

The router enforces:
- `sku` + `kind` (via `skuKind[sku]`)
- price + outputs via the backend-signed EIP-712 Quote

---

## Credits Packs (KIND_CREDITS)

Pricing is expressed in **USD cents** (`usdCents` in the signed quote).

Credits output is expressed in **AC** (`credits` in the signed quote).

Recommended packs:

| Human name | SKU bytes32 string | usdCents | creditsOutAC | Notes |
|---|---|---:|---:|---|
| Starter | `AC_500` | 500 | 500 | no bonus |
| Small | `AC_1000` | 1000 | 1050 | +5% |
| Standard | `AC_2500` | 2500 | 2750 | +10% |
| Large | `AC_5000` | 5000 | 5750 | +15% |
| Whale | `AC_10000` | 10000 | 12000 | +20% |

**Router kind binding**
- Set each credits SKU to `KIND_CREDITS` (1).

---

## PRO Avatar (Mint vs Renew)

The PRO avatar is **one token per wallet**. Renewals extend membership expiry.

### Tier Definitions
- Tier 1: Studio Monthly (30 days)
- Tier 2: PRO Monthly (30 days) + off-chain payout boost rules
- Tier 3: “Lifetime until cutoff; after cutoff annual” (see `ArcadeProAvatarV2.lifetimeCutoff`)

### SKUs

| Human name | SKU bytes32 string | kind | tier | usdCents |
|---|---|---:|---:|---:|
| PRO Mint T1 | `PRO_MINT_T1` | PRO_MINT (2) | 1 | 200 |
| PRO Renew T1 | `PRO_RENEW_T1` | PRO_RENEW (3) | 1 | 200 |
| PRO Mint T2 | `PRO_MINT_T2` | PRO_MINT (2) | 2 | 2500 |
| PRO Renew T2 | `PRO_RENEW_T2` | PRO_RENEW (3) | 2 | 2500 |
| PRO Mint T3 | `PRO_MINT_T3` | PRO_MINT (2) | 3 | 10000 |
| PRO Renew T3 | `PRO_RENEW_T3` | PRO_RENEW (3) | 3 | 10000 |

**Router kind binding**
- Set each PRO_MINT_* SKU to `KIND_PRO_MINT` (2)
- Set each PRO_RENEW_* SKU to `KIND_PRO_RENEW` (3)

---

## Notes for TBAG / RUSTYAI payments

- The signed quote determines `usdCents` and `amountIn` for TBAG/RUSTYAI.
- The router routes the **full TBAG/RUSTYAI amount** to the treasury vault and emits `PaymentExecuted` with the intended split amounts.
- Backend should not treat TBAG/RUSTYAI receipts as "pot funded" until treasury is converted to mUSD and deposited into pot/vault addresses.
