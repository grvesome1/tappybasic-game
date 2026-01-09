// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Addr = string;

const KIT_VERSION = "2.4.1";
const MANIFEST_VERSION = 1;

function getChainSlug(networkName: string): { chainSlug: "lineaSepolia" | "lineaMainnet"; rpcUrlKeyName: string } {
  if (networkName === "lineaSepolia") return { chainSlug: "lineaSepolia", rpcUrlKeyName: "LINEA_SEPOLIA_RPC_URL" };
  if (networkName === "linea") return { chainSlug: "lineaMainnet", rpcUrlKeyName: "LINEA_RPC_URL" };
  throw new Error(`Unsupported network name=${networkName}. Expected lineaSepolia or linea.`);
}

function getExplorerUrls(chainSlug: "lineaSepolia" | "lineaMainnet"): { explorerBaseUrl: string; explorerApiUrl: string } {
  if (chainSlug === "lineaSepolia") {
    return { explorerBaseUrl: "https://sepolia.lineascan.build", explorerApiUrl: "https://api-sepolia.lineascan.build/api" };
  }
  return { explorerBaseUrl: "https://lineascan.build", explorerApiUrl: "https://api.lineascan.build/api" };
}

function parseUint(name: string, v: string | undefined): bigint | null {
  if (!v || !v.trim()) return null;
  const s = v.trim();
  if (!/^[0-9]+$/.test(s)) throw new Error(`Bad ${name}; expected integer string`);
  return BigInt(s);
}

function parseIntNum(name: string, v: string | undefined): number | null {
  if (!v || !v.trim()) return null;
  const n = Number(v.trim());
  if (!Number.isFinite(n) || n < 0) throw new Error(`Bad ${name}; expected non-negative number`);
  return n;
}

function hexPadAddress(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "").padStart(40, "0");
}

function hexPadFee(fee: number): string {
  if (!Number.isInteger(fee) || fee < 0 || fee > 1_000_000) throw new Error(`Bad fee: ${fee}`);
  return fee.toString(16).padStart(6, "0"); // uint24
}

/**
 * UniswapV3/PancakeV3 path encoding.
 * - exactInput:  tokenIn -> ... -> tokenOut
 * - exactOutput: tokenOut -> ... -> tokenIn
 */
function encodeV3Path(tokens: string[], fees: number[]): string {
  if (tokens.length !== fees.length + 1) {
    throw new Error(`encodeV3Path: tokens.length must equal fees.length + 1 (got ${tokens.length} tokens, ${fees.length} fees)`);
  }
  let hex = "0x";
  for (let i = 0; i < fees.length; i++) {
    hex += hexPadAddress(tokens[i]);
    hex += hexPadFee(fees[i]);
  }
  hex += hexPadAddress(tokens[tokens.length - 1]);
  return hex;
}

function mustAddr(label: string, v: string | undefined): Addr {
  if (!v || !v.trim()) throw new Error(`Missing env var: ${label}`);
  return v.trim();
}

async function transferAccessControlRoles(params: {
  contractName: string;
  contract: any;
  newAdmin: Addr;
  oldAdmin: Addr;
  roleNames: string[];
}) {
  const { contractName, contract, newAdmin, oldAdmin, roleNames } = params;

  for (const roleName of roleNames) {
    const role: string = await contract[roleName]();
    const tx = await contract.grantRole(role, newAdmin);
    await tx.wait();
  }

  for (const roleName of roleNames) {
    const role: string = await contract[roleName]();
    const tx = await contract.revokeRole(role, oldAdmin);
    await tx.wait();
  }

  console.log(`[roles] ${contractName}: transferred ${roleNames.join(", ")} to ${newAdmin}`);
}

