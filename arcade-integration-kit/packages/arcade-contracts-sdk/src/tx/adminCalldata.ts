// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import { Interface } from "ethers";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RouterAbi = require("../generated/abi/ArcadePaymentsRouterV2.abi.json");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TreasuryAbi = require("../generated/abi/ArcadeTreasuryVault.abi.json");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EpochVaultAbi = require("../generated/abi/ArcadeEpochVault.abi.json");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ProAbi = require("../generated/abi/ArcadeProAvatarV2.abi.json");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PromoAbi = require("../generated/abi/ArcadePromo.abi.json");

const routerIface = new Interface(RouterAbi);
const treasuryIface = new Interface(TreasuryAbi);
const epochIface = new Interface(EpochVaultAbi);
const proIface = new Interface(ProAbi);
const promoIface = new Interface(PromoAbi);

export type KindSplits = {
  opsBps: number;
  dailyBps: number;
  weeklyBps: number;
  treasuryBps: number;
};

export const adminCalldata = {
  router: {
    setPaused: (paused: boolean) => routerIface.encodeFunctionData("setPaused", [paused]),
    setQuoteSigner: (signer: string) => routerIface.encodeFunctionData("setQuoteSigner", [signer]),
    setProAvatar: (proAvatar: string) => routerIface.encodeFunctionData("setProAvatar", [proAvatar]),
    setTreasuryVault: (vault: string) => routerIface.encodeFunctionData("setTreasuryVault", [vault]),
    setRecipients: (opsWallet: string, dailyPot: string, weeklyPot: string) =>
      routerIface.encodeFunctionData("setRecipients", [opsWallet, dailyPot, weeklyPot]),
    setTokenAllowed: (token: string, allowed: boolean) => routerIface.encodeFunctionData("setTokenAllowed", [token, allowed]),
    setDirectOpsToken: (token: string, enabled: boolean) =>
      routerIface.encodeFunctionData("setDirectOpsToken", [token, enabled]),
    setSkuKind: (sku: string, kind: number) => routerIface.encodeFunctionData("setSkuKind", [sku, kind]),
    setKindSplits: (kind: number, splits: KindSplits) =>
      routerIface.encodeFunctionData("setKindSplits", [kind, [splits.opsBps, splits.dailyBps, splits.weeklyBps, splits.treasuryBps]]),
    rescueERC20: (token: string, to: string, amount: bigint) => routerIface.encodeFunctionData("rescueERC20", [token, to, amount]),
    rescueETH: (to: string, amount: bigint) => routerIface.encodeFunctionData("rescueETH", [to, amount])
  },

  treasury: {
    setKeeper: (newKeeper: string) => treasuryIface.encodeFunctionData("setKeeper", [newKeeper]),
    setReserveToken: (token: string, enabled: boolean) => treasuryIface.encodeFunctionData("setReserveToken", [token, enabled]),
    setAutoConvertToken: (tokenOrZero: string, enabled: boolean) =>
      treasuryIface.encodeFunctionData("setAutoConvertToken", [tokenOrZero, enabled]),
    setPayoutVault: (vault: string, allowed: boolean) => treasuryIface.encodeFunctionData("setPayoutVault", [vault, allowed]),
    setSwapConfig: (mUSD: string, WETH: string, swapRouter: string) =>
      treasuryIface.encodeFunctionData("setSwapConfig", [mUSD, WETH, swapRouter]),
    setExactOutPathToMUSD: (tokenInOrZero: string, path: string) =>
      treasuryIface.encodeFunctionData("setExactOutPathToMUSD", [tokenInOrZero, path]),
    setMaxSwapIn: (tokenInOrZero: string, maxAmountIn: bigint) =>
      treasuryIface.encodeFunctionData("setMaxSwapIn", [tokenInOrZero, maxAmountIn]),

    fundVaultMUSD: (vault: string, amount: bigint) => treasuryIface.encodeFunctionData("fundVaultMUSD", [vault, amount]),
    swapETHForExactMUSDToVault: (vault: string, amountOut: bigint, amountInMaximum: bigint, deadline: bigint) =>
      treasuryIface.encodeFunctionData("swapETHForExactMUSDToVault", [vault, amountOut, amountInMaximum, deadline]),
    swapTokenForExactMUSDToVault: (tokenIn: string, vault: string, amountOut: bigint, amountInMaximum: bigint, deadline: bigint) =>
      treasuryIface.encodeFunctionData("swapTokenForExactMUSDToVault", [tokenIn, vault, amountOut, amountInMaximum, deadline]),

    withdrawERC20: (token: string, to: string, amount: bigint) => treasuryIface.encodeFunctionData("withdrawERC20", [token, to, amount]),
    withdrawETH: (to: string, amount: bigint) => treasuryIface.encodeFunctionData("withdrawETH", [to, amount]),
    batchWithdrawERC20: (token: string, to: string[], amounts: bigint[]) =>
      treasuryIface.encodeFunctionData("batchWithdrawERC20", [token, to, amounts]),
    batchWithdrawETH: (to: string[], amounts: bigint[]) => treasuryIface.encodeFunctionData("batchWithdrawETH", [to, amounts])
  },

  epochVault: {
    setOracleSigner: (newSigner: string) => epochIface.encodeFunctionData("setOracleSigner", [newSigner]),
    pause: () => epochIface.encodeFunctionData("pause", []),
    unpause: () => epochIface.encodeFunctionData("unpause", []),
    sweepERC20: (token: string, to: string, amount: bigint) => epochIface.encodeFunctionData("sweepERC20", [token, to, amount]),
    publishEpoch: (ymd: number, root: string, totalAmount: bigint, oracleSig: string) =>
      epochIface.encodeFunctionData("publishEpoch", [ymd, root, totalAmount, oracleSig])
  },

  proAvatar: {
    setPaymentsRouter: (router: string) => proIface.encodeFunctionData("setPaymentsRouter", [router]),
    setTransfersUnlocked: (unlocked: boolean) => proIface.encodeFunctionData("setTransfersUnlocked", [unlocked]),
    setLifetimeCutoff: (cutoff: bigint) => proIface.encodeFunctionData("setLifetimeCutoff", [cutoff])
  },

  promo: {
    setPromo: (gameId: string, grantAC: bigint) => promoIface.encodeFunctionData("setPromo", [gameId, grantAC]),
    pause: () => promoIface.encodeFunctionData("pause", []),
    unpause: () => promoIface.encodeFunctionData("unpause", [])
  }
};
