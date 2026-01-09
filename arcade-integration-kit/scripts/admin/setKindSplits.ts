// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function usage() {
  console.log(
    "Usage:\n" +
      "  hardhat run scripts/admin/setKindSplits.ts --network lineaSepolia -- <kind> <opsBps> <dailyBps> <weeklyBps> <treasuryBps>\n" +
      "Example (KIND_CREDITS):\n" +
      "  ... 1 700 7055 1245 1000\n"
  );
}

async function main() {
  const connection = await hre.network.connect();
  const ethers = connection.ethers;
  const networkName = connection.networkName;

  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (args.length < 5) {
    usage();
    process.exitCode = 1;
    return;
  }

  const kind = Number(args[0]);
  const opsBps = Number(args[1]);
  const dailyBps = Number(args[2]);
  const weeklyBps = Number(args[3]);
  const treasuryBps = Number(args[4]);

  const deploymentsFile = getDeploymentPath(networkName);
  const deployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  const contracts = deployments.contracts || deployments._legacy?.contracts;
  if (!contracts) throw new Error(`Deployment file missing contracts: ${deploymentsFile}`);
  const routerAddress = contracts.ArcadePaymentsRouterV2 as string;

  const router = await ethers.getContractAt("ArcadePaymentsRouterV2", routerAddress);
  const tx = await router.setKindSplits(kind, {
    opsBps,
    dailyBps,
    weeklyBps,
    treasuryBps
  });
  const rcpt = await tx.wait();

  console.log(`[splits] router=${routerAddress}`);
  console.log(`[splits] kind=${kind} ops=${opsBps} daily=${dailyBps} weekly=${weeklyBps} treasury=${treasuryBps}`);
  console.log(`[splits] tx=${rcpt?.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
