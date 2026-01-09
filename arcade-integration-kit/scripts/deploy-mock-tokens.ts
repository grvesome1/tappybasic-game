// Deploy mock TBAG and RUSTYAI tokens for testnet
import hre from "hardhat";
import { ethers as ethersLib, ContractFactory } from "ethers";
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
  if (accounts.length === 0) throw new Error("No accounts found");

  const provider = new ethersLib.JsonRpcProvider(rpcUrl);

  // Get current gas price and add buffer for Linea
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ? feeData.gasPrice * 2n : ethersLib.parseUnits("1", "gwei");

  const signers = accounts.map((pk) => new ethersLib.Wallet(pk, provider));

  return {
    provider,
    gasPrice,
    getSigners: async () => signers,
    getContractFactory: async (name: string) => {
      const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`);
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
      return new ContractFactory(artifact.abi, artifact.bytecode, signers[0]);
    },
    parseUnits: ethersLib.parseUnits,
  };
}

async function main() {
  const connection = await hre.network.connect();
  const ethers = await getEthersFromConnection(connection);
  const [deployer] = await ethers.getSigners();

  console.log(`Deploying mock tokens with deployer: ${deployer.address}`);
  console.log(`Using gas price: ${ethersLib.formatUnits(ethers.gasPrice, "gwei")} gwei`);

  const MockERC20 = await ethers.getContractFactory("MockERC20");

  // Deploy TBAG with explicit gas price
  const tbag = await MockERC20.deploy("Mock TBAG", "TBAG", { gasPrice: ethers.gasPrice });
  await tbag.waitForDeployment();
  const tbagAddr = await tbag.getAddress();
  console.log(`Mock TBAG deployed at: ${tbagAddr}`);

  // Mint 1M TBAG to deployer
  const mintTbagTx = await tbag.mint(deployer.address, ethers.parseUnits("1000000", 18), { gasPrice: ethers.gasPrice });
  await mintTbagTx.wait();
  console.log(`Minted 1,000,000 TBAG to ${deployer.address}`);

  // Deploy RUSTYAI with explicit gas price
  const rusty = await MockERC20.deploy("Mock RUSTYAI", "RUSTYAI", { gasPrice: ethers.gasPrice });
  await rusty.waitForDeployment();
  const rustyAddr = await rusty.getAddress();
  console.log(`Mock RUSTYAI deployed at: ${rustyAddr}`);

  // Mint 1M RUSTYAI to deployer
  const mintRustyTx = await rusty.mint(deployer.address, ethers.parseUnits("1000000", 18), { gasPrice: ethers.gasPrice });
  await mintRustyTx.wait();
  console.log(`Minted 1,000,000 RUSTYAI to ${deployer.address}`);

  console.log("\n=== Summary ===");
  console.log(`TBAG: ${tbagAddr}`);
  console.log(`RUSTYAI: ${rustyAddr}`);
  console.log("\nAdd these to your .env:");
  console.log(`TBAG_TOKEN_ADDRESS=${tbagAddr}`);
  console.log(`RUSTYAI_TOKEN_ADDRESS=${rustyAddr}`);
}

main().catch(console.error);