async function main() {
  const connection = await hre.network.connect();
  const ethers = connection.ethers;
  const networkName = connection.networkName;

  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  const { chainSlug, rpcUrlKeyName } = getChainSlug(networkName);
  const { explorerBaseUrl, explorerApiUrl } = getExplorerUrls(chainSlug);

  const multisig = (process.env.MULTISIG_ADDRESS || "").trim();
  const finalAdmin: Addr = multisig && multisig !== "" ? multisig : deployer.address;

  const opsWallet: Addr = (process.env.OPS_WALLET_ADDRESS || "").trim() || finalAdmin;
  const quoteSigner: Addr = (process.env.QUOTE_SIGNER_ADDRESS || "").trim() || deployer.address;
  const oracleSigner: Addr = (process.env.ORACLE_SIGNER_ADDRESS || "").trim() || deployer.address;

  // Optional "treasury reserve" tokens (non-stable payment tokens that should be held,
  // not auto-routed to payout pots). Examples: TBAG, RUSTYAI.
  const tbagToken: Addr = (process.env.TBAG_TOKEN_ADDRESS || "").trim();
  const rustyToken: Addr = (process.env.RUSTYAI_TOKEN_ADDRESS || "").trim();

  // Optional Linea ecosystem token acceptance.
  // - ETH on Linea is the gas token (native).
  // - LINEA is an ERC20 token (configured here).
  const lineaToken: Addr = (process.env.LINEA_TOKEN_ADDRESS || "").trim();

  // Treasury auto-conversion (optional; recommended for automated payouts)
  const treasuryKeeper: Addr = (process.env.TREASURY_KEEPER_ADDRESS || "").trim() || finalAdmin;
  const swapRouterAddr: Addr = (process.env.SWAP_ROUTER_ADDRESS || "").trim();
  const wethAddr: Addr = (process.env.WETH_ADDRESS || "").trim();

  // Fee tiers for v3-style routing (uint24). You MUST confirm these pools exist on your DEX.
  const feeWethToMUSD = parseIntNum("V3_FEE_WETH_MUSD", process.env.V3_FEE_WETH_MUSD) ?? 3000;
  const feeLineaToWeth = parseIntNum("V3_FEE_LINEA_WETH", process.env.V3_FEE_LINEA_WETH) ?? 3000;
  const feeLineaToMUSD = parseIntNum("V3_FEE_LINEA_MUSD", process.env.V3_FEE_LINEA_MUSD); // optional direct pool

  // Optional caps (prevent fat-fingered maxIn). Values are raw wei/token units.
  const maxEthSwapIn = parseUint("MAX_ETH_SWAP_IN", process.env.MAX_ETH_SWAP_IN);
  const maxLineaSwapIn = parseUint("MAX_LINEA_SWAP_IN", process.env.MAX_LINEA_SWAP_IN);

  console.log(`\n[deploy] network=${networkName} chainId=${net.chainId}`);
  console.log(`[deploy] deployer=${deployer.address}`);
  console.log(`[deploy] finalAdmin=${finalAdmin}`);
  console.log(`[deploy] opsWallet=${opsWallet}`);
  console.log(`[deploy] quoteSigner=${quoteSigner}`);
  console.log(`[deploy] oracleSigner=${oracleSigner}`);
  if (lineaToken) console.log(`[deploy] LINEA_TOKEN_ADDRESS=${lineaToken}`);
  if (swapRouterAddr) console.log(`[deploy] SWAP_ROUTER_ADDRESS=${swapRouterAddr}`);
  if (wethAddr) console.log(`[deploy] WETH_ADDRESS=${wethAddr}`);
  console.log(`[deploy] TREASURY_KEEPER_ADDRESS=${treasuryKeeper}`);
  if (tbagToken) console.log(`[deploy] TBAG_TOKEN_ADDRESS=${tbagToken}`);
  if (rustyToken) console.log(`[deploy] RUSTYAI_TOKEN_ADDRESS=${rustyToken}`);

  // --- mUSD (real token or MockERC20 fallback) ---
  let musd: Addr = (process.env.MUSD_ADDRESS || "").trim();
  let mockMUSDDeployed = false;

  if (!musd) {
    const Mock = await ethers.getContractFactory("MockERC20");
    const mock = await Mock.deploy("Mock USD", "mUSD");
    await mock.waitForDeployment();
    musd = await mock.getAddress();
    mockMUSDDeployed = true;

    // Mint test tokens to deployer for staging smoke tests
    const mintTx = await mock.mint(deployer.address, ethers.parseUnits("1000000", 18));
    await mintTx.wait();

    console.log(`[deploy] Mock mUSD deployed at ${musd} (minted 1,000,000 to deployer)`);
  } else {
    console.log(`[deploy] Using existing mUSD at ${musd}`);
  }

  // --- Treasury vault ---
  const Treasury = await ethers.getContractFactory("ArcadeTreasuryVault");
  const treasury = await Treasury.deploy(deployer.address);
  await treasury.waitForDeployment();
  const treasuryAddr: Addr = await treasury.getAddress();
  console.log(`[deploy] ArcadeTreasuryVault: ${treasuryAddr}`);

  // --- Epoch vaults (daily + weekly) ---
  const Epoch = await ethers.getContractFactory("ArcadeEpochVault");

  const dailyVault = await Epoch.deploy(deployer.address, musd, oracleSigner);
  await dailyVault.waitForDeployment();
  const dailyVaultAddr: Addr = await dailyVault.getAddress();
  console.log(`[deploy] ArcadeEpochVault (daily):  ${dailyVaultAddr}`);

  const weeklyVault = await Epoch.deploy(deployer.address, musd, oracleSigner);
  await weeklyVault.waitForDeployment();
  const weeklyVaultAddr: Addr = await weeklyVault.getAddress();
  console.log(`[deploy] ArcadeEpochVault (weekly): ${weeklyVaultAddr}`);

  const dailyPot: Addr = (process.env.DAILY_POT_ADDRESS || "").trim() || dailyVaultAddr;
  const weeklyPot: Addr = (process.env.WEEKLY_POT_ADDRESS || "").trim() || weeklyVaultAddr;

  // --- Promo ---
  const Promo = await ethers.getContractFactory("ArcadePromo");
  const promo = await Promo.deploy(deployer.address);
  await promo.waitForDeployment();
  const promoAddr: Addr = await promo.getAddress();
  console.log(`[deploy] ArcadePromo:            ${promoAddr}`);

  // --- PRO Avatar ---
  const Pro = await ethers.getContractFactory("ArcadeProAvatarV2");
  const pro = await Pro.deploy(deployer.address);
  await pro.waitForDeployment();
  const proAddr: Addr = await pro.getAddress();
  console.log(`[deploy] ArcadeProAvatarV2:      ${proAddr}`);

  // --- Payments Router ---
  const Router = await ethers.getContractFactory("ArcadePaymentsRouterV2");
  const router = await Router.deploy(
    deployer.address,
    musd,
    treasuryAddr,
    opsWallet,
    dailyPot,
    weeklyPot,
    quoteSigner
  );
  await router.waitForDeployment();
  const routerAddr: Addr = await router.getAddress();
  console.log(`[deploy] ArcadePaymentsRouterV2: ${routerAddr}`);

  const routerEip712Name: string = await router.EIP712_NAME();
  const routerEip712Version: string = await router.EIP712_VERSION();
  const routerQuoteTypeHash: string = await router.QUOTE_TYPEHASH();

  // --- Wiring ---
  await (await pro.setPaymentsRouter(routerAddr)).wait();
  await (await router.setProAvatar(proAddr)).wait();

  console.log(`[wire] pro.setPaymentsRouter(${routerAddr})`);
  console.log(`[wire] router.setProAvatar(${proAddr})`);

  // --- Optional treasury reserve tokens (TBAG/RUSTYAI) ---
  // These tokens are accepted as payment, but since they are non-mUSD, the router will
  // route the full amount to the Treasury Vault (no direct payout pot funding).
  // Mark them as "reserve" tokens in the treasury for UI/reporting.
  if (tbagToken) {
    await (await router.setTokenAllowed(tbagToken, true)).wait();
    await (await treasury.setReserveToken(tbagToken, true)).wait();
    console.log(`[config] enabled TBAG token + marked as reserve: ${tbagToken}`);
  }
  if (rustyToken) {
    await (await router.setTokenAllowed(rustyToken, true)).wait();
    await (await treasury.setReserveToken(rustyToken, true)).wait();
    console.log(`[config] enabled RUSTYAI token + marked as reserve: ${rustyToken}`);
  }

  // --- Optional LINEA token payments (ERC20) ---
  if (lineaToken) {
    await (await router.setTokenAllowed(lineaToken, true)).wait();
    console.log(`[config] enabled LINEA token payments: ${lineaToken}`);
  }

  // --- Treasury keeper + payout vault allowlist (for automated funding) ---
  await (await treasury.setKeeper(treasuryKeeper)).wait();
  await (await treasury.setPayoutVault(dailyPot, true)).wait();
  await (await treasury.setPayoutVault(weeklyPot, true)).wait();
  console.log(`[config] treasury keeper set: ${treasuryKeeper}`);
  console.log(`[config] allowlisted payout vaults: daily=${dailyPot} weekly=${weeklyPot}`);

  // Enable ETH auto-conversion by default (address(0) = native ETH).
  await (await treasury.setAutoConvertToken(ethers.ZeroAddress, true)).wait();

  // Optionally enable LINEA auto-conversion.
  if (lineaToken) {
    await (await treasury.setAutoConvertToken(lineaToken, true)).wait();
  }

  // Optional swap router config + default paths.
  if (swapRouterAddr && wethAddr) {
    await (await treasury.setSwapConfig(musd, wethAddr, swapRouterAddr)).wait();

    // ExactOutput paths: tokenOut -> ... -> tokenIn
    const ethExactOutPath = encodeV3Path([musd, wethAddr], [feeWethToMUSD]);
    await (await treasury.setExactOutPathToMUSD(ethers.ZeroAddress, ethExactOutPath)).wait();

    if (lineaToken) {
      const lineaExactOutPath = feeLineaToMUSD
        ? encodeV3Path([musd, lineaToken], [feeLineaToMUSD])
        : encodeV3Path([musd, wethAddr, lineaToken], [feeWethToMUSD, feeLineaToWeth]);
      await (await treasury.setExactOutPathToMUSD(lineaToken, lineaExactOutPath)).wait();
    }

    console.log(`[config] treasury swap router configured`);
  } else {
    console.log(`[config] swap config skipped (SWAP_ROUTER_ADDRESS or WETH_ADDRESS missing)`);
  }

  if (maxEthSwapIn) {
    await (await treasury.setMaxSwapIn(ethers.ZeroAddress, maxEthSwapIn)).wait();
    console.log(`[config] MAX_ETH_SWAP_IN=${maxEthSwapIn.toString()}`);
  }
  if (maxLineaSwapIn && lineaToken) {
    await (await treasury.setMaxSwapIn(lineaToken, maxLineaSwapIn)).wait();
    console.log(`[config] MAX_LINEA_SWAP_IN=${maxLineaSwapIn.toString()}`);
  }

  // --- Transfer admin control to multisig (recommended) ---
  if (multisig && multisig !== "" && multisig.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`\n[handoff] transferring ownership/roles to multisig: ${multisig}`);

    await (await treasury.transferOwnership(multisig)).wait();
    await (await pro.transferOwnership(multisig)).wait();
    await (await router.transferOwnership(multisig)).wait();

    await transferAccessControlRoles({
      contractName: "ArcadeEpochVault(daily)",
      contract: dailyVault,
      newAdmin: multisig,
      oldAdmin: deployer.address,
      roleNames: ["DEFAULT_ADMIN_ROLE", "PARAM_ROLE", "PAUSE_ROLE", "SWEEP_ROLE"]
    });

    await transferAccessControlRoles({
      contractName: "ArcadeEpochVault(weekly)",
      contract: weeklyVault,
      newAdmin: multisig,
      oldAdmin: deployer.address,
      roleNames: ["DEFAULT_ADMIN_ROLE", "PARAM_ROLE", "PAUSE_ROLE", "SWEEP_ROLE"]
    });

    await transferAccessControlRoles({
      contractName: "ArcadePromo",
      contract: promo,
      newAdmin: multisig,
      oldAdmin: deployer.address,
      roleNames: ["DEFAULT_ADMIN_ROLE", "PARAM_ROLE", "PAUSE_ROLE"]
    });
  }

  // --- Persist deployment JSON ---
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });

  const legacyPayload = {
    packageVersion: KIT_VERSION,
    network: networkName,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    multisig: multisig || null,
    opsWallet,
    quoteSigner,
    oracleSigner,
    reserveTokens: {
      TBAG: tbagToken || null,
      RUSTYAI: rustyToken || null
    },
    paymentsAccepted: {
      nativeETH: true,
      LINEA: lineaToken || null,
      TBAG: tbagToken || null,
      RUSTYAI: rustyToken || null,
      mUSD: musd
    },
    treasuryAutomation: {
      keeper: treasuryKeeper,
      swapRouter: swapRouterAddr || null,
      WETH: wethAddr || null,
      v3Fees: {
        WETH_to_mUSD: feeWethToMUSD,
        LINEA_to_WETH: feeLineaToWeth,
        LINEA_to_mUSD: feeLineaToMUSD || null
      },
      maxSwapIn: {
        ETH: maxEthSwapIn ? maxEthSwapIn.toString() : null,
        LINEA: maxLineaSwapIn ? maxLineaSwapIn.toString() : null
      }
    },
    mUSD: {
      address: musd,
      mockDeployed: mockMUSDDeployed
    },
    pots: {
      dailyPot,
      weeklyPot
    },
    contracts: {
      ArcadeTreasuryVault: treasuryAddr,
      ArcadeEpochVaultDaily: dailyVaultAddr,
      ArcadeEpochVaultWeekly: weeklyVaultAddr,
      ArcadePromo: promoAddr,
      ArcadeProAvatarV2: proAddr,
      ArcadePaymentsRouterV2: routerAddr
    },
    constructorArgs: {
      ArcadeTreasuryVault: [deployer.address],
      ArcadeEpochVaultDaily: [deployer.address, musd, oracleSigner],
      ArcadeEpochVaultWeekly: [deployer.address, musd, oracleSigner],
      ArcadePromo: [deployer.address],
      ArcadeProAvatarV2: [deployer.address],
      ArcadePaymentsRouterV2: [deployer.address, musd, treasuryAddr, opsWallet, dailyPot, weeklyPot, quoteSigner]
    }
  };

  const manifest = {
    kitVersion: KIT_VERSION,
    manifestVersion: MANIFEST_VERSION,
    network: {
      name: networkName,
      chainId: Number(net.chainId),
      rpcUrlKeyName,
      explorerBaseUrl,
      explorerApiUrl
    },
    deployedAt: legacyPayload.deployedAt,
    gitCommit: (process.env.GIT_COMMIT || "").trim() || null,
    deployerAddress: deployer.address,
    roles: {
      multisig: multisig || null,
      finalAdmin,
      opsWallet,
      quoteSigner,
      oracleSigner,
      treasuryKeeper
    },
    tokens: {
      mUSD: musd,
      WETH: wethAddr || null,
      LINEA: lineaToken || null,
      TBAG: tbagToken || null,
      RUSTYAI: rustyToken || null
    },
    dex: {
      swapRouter: swapRouterAddr || null,
      quoter: null
    },
    eip712: {
      quote: {
        domain: {
          name: routerEip712Name,
          version: routerEip712Version,
          chainId: Number(net.chainId),
          verifyingContract: routerAddr
        },
        typeHash: routerQuoteTypeHash,
        fields: [
          { name: "buyer", type: "address" },
          { name: "sku", type: "bytes32" },
          { name: "kind", type: "uint8" },
          { name: "payToken", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "usdCents", type: "uint256" },
          { name: "credits", type: "uint256" },
          { name: "tier", type: "uint8" },
          { name: "expiresAt", type: "uint64" },
          { name: "nonce", type: "uint256" },
          { name: "ref", type: "bytes32" },
          { name: "dataHash", type: "bytes32" }
        ]
      }
    },
    acceptedPayments: {
      native: true,
      erc20: [
        { address: musd, symbol: "mUSD", label: "mUSD" },
        ...(lineaToken ? [{ address: lineaToken, symbol: "LINEA", label: "LINEA" }] : []),
        ...(tbagToken ? [{ address: tbagToken, symbol: "TBAG", label: "TBAG" }] : []),
        ...(rustyToken ? [{ address: rustyToken, symbol: "RUSTYAI", label: "RUSTYAI" }] : [])
      ]
    },
    contracts: legacyPayload.contracts,
    constructorArgs: legacyPayload.constructorArgs,
    _legacy: legacyPayload
  };

  const legacyOutPath = path.join(outDir, `${networkName}.json`);
  const outPath = path.join(outDir, `arcade.${chainSlug}.json`);
  const latestPath = path.join(outDir, `latest.json`);

  fs.writeFileSync(legacyOutPath, JSON.stringify(legacyPayload, null, 2));
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(latestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n[ok] saved ${legacyOutPath}`);
  console.log(`[ok] saved ${outPath}`);
  console.log(`[ok] saved ${latestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
