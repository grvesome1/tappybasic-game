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

  const deploymentsFile = getDeploymentPath(networkName);
  const deployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  const contracts = deployments.contracts || deployments._legacy?.contracts;
  if (!contracts?.ArcadePaymentsRouterV2) throw new Error(`Missing contracts.ArcadePaymentsRouterV2 in ${deploymentsFile}`);

  const router = await ethers.getContractAt("ArcadePaymentsRouterV2", contracts.ArcadePaymentsRouterV2);
  const tokens: string[] = await router.getTokenList();

  const erc20 = [] as Array<{ address: string; allowed: boolean; symbol: string; name: string; decimals: number }>;

  for (const token of tokens) {
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
      allowed,
      symbol: String(symbol || ""),
      name: String(name || ""),
      decimals: Number(decimals)
    });
  }

  const out = {
    network: networkName,
    chainId: Number(net.chainId),
    router: contracts.ArcadePaymentsRouterV2,
    native: { address: ethers.ZeroAddress, symbol: "ETH", note: "Native gas token" },
    erc20
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
