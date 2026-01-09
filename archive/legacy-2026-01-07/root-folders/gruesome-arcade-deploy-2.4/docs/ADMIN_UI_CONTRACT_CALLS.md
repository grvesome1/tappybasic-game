<!-- built by gruesøme -->
<!-- sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f -->

# Admin UI — Contract Calls (v2.4.1)

This doc lists the **exact on-chain calls** the Admin UI / ops tooling may need.

## ArcadePaymentsRouterV2 (Ownable)

Owner-only configuration:
- `setPaused(bool paused)`
- `setQuoteSigner(address signer)`
- `setProAvatar(address proAvatar)`
- `setTreasuryVault(address vault)`
- `setRecipients(address opsWallet, address dailyPot, address weeklyPot)`
- `setTokenAllowed(address token, bool allowed)`
  - Note: native ETH is always accepted (payToken = `address(0)`), it is not part of the allowlist mapping.
- `setDirectOpsToken(address token, bool enabled)`
  - If enabled for a non-mUSD ERC20, the router routes the ops portion directly to `opsWallet` in that ERC20.
- `setSkuKind(bytes32 sku, uint8 kind)`
  - Binds an SKU to a specific `kind` to prevent signing mismatched quotes.
- `setKindSplits(uint8 kind, (uint16 opsBps, uint16 dailyBps, uint16 weeklyBps, uint16 treasuryBps) splits)`
  - Must sum to 10,000.

Owner-only rescue:
- `rescueERC20(address token, address to, uint256 amount)`
- `rescueETH(address to, uint256 amount)`

User entrypoint (frontend):
- `processPayment(Quote q, bytes sig, bytes data)`
  - `data` is only used for `KIND_PRO_MINT` and must hash-match `q.dataHash`.

## ArcadeTreasuryVault (Ownable + keeper)

Owner-only configuration:
- `setKeeper(address newKeeper)`
- `setReserveToken(address token, bool enabled)`
- `setAutoConvertToken(address tokenOrZero, bool enabled)`
  - `address(0)` represents native ETH.
- `setPayoutVault(address vault, bool allowed)`
- `setSwapConfig(address mUSD, address WETH, address swapRouter)`
- `setExactOutPathToMUSD(address tokenInOrZero, bytes path)`
  - For exactOutput routing, path is encoded as `tokenOut -> fee -> ... -> tokenIn`.
- `setMaxSwapIn(address tokenInOrZero, uint256 maxAmountIn)`

Keeper-or-owner actions:
- `fundVaultMUSD(address vault, uint256 amount)`
- `swapETHForExactMUSDToVault(address vault, uint256 amountOut, uint256 amountInMaximum, uint256 deadline)`
- `swapTokenForExactMUSDToVault(address tokenIn, address vault, uint256 amountOut, uint256 amountInMaximum, uint256 deadline)`

Owner withdrawals (manual ops):
- `withdrawERC20(address token, address to, uint256 amount)`
- `withdrawETH(address to, uint256 amount)`
- `batchWithdrawERC20(address token, address[] to, uint256[] amounts)`
- `batchWithdrawETH(address[] to, uint256[] amounts)`

## ArcadeEpochVault (AccessControl)

Roles:
- `PARAM_ROLE`: can set oracle signer
- `PAUSE_ROLE`: can pause/unpause
- `SWEEP_ROLE`: can sweep ERC20s

Admin calls:
- `setOracleSigner(address newSigner)` (PARAM_ROLE)
- `pause()` / `unpause()` (PAUSE_ROLE)
- `sweepERC20(address token, address to, uint256 amount)` (SWEEP_ROLE)

Publishing:
- `publishEpoch(uint32 ymd, bytes32 root, uint256 totalAmount, bytes oracleSig)`
  - Permissionless, but requires a valid EIP-712 signature by `oracleSigner`.

## ArcadeProAvatarV2 (Ownable)

Owner-only configuration:
- `setPaymentsRouter(address router)`
- `setTransfersUnlocked(bool unlocked)`
- `setLifetimeCutoff(uint64 cutoff)`

Router-only:
- `mintFromRouter(address to, uint8 tier, string tokenURI, bytes32 dnaHash, string nickname)`
- `renewFromRouter(address user, uint8 tier)`

## ArcadePromo (AccessControl)

Roles:
- `PARAM_ROLE`: can configure promos
- `PAUSE_ROLE`: can pause/unpause

Admin calls:
- `setPromo(bytes32 gameId, uint256 grantAC)`
- `pause()` / `unpause()`

User call:
- `claimPromo(bytes32 gameId, bytes32 ref)`
