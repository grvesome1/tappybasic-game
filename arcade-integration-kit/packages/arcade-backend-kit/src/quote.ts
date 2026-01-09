// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import { AbiCoder, ZeroHash, encodeBytes32String, isHexString, keccak256, toUtf8Bytes } from "ethers";
import type { Wallet } from "ethers";
import type { DeploymentManifestV1, Quote, QuoteTypedDataDomain, QuoteTypes } from "@arcade/contracts-sdk";
import { QUOTE_TYPES, buildQuoteDomain, hashQuote } from "@arcade/contracts-sdk";

export type SkuDefinition =
  | {
      sku: string;
      kind: 1;
      usdCents: number;
      credits: number;
    }
  | {
      sku: string;
      kind: 2 | 3;
      usdCents: number;
      tier: 1 | 2 | 3;
    }
  | {
      sku: string;
      kind: number;
      usdCents: number;
    };

export type ProPayload = {
  tokenURI: string;
  dnaHash: string;
  nickname: string;
};

function coerceQuoteTypes(fields: Array<{ name: string; type: string }> | undefined): QuoteTypes {
  if (!fields || fields.length === 0) return QUOTE_TYPES;
  return { Quote: fields.map((f) => ({ name: f.name, type: f.type })) };
}

export function encodeSkuBytes32(sku: string): string {
  const s = sku.trim();
  if (isHexString(s, 32)) return s;
  // bytes32 string encoding: right-padded with zeros
  // NOTE: will throw if the string is too long (>31 bytes)
  return encodeBytes32String(s);
}

export function encodeRefBytes32(ref: string | undefined | null): string {
  if (!ref) return ZeroHash;
  const s = String(ref).trim();
  if (!s) return ZeroHash;
  if (isHexString(s, 32)) return s;
  return keccak256(toUtf8Bytes(s));
}

export function computeProDataHash(payload: ProPayload): string {
  const coder = AbiCoder.defaultAbiCoder();
  const data = coder.encode(["string", "bytes32", "string"], [payload.tokenURI, payload.dnaHash, payload.nickname]);
  return keccak256(data);
}

export function buildQuote(params: {
  buyer: string;
  sku: string;
  kind: number;
  payToken: string;
  amountIn: bigint;
  usdCents: number;
  credits?: number;
  tier?: number;
  expiresAt: number;
  nonce: bigint;
  ref?: string | null;
  dataHash?: string | null;
}): Quote {
  return {
    buyer: params.buyer,
    sku: encodeSkuBytes32(params.sku),
    kind: params.kind,
    payToken: params.payToken,
    amountIn: params.amountIn.toString(),
    usdCents: params.usdCents.toString(),
    credits: (params.credits ?? 0).toString(),
    tier: Number(params.tier ?? 0),
    expiresAt: Number(params.expiresAt),
    nonce: params.nonce.toString(),
    ref: encodeRefBytes32(params.ref),
    dataHash: params.dataHash ? String(params.dataHash) : ZeroHash
  };
}

export async function signQuote(params: {
  manifest: DeploymentManifestV1;
  quote: Quote;
  wallet: Wallet;
}): Promise<{ domain: QuoteTypedDataDomain; types: QuoteTypes; digest: string; signature: string }> {
  const domain = buildQuoteDomain(params.manifest);
  const types = coerceQuoteTypes(params.manifest.eip712?.quote?.fields);

  const digest = hashQuote({ manifest: params.manifest, quote: params.quote });
  const signature = await params.wallet.signTypedData(domain, types, params.quote);

  return { domain, types, digest, signature };
}

export function buildQuoteFromSku(params: {
  sku: SkuDefinition;
  buyer: string;
  payToken: string;
  amountIn: bigint;
  expiresAt: number;
  nonce: bigint;
  ref?: string | null;
  proPayload?: ProPayload;
}): Quote {
  const dataHash =
    params.sku.kind === 2 && params.proPayload
      ? computeProDataHash(params.proPayload)
      : params.sku.kind === 2
        ? ZeroHash
        : ZeroHash;

  return buildQuote({
    buyer: params.buyer,
    sku: params.sku.sku,
    kind: params.sku.kind,
    payToken: params.payToken,
    amountIn: params.amountIn,
    usdCents: params.sku.usdCents,
    credits: (params.sku as any).credits ?? 0,
    tier: (params.sku as any).tier ?? 0,
    expiresAt: params.expiresAt,
    nonce: params.nonce,
    ref: params.ref,
    dataHash
  });
}
