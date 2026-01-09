// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Dist = { ymd: number; root: string; totalAmount: string };

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// UniswapV3 / PancakeV3 quoter v2 (same signature as Uniswap's IQuoterV2)
const QUOTER_V2_ABI = [
  "function quoteExactOutput(bytes path, uint256 amountOut) external returns (uint256 amountIn, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)"
];

function bn(v: string | bigint | number): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  return BigInt(v);
}

function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

function getDeploymentPath(networkName: string): string {
  const base = path.join(__dirname, "..", "..", "deployments");
  const preferred =
    networkName === "lineaSepolia"
      ? path.join(base, "arcade.lineaSepolia.json")
      : networkName === "linea"
        ? path.join(base, "arcade.lineaMainnet.json")
        : "";
  if (preferred && fs.existsSync(preferred)) return preferred;

  const legacy = path.join(base, `${networkName}.json`);
  if (fs.existsSync(legacy)) return legacy;

  throw new Error(
    `Missing deployment file. Expected ${preferred || "(no preferred path for this network)"} or ${legacy}. Deploy first.`
  );
}

async function main() {
  const connection = await hre.network.connect();
  const ethers = connection.ethers;
  const networkName = connection.networkName;

  const net = await ethers.provider.getNetwork();

  const kind = (process.env.EPOCH_VAULT_KIND || "daily").trim().toLowerCase();
  const distPath = (process.env.EPOCH_DISTRIBUTION_JSON || process.argv[2] || "").trim();
  if (!distPath) throw new Error("Provide EPOCH_DISTRIBUTION_JSON or pass a file path arg");

  const deploymentsFile = getDeploymentPath(networkName);
  const deployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  const legacy = deployments._legacy ?? deployments;
  const contracts = deployments.contracts ?? legacy.contracts;
  if (!contracts) throw new Error(`Deployment file missing contracts: ${deploymentsFile}`);

  const treasuryAddr: string = contracts.ArcadeTreasuryVault;
  const dailyVaultAddr: string = contracts.ArcadeEpochVaultDaily;
  const weeklyVaultAddr: string = contracts.ArcadeEpochVaultWeekly;
  const vaultAddr: string = kind === "weekly" ? weeklyVaultAddr : dailyVaultAddr;

  const mUSD: string = legacy?.mUSD?.address || legacy?.paymentsAccepted?.mUSD || deployments?.tokens?.mUSD;
  if (!ethers.isAddress(mUSD)) throw new Error("Bad mUSD address in deployments");

  const dist = JSON.parse(fs.readFileSync(distPath, "utf8")) as Dist;
  if (!dist.totalAmount) throw new Error("Bad dist JSON: missing totalAmount");
  const required = bn(dist.totalAmount);

  // Signer: prefer TREASURY_KEEPER_PRIVATE_KEY to keep deploy key cold.
  const keeperPk = (process.env.TREASURY_KEEPER_PRIVATE_KEY || "").trim();
  let signer: any;
  if (keeperPk) {
    signer = new ethers.Wallet(keeperPk, ethers.provider);
  } else {
    const [s] = await ethers.getSigners();
    signer = s;
  }

  const musdToken = new ethers.Contract(mUSD, ERC20_ABI, ethers.provider);
  const sym = await musdToken.symbol().catch(() => "mUSD");

  const vaultBalBefore: bigint = bn(await musdToken.balanceOf(vaultAddr));
  if (vaultBalBefore >= required) {
    console.log(`[liquidity] ok: vault already funded (${sym} balance=${vaultBalBefore.toString()} required=${required.toString()})`);
    return;
  }

  let deficit = required - vaultBalBefore;

  console.log(`\n[liquidity] network=${networkName} chainId=${net.chainId}`);
  console.log(`[liquidity] kind=${kind} ymd=${dist.ymd || "?"}`);
  console.log(`[liquidity] treasury=${treasuryAddr}`);
  console.log(`[liquidity] vault=${vaultAddr}`);
  console.log(`[liquidity] required=${required.toString()} current=${vaultBalBefore.toString()} deficit=${deficit.toString()} (${sym} raw units)`);

  const treasury = await ethers.getContractAt("ArcadeTreasuryVault", treasuryAddr, signer);

  // 1) Use existing mUSD in treasury first.
  const treasuryMUSDBal: bigint = bn(await musdToken.balanceOf(treasuryAddr));
  if (treasuryMUSDBal > 0n) {
    const toSend = treasuryMUSDBal >= deficit ? deficit : treasuryMUSDBal;
    if (toSend > 0n) {
      const tx = await treasury.fundVaultMUSD(vaultAddr, toSend);
      await tx.wait();
      console.log(`[liquidity] funded from treasury mUSD: amount=${toSend.toString()} tx=${tx.hash}`);

      const newBal: bigint = bn(await musdToken.balanceOf(vaultAddr));
      deficit = required > newBal ? required - newBal : 0n;
      console.log(`[liquidity] after mUSD transfer: vault=${newBal.toString()} deficit=${deficit.toString()}`);
      if (deficit === 0n) return;
    }
  }

  // 2) Swap ETH (native) -> mUSD if configured
  const quoterAddr = (process.env.QUOTER_ADDRESS || "").trim();
  const slippageBps = Number((process.env.SWAP_SLIPPAGE_BPS || "300").trim());
  const deadlineSeconds = Number((process.env.SWAP_DEADLINE_SECONDS || "900").trim());

  if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 2_000) {
    throw new Error("SWAP_SLIPPAGE_BPS must be 0..2000");
  }
  if (!Number.isFinite(deadlineSeconds) || deadlineSeconds < 60 || deadlineSeconds > 3600) {
    throw new Error("SWAP_DEADLINE_SECONDS must be 60..3600");
  }

  if (!quoterAddr) {
    throw new Error(
      `Liquidity deficit remains (${deficit.toString()}), but QUOTER_ADDRESS is not set.\n` +
        `Set QUOTER_ADDRESS for your DEX (UniswapV3/PancakeV3 quoter v2) or top up mUSD manually.`
    );
  }

  const quoter = new ethers.Contract(quoterAddr, QUOTER_V2_ABI, ethers.provider);

  // Helper: quote amountIn for exactOutput
  async function quoteIn(pathBytes: string, amountOut: bigint): Promise<bigint> {
    const res = await quoter.quoteExactOutput.staticCall(pathBytes, amountOut);
    // ethers v6 returns array-like Result; amountIn is index 0
    return bn(res[0]);
  }

  async function tryEthSwap(amountOut: bigint): Promise<boolean> {
    const enabled: boolean = await treasury.autoConvertToken(ethers.ZeroAddress);
    if (!enabled) {
      console.log(`[liquidity] ETH autoConvertToken disabled; skipping ETH swap`);
      return false;
    }

    const pathBytes: string = await treasury.exactOutPathToMUSD(ethers.ZeroAddress);
    if (!pathBytes || pathBytes === "0x") {
      console.log(`[liquidity] No exactOutPathToMUSD configured for ETH; skipping ETH swap`);
      return false;
    }

    const cap: bigint = bn(await treasury.maxSwapIn(ethers.ZeroAddress));
    const ethBal: bigint = bn(await ethers.provider.getBalance(treasuryAddr));

    const quotedIn = await quoteIn(pathBytes, amountOut);
    let maxIn = (quotedIn * (10_000n + BigInt(slippageBps))) / 10_000n;

    if (cap !== 0n && maxIn > cap) maxIn = cap;
    if (maxIn > ethBal) {
      console.log(`[liquidity] ETH insufficient: need<=${maxIn.toString()} have=${ethBal.toString()}`);
      return false;
    }

    const deadline = BigInt(nowTs() + deadlineSeconds);

    console.log(`[liquidity] swapping ETH->${sym}: amountOut=${amountOut.toString()} quotedIn=${quotedIn.toString()} maxIn=${maxIn.toString()} slippageBps=${slippageBps}`);

    const tx = await treasury.swapETHForExactMUSDToVault(vaultAddr, amountOut, maxIn, deadline);
    await tx.wait();

    console.log(`[liquidity] ETH swap tx=${tx.hash}`);
    return true;
  }

  async function tryLineaSwap(amountOut: bigint): Promise<boolean> {
    const lineaToken: string = ((legacy?.paymentsAccepted?.LINEA || deployments?.tokens?.LINEA || "") as string).trim();
    if (!lineaToken) {
      console.log(`[liquidity] No LINEA token configured in deployments; skipping LINEA swap`);
      return false;
    }

    const enabled: boolean = await treasury.autoConvertToken(lineaToken);
    if (!enabled) {
      console.log(`[liquidity] LINEA autoConvertToken disabled; skipping LINEA swap`);
      return false;
    }

    const pathBytes: string = await treasury.exactOutPathToMUSD(lineaToken);
    if (!pathBytes || pathBytes === "0x") {
      console.log(`[liquidity] No exactOutPathToMUSD configured for LINEA; skipping LINEA swap`);
      return false;
    }

    const cap: bigint = bn(await treasury.maxSwapIn(lineaToken));
    const linea = new ethers.Contract(lineaToken, ERC20_ABI, ethers.provider);
    const lineaBal: bigint = bn(await linea.balanceOf(treasuryAddr));

    const quotedIn = await quoteIn(pathBytes, amountOut);
    let maxIn = (quotedIn * (10_000n + BigInt(slippageBps))) / 10_000n;
    if (cap !== 0n && maxIn > cap) maxIn = cap;

    if (maxIn > lineaBal) {
      console.log(`[liquidity] LINEA insufficient: need<=${maxIn.toString()} have=${lineaBal.toString()}`);
      return false;
    }

    const deadline = BigInt(nowTs() + deadlineSeconds);

    console.log(`[liquidity] swapping LINEA->${sym}: amountOut=${amountOut.toString()} quotedIn=${quotedIn.toString()} maxIn=${maxIn.toString()} slippageBps=${slippageBps}`);

    const tx = await treasury.swapTokenForExactMUSDToVault(lineaToken, vaultAddr, amountOut, maxIn, deadline);
    await tx.wait();

    console.log(`[liquidity] LINEA swap tx=${tx.hash}`);
    return true;
  }

  // Try ETH first, then LINEA.
  if (await tryEthSwap(deficit)) {
    const bal = bn(await musdToken.balanceOf(vaultAddr));
    deficit = required > bal ? required - bal : 0n;
    console.log(`[liquidity] after ETH swap: vault=${bal.toString()} deficit=${deficit.toString()}`);
  }

  if (deficit > 0n) {
    if (await tryLineaSwap(deficit)) {
      const bal = bn(await musdToken.balanceOf(vaultAddr));
      deficit = required > bal ? required - bal : 0n;
      console.log(`[liquidity] after LINEA swap: vault=${bal.toString()} deficit=${deficit.toString()}`);
    }
  }

  if (deficit > 0n) {
    throw new Error(`Liquidity still insufficient after swaps. Missing ${deficit.toString()} ${sym} units.`);
  }

  console.log(`[liquidity] ok: vault funded for epoch publish`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
