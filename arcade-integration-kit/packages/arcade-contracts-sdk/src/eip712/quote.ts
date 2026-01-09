// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import { TypedDataEncoder, verifyTypedData } from "ethers";
import type { DeploymentManifestV1, QuoteField } from "../manifest";

export type QuoteTypes = {
  Quote: Array<{ name: string; type: string }>;
};

export type QuoteTypedDataDomain = {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
};

export type Quote = {
  buyer: string;
  sku: string;
  kind: number;
  payToken: string;
  amountIn: string;
  usdCents: string | number;
  credits: string | number;
  tier: number;
  expiresAt: number;
  nonce: string | number;
  ref: string;
  dataHash: string;
};

export const QUOTE_TYPES: QuoteTypes = {
  Quote: [
    { name: "buyer", type: "address" },
    { name: "sku", type: "bytes32" },
    { name: "kind", type: "uint8" },
    { name: "payToken", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "usdCents", type: "uint256" },
    { name: "credits", type: "uint256" },
    { name: "tier", type: "uint8" },
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "ref", type: "bytes32" },
    { name: "dataHash", type: "bytes32" }
  ]
};

function coerceFields(fields: QuoteField[] | undefined): QuoteTypes {
  if (!fields || fields.length === 0) return QUOTE_TYPES;
  return { Quote: fields.map((f) => ({ name: f.name, type: f.type })) };
}

export function buildQuoteDomain(manifest: DeploymentManifestV1): QuoteTypedDataDomain {
  const domain = manifest.eip712?.quote?.domain;
  if (domain?.name && domain?.version && domain?.chainId && domain?.verifyingContract) {
    return domain;
  }

  // Fallback: best-effort.
  return {
    name: "GruesomeArcade PaymentsRouter",
    version: "2.4",
    chainId: manifest.network.chainId,
    verifyingContract: manifest.contracts.ArcadePaymentsRouterV2
  };
}

export function hashQuote(params: { manifest: DeploymentManifestV1; quote: Quote }): string {
  const domain = buildQuoteDomain(params.manifest);
  const types = coerceFields(params.manifest.eip712?.quote?.fields);
  return TypedDataEncoder.hash(domain, types, params.quote);
}

export function verifyQuoteSignature(params: {
  manifest: DeploymentManifestV1;
  quote: Quote;
  signature: string;
  expectedSigner: string;
}): boolean {
  const domain = buildQuoteDomain(params.manifest);
  const types = coerceFields(params.manifest.eip712?.quote?.fields);
  const recovered = verifyTypedData(domain, types, params.quote, params.signature);
  return recovered.toLowerCase() === params.expectedSigner.toLowerCase();
}
