// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)"
];

function getChainSlug(networkName: string): "lineaSepolia" | "lineaMainnet" {
  if (networkName === "lineaSepolia") return "lineaSepolia";
  if (networkName === "linea") return "lineaMainnet";
  throw new Error(`Unsupported network name=${networkName}. Expected lineaSepolia or linea.`);
}

function getDeploymentPath(networkName: string): string {
  const base = path.join(__dirname, "..", "deployments");
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

  const chainSlug = getChainSlug(networkName);
  const deploymentsFile = getDeploymentPath(networkName);
  const deployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));

  const manifest = deployments._legacy ? deployments : null;
  const legacy = deployments._legacy ?? deployments;

  const contracts = deployments.contracts || legacy.contracts;
  if (!contracts?.ArcadePaymentsRouterV2) throw new Error(`Missing contracts.ArcadePaymentsRouterV2 in ${deploymentsFile}`);

  const router = await ethers.getContractAt("ArcadePaymentsRouterV2", contracts.ArcadePaymentsRouterV2);
  const tokenList: string[] = await router.getTokenList();

  const erc20 = [] as Array<{ address: string; symbol: string; name: string; decimals: number }>;

  for (const token of tokenList) {
    const allowed: boolean = await router.tokenAllowed(token);
    if (!allowed) continue;

    const t = new ethers.Contract(token, ERC20_ABI, ethers.provider);
    const [symbol, name, decimals] = await Promise.all([
      t.symbol().catch(() => ""),
      t.name().catch(() => ""),
      t.decimals().catch(() => 18)
    ]);

    erc20.push({
      address: token,
      symbol: String(symbol || ""),
      name: String(name || ""),
      decimals: Number(decimals)
    });
  }

  const uiConfig = {
    kitVersion: legacy.packageVersion ?? deployments.kitVersion ?? null,
    generatedAt: new Date().toISOString(),
    network: {
      name: chainSlug,
      hardhatNetworkName: networkName,
      chainId: Number(net.chainId),
      explorerBaseUrl: manifest?.network?.explorerBaseUrl ?? deployments?.network?.explorerBaseUrl ?? null
    },
    contracts: {
      ArcadePaymentsRouterV2: contracts.ArcadePaymentsRouterV2,
      ArcadeTreasuryVault: contracts.ArcadeTreasuryVault,
      ArcadeEpochVaultDaily: contracts.ArcadeEpochVaultDaily,
      ArcadeEpochVaultWeekly: contracts.ArcadeEpochVaultWeekly,
      ArcadeProAvatarV2: contracts.ArcadeProAvatarV2,
      ArcadePromo: contracts.ArcadePromo
    },
    eip712: deployments?.eip712?.quote ?? null,
    acceptedPayments: {
      native: { address: ethers.ZeroAddress, symbol: "ETH", note: "Native gas token" },
      erc20
    }
  };

  const outDir = path.join(__dirname, "..", "deployments");
  const outPath = path.join(outDir, `ui-config.${chainSlug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(uiConfig, null, 2));

  console.log(`[ui-config] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
