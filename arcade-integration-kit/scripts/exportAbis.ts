// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTRACTS = [
  "ArcadePaymentsRouterV2",
  "ArcadeTreasuryVault",
  "ArcadeEpochVault",
  "ArcadeProAvatarV2",
  "ArcadePromo",
  "MockERC20"
] as const;

function readArtifactAbi(contractName: string): unknown {
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts");

  // Try to find the artifact JSON by walking typical Hardhat layout:
  // artifacts/contracts/<File>.sol/<Contract>.json
  const candidates = [
    path.join(artifactPath, `${contractName}.sol`, `${contractName}.json`),
    // Known file names in this repo
    path.join(artifactPath, "ArcadePaymentsRouterV2.sol", `${contractName}.json`),
    path.join(artifactPath, "ArcadeTreasuryVault.sol", `${contractName}.json`),
    path.join(artifactPath, "ArcadeEpochVault.sol", `${contractName}.json`),
    path.join(artifactPath, "ArcadeProAvatarV2.sol", `${contractName}.json`),
    path.join(artifactPath, "ArcadePromo.sol", `${contractName}.json`),
    path.join(artifactPath, "MockERC20.sol", `${contractName}.json`)
  ];

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`ABI artifact not found for ${contractName}. Run \"npm run compile\" first.`);
  }

  const artifact = JSON.parse(fs.readFileSync(found, "utf8"));
  if (!artifact?.abi) throw new Error(`Artifact missing abi: ${found}`);
  return artifact.abi;
}

function main() {
  const outDir = path.join(__dirname, "..", "packages", "arcade-contracts-sdk", "src", "generated", "abi");
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of CONTRACTS) {
    const abi = readArtifactAbi(name);
    const outPath = path.join(outDir, `${name}.abi.json`);
    fs.writeFileSync(outPath, JSON.stringify(abi, null, 2));
    console.log(`[abis] wrote ${outPath}`);
  }
}

main();
