// Post-deployment wiring script for already-deployed contracts
// Run: npx hardhat run scripts/post-deploy-wiring.ts --network lineaSepolia

import hre from "hardhat";
import { ethers as ethersLib, Contract } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getEthersFromConnection(connection: any) {
  const networkConfig = connection.networkConfig as any;

  let rpcUrl = "";
  if (networkConfig.url && typeof networkConfig.url === "object" && networkConfig.url.get) {
    rpcUrl = await networkConfig.url.get();
  } else if (typeof networkConfig.url === "string") {
    rpcUrl = networkConfig.url;
  }

  const accounts: string[] = [];
  if (networkConfig.accounts && Array.isArray(networkConfig.accounts)) {
    for (const acc of networkConfig.accounts) {
      if (typeof acc === "string") {
        accounts.push(acc);
      } else if (acc && typeof acc === "object" && acc.get) {
        const val = await acc.get();
        if (val) accounts.push(val);
      }
    }
  }

  if (!rpcUrl) throw new Error("No RPC URL found");
  if (accounts.length === 0) throw new Error("No accounts found - set DEPLOYER_PRIVATE_KEY in .env");

  const provider = new ethersLib.JsonRpcProvider(rpcUrl);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ? feeData.gasPrice * 2n : ethersLib.parseUnits("1", "gwei");
  const signers = accounts.map((pk) => new ethersLib.Wallet(pk, provider));

  return { provider, gasPrice, signers };
}

function loadAbi(contractName: string): any[] {
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", `${contractName}.sol`, `${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  return artifact.abi;
}

async function main() {
  const connection = await hre.network.connect();
  const { provider, gasPrice, signers } = await getEthersFromConnection(connection);
  const [deployer] = signers;

  console.log(`Running post-deployment wiring with: ${deployer.address}`);
  console.log(`Using gas price: ${ethersLib.formatUnits(gasPrice, "gwei")} gwei`);

  // Load deployment manifest
  const manifestPath = path.join(__dirname, "..", "deployments", "arcade.lineaSepolia.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  const contracts = manifest.contracts;
  const tokens = manifest.tokens;

  // Connect to contracts
  const proAbi = loadAbi("ArcadeProAvatarV2");
  const routerAbi = loadAbi("ArcadePaymentsRouterV2");
  const treasuryAbi = loadAbi("ArcadeTreasuryVault");

  const pro = new Contract(contracts.ArcadeProAvatarV2, proAbi, deployer);
  const router = new Contract(contracts.ArcadePaymentsRouterV2, routerAbi, deployer);
  const treasury = new Contract(contracts.ArcadeTreasuryVault, treasuryAbi, deployer);

  console.log("\n=== Checking current state ===");

  // Check if wiring is already done
  const currentPaymentsRouter = await pro.paymentsRouter();
  const currentProAvatar = await router.proAvatar();

  console.log(`PRO Avatar's paymentsRouter: ${currentPaymentsRouter}`);
  console.log(`Router's proAvatar: ${currentProAvatar}`);

  const routerAddr = contracts.ArcadePaymentsRouterV2;
  const proAddr = contracts.ArcadeProAvatarV2;

  // Wiring step 1: PRO Avatar <- Router
  if (currentPaymentsRouter.toLowerCase() !== routerAddr.toLowerCase()) {
    console.log(`\n[wire] Setting PRO Avatar's paymentsRouter to ${routerAddr}...`);
    const tx1 = await pro.setPaymentsRouter(routerAddr, { gasPrice });
    await tx1.wait();
    console.log(`[wire] Done: pro.setPaymentsRouter(${routerAddr})`);
  } else {
    console.log(`[skip] PRO Avatar already has correct paymentsRouter`);
  }

  // Wiring step 2: Router <- PRO Avatar
  if (currentProAvatar.toLowerCase() !== proAddr.toLowerCase()) {
    console.log(`\n[wire] Setting Router's proAvatar to ${proAddr}...`);
    const tx2 = await router.setProAvatar(proAddr, { gasPrice });
    await tx2.wait();
    console.log(`[wire] Done: router.setProAvatar(${proAddr})`);
  } else {
    console.log(`[skip] Router already has correct proAvatar`);
  }

  // Token configuration
  console.log("\n=== Checking token configuration ===");

  if (tokens.mUSD) {
    const mUSDAllowed = await router.tokenAllowed(tokens.mUSD);
    console.log(`mUSD (${tokens.mUSD}) allowed: ${mUSDAllowed}`);
    if (!mUSDAllowed) {
      console.log(`[config] Enabling mUSD...`);
      const tx = await router.setTokenAllowed(tokens.mUSD, true, { gasPrice });
      await tx.wait();
      console.log(`[config] mUSD enabled`);
    }
  }

  if (tokens.TBAG) {
    const tbagAllowed = await router.tokenAllowed(tokens.TBAG);
    console.log(`TBAG (${tokens.TBAG}) allowed: ${tbagAllowed}`);
    if (!tbagAllowed) {
      console.log(`[config] Enabling TBAG...`);
      const tx = await router.setTokenAllowed(tokens.TBAG, true, { gasPrice });
      await tx.wait();
      const tx2 = await treasury.setReserveToken(tokens.TBAG, true, { gasPrice });
      await tx2.wait();
      console.log(`[config] TBAG enabled and marked as reserve`);
    }
  }

  if (tokens.RUSTYAI) {
    const rustyAllowed = await router.tokenAllowed(tokens.RUSTYAI);
    console.log(`RUSTYAI (${tokens.RUSTYAI}) allowed: ${rustyAllowed}`);
    if (!rustyAllowed) {
      console.log(`[config] Enabling RUSTYAI...`);
      const tx = await router.setTokenAllowed(tokens.RUSTYAI, true, { gasPrice });
      await tx.wait();
      const tx2 = await treasury.setReserveToken(tokens.RUSTYAI, true, { gasPrice });
      await tx2.wait();
      console.log(`[config] RUSTYAI enabled and marked as reserve`);
    }
  }

  // Treasury payout vaults
  console.log("\n=== Checking treasury payout vaults ===");

  const dailyVault = contracts.ArcadeEpochVaultDaily;
  const weeklyVault = contracts.ArcadeEpochVaultWeekly;

  const dailyAllowed = await treasury.payoutVault(dailyVault);
  const weeklyAllowed = await treasury.payoutVault(weeklyVault);

  console.log(`Daily vault (${dailyVault}) allowed: ${dailyAllowed}`);
  console.log(`Weekly vault (${weeklyVault}) allowed: ${weeklyAllowed}`);

  if (!dailyAllowed) {
    console.log(`[config] Enabling daily payout vault...`);
    const tx = await treasury.setPayoutVault(dailyVault, true, { gasPrice });
    await tx.wait();
    console.log(`[config] Daily vault enabled`);
  }

  if (!weeklyAllowed) {
    console.log(`[config] Enabling weekly payout vault...`);
    const tx = await treasury.setPayoutVault(weeklyVault, true, { gasPrice });
    await tx.wait();
    console.log(`[config] Weekly vault enabled`);
  }

  console.log("\n=== Post-deployment wiring complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
