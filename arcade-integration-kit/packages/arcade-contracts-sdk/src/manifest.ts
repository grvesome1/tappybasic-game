// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import fs from "fs";

export type QuoteField = { name: string; type: string };

export type DeploymentManifestV1 = {
  kitVersion: string;
  manifestVersion: 1;
  network: {
    name: string;
    chainId: number;
    rpcUrlKeyName: string;
    explorerBaseUrl?: string | null;
    explorerApiUrl?: string | null;
  };
  deployedAt: string;
  gitCommit?: string | null;
  deployerAddress: string;
  roles?: {
    multisig?: string | null;
    finalAdmin?: string;
    opsWallet?: string;
    quoteSigner?: string;
    oracleSigner?: string;
    treasuryKeeper?: string;
  };
  tokens?: Record<string, string | null>;
  dex?: Record<string, string | null>;
  eip712?: {
    quote?: {
      domain?: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: string;
      };
      typeHash?: string | null;
      fields?: QuoteField[];
    };
  };
  acceptedPayments?: {
    native?: boolean;
    erc20?: Array<{ address: string; symbol?: string | null; decimals?: number | null; label?: string | null }>;
  };
  contracts: Record<string, string>;
  constructorArgs?: Record<string, unknown>;
  _legacy?: unknown;
};

export function readManifestFromFile(filePath: string): DeploymentManifestV1 {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);

  if (!data || typeof data !== "object") throw new Error("Invalid manifest: not an object");
  if (data.manifestVersion !== 1) throw new Error(`Unsupported manifestVersion=${String((data as any).manifestVersion)}`);
  if (!data.network?.chainId) throw new Error("Invalid manifest: missing network.chainId");
  if (!data.contracts?.ArcadePaymentsRouterV2) throw new Error("Invalid manifest: missing contracts.ArcadePaymentsRouterV2");

  return data as DeploymentManifestV1;
}
