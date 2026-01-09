// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import { JsonRpcProvider } from "ethers";

export function getClients(params: { chainId: number; rpcUrl: string }) {
  const { chainId, rpcUrl } = params;
  if (!rpcUrl) throw new Error("rpcUrl is required");

  const provider = new JsonRpcProvider(rpcUrl, chainId);
  return { provider };
}
