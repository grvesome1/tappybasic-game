// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Dist = { ymd: number; root: string; totalAmount: string };

const EPOCH_TYPES = {
  Epoch: [
    { name: "ymd", type: "uint32" },
    { name: "root", type: "bytes32" },
    { name: "totalAmount", type: "uint256" }
  ]
} as const;

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

  const deploymentsFile = getDeploymentPath(networkName);
  const deployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));

  const contracts = deployments.contracts || deployments._legacy?.contracts;
  if (!contracts) throw new Error(`Deployment file missing contracts: ${deploymentsFile}`);

  const epochVaultAddress: string =
    kind === "weekly" ? contracts.ArcadeEpochVaultWeekly : contracts.ArcadeEpochVaultDaily;

  const distPath = (process.env.EPOCH_DISTRIBUTION_JSON || process.argv[2] || "").trim();
  if (!distPath) throw new Error("Provide EPOCH_DISTRIBUTION_JSON or pass a file path arg");

  const dist = JSON.parse(fs.readFileSync(distPath, "utf8")) as Dist;
  if (!dist.ymd || !dist.root || !dist.totalAmount) throw new Error("Bad distribution JSON; expected {ymd, root, totalAmount}");

  const oraclePk = (process.env.ORACLE_PRIVATE_KEY || "").trim();
  let signer: any;
  if (oraclePk) {
    signer = new ethers.Wallet(oraclePk, ethers.provider);
  } else {
    const [deployer] = await ethers.getSigners();
    signer = deployer;
  }

  const domain = {
    name: "GruesomeArcadeEpochVault",
    version: "1",
    chainId: Number(net.chainId),
    verifyingContract: epochVaultAddress
  };

  const value = {
    ymd: dist.ymd,
    root: dist.root,
    totalAmount: dist.totalAmount
  };

  const signature = await signer.signTypedData(domain, EPOCH_TYPES, value);

  const vault = await ethers.getContractAt("ArcadeEpochVault", epochVaultAddress);
  const tx = await vault.publishEpoch(dist.ymd, dist.root, dist.totalAmount, signature);
  const rcpt = await tx.wait();

  console.log(`[epoch] kind=${kind}`);
  console.log(`[epoch] vault=${epochVaultAddress}`);
  console.log(`[epoch] ymd=${dist.ymd} root=${dist.root} totalAmount=${dist.totalAmount}`);
  console.log(`[epoch] tx=${rcpt?.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
