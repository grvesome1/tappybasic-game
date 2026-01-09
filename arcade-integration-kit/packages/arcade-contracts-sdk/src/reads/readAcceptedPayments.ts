// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import { Contract, Interface, type Provider } from "ethers";
import type { DeploymentManifestV1 } from "../manifest";

const ERC20_METADATA_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

export type AcceptedPayment =
  | { kind: "native"; symbol: "ETH"; address: null; decimals: 18; label: string }
  | { kind: "erc20"; symbol: string | null; address: string; decimals: number | null; label: string | null };

export type AcceptedPaymentsResult = {
  chainId: number;
  router: string;
  payments: AcceptedPayment[];
};

async function safeSymbol(token: Contract): Promise<string | null> {
  try {
    const v = await token.symbol();
    if (typeof v === "string" && v.trim()) return v.trim();
    return null;
  } catch {
    return null;
  }
}

async function safeDecimals(token: Contract): Promise<number | null> {
  try {
    const v = await token.decimals();
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function readAcceptedPayments(params: {
  manifest: DeploymentManifestV1;
  provider: Provider;
}): Promise<AcceptedPaymentsResult> {
  const { manifest, provider } = params;

  const routerAddr = manifest.contracts.ArcadePaymentsRouterV2;
  // Minimal router ABI for allowlist reads.
  const router = new Contract(
    routerAddr,
    new Interface(["function getTokenList() view returns (address[])", "function tokenAllowed(address) view returns (bool)"]),
    provider
  );

  const tokenList: string[] = await router.getTokenList();
  const allowed: string[] = [];

  for (const t of tokenList) {
    const isAllowed: boolean = await router.tokenAllowed(t);
    if (isAllowed) allowed.push(t);
  }

  const payments: AcceptedPayment[] = [
    { kind: "native", symbol: "ETH", address: null, decimals: 18, label: "Native ETH" }
  ];

  for (const tokenAddr of allowed) {
    const token = new Contract(tokenAddr, new Interface(ERC20_METADATA_ABI), provider);
    const [symbol, decimals] = await Promise.all([safeSymbol(token), safeDecimals(token)]);

    payments.push({
      kind: "erc20",
      symbol,
      decimals,
      address: tokenAddr,
      label: symbol ? symbol : null
    });
  }

  return { chainId: manifest.network.chainId, router: routerAddr, payments };
}
