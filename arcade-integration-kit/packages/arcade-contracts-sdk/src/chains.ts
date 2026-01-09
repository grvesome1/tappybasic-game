// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

export type ChainSlug = "lineaSepolia" | "lineaMainnet";

export type ChainRef = {
  chainId: number;
  slug: ChainSlug;
  networkName: string;
  rpcUrlKeyName: string;
  explorerBaseUrl: string;
  explorerApiUrl: string;
};

export const CHAINS: Record<ChainSlug, ChainRef> = {
  lineaSepolia: {
    chainId: 59141,
    slug: "lineaSepolia",
    networkName: "lineaSepolia",
    rpcUrlKeyName: "LINEA_SEPOLIA_RPC_URL",
    explorerBaseUrl: "https://sepolia.lineascan.build",
    explorerApiUrl: "https://api-sepolia.lineascan.build/api"
  },
  lineaMainnet: {
    chainId: 59144,
    slug: "lineaMainnet",
    networkName: "linea",
    rpcUrlKeyName: "LINEA_RPC_URL",
    explorerBaseUrl: "https://lineascan.build",
    explorerApiUrl: "https://api.lineascan.build/api"
  }
};

export function getChainRef(chainId: number): ChainRef {
  const ref = Object.values(CHAINS).find((c) => c.chainId === chainId);
  if (!ref) throw new Error(`Unsupported chainId=${chainId}`);
  return ref;
}

export function getDefaultManifestPath(chainId: number): string {
  const ref = getChainRef(chainId);
  return `deployments/arcade.${ref.slug}.json`;
}
