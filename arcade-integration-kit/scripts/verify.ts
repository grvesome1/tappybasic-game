// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDeploymentPath(networkName: string): string {
  const base = path.join(__dirname, "..", "deployments");
  const preferred =
    networkName === "lineaSepolia"
      ? path.join(base, "arcade.lineaSepolia.json")
      : networkName === "linea"
        ? path.join(base, "arcade.lineaMainnet.json")
        : "";

  if (preferred !== "" && fs.existsSync(preferred)) return preferred;

  const legacy = path.join(base, `${networkName}.json`);
  if (fs.existsSync(legacy)) return legacy;

  throw new Error(`Missing deployment file. Expected ${preferred || "(no preferred path for this network)"} or ${legacy}. Run deploy first.`);
}

async function verifyOne(name: string, address: string, constructorArgs: any[]) {
  try {
    await hre.tasks.getTask("verify").run({ address, constructorArgs });
    console.log(`[verify] ok: ${name} @ ${address}`);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("already verified")) {
      console.log(`[verify] already verified: ${name} @ ${address}`);
      return;
    }
    console.error(`[verify] FAILED: ${name} @ ${address}`);
    console.error(msg);
  }
}

async function main() {
  const connection = await hre.network.connect();
  const networkName = connection.networkName;

  const deployFile = getDeploymentPath(networkName);
  const d = JSON.parse(fs.readFileSync(deployFile, "utf8"));

  const c = d.contracts || d._legacy?.contracts;
  const args = d.constructorArgs || d._legacy?.constructorArgs;
  if (!c || !args) throw new Error(`Deployment file missing contracts/constructorArgs: ${deployFile}`);

  await verifyOne("ArcadeTreasuryVault", c.ArcadeTreasuryVault, args.ArcadeTreasuryVault);
  await verifyOne("ArcadeEpochVaultDaily", c.ArcadeEpochVaultDaily, args.ArcadeEpochVaultDaily);
  await verifyOne("ArcadeEpochVaultWeekly", c.ArcadeEpochVaultWeekly, args.ArcadeEpochVaultWeekly);
  await verifyOne("ArcadePromo", c.ArcadePromo, args.ArcadePromo);
  await verifyOne("ArcadeProAvatarV2", c.ArcadeProAvatarV2, args.ArcadeProAvatarV2);
  await verifyOne("ArcadePaymentsRouterV2", c.ArcadePaymentsRouterV2, args.ArcadePaymentsRouterV2);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
