// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import { Wallet, TypedDataEncoder, verifyTypedData } from "ethers";
import { EIP712_QUOTE_VECTORS } from "./vectors/eip712QuoteVectors.ts";

const QUOTE_TYPES: Record<string, Array<{ name: string; type: string }>> = {
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

function assertEqual(label: string, a: string, b: string) {
  if (a !== b) {
    throw new Error(`${label} mismatch\nexpected: ${b}\nactual:   ${a}`);
  }
}

async function main() {
  // Optional: if the SDK build output exists, validate against it too (packaging/runtime check).
  // This repo is often shipped without dist/ (clean handoff), so dist is best-effort.
  let sdkDist: null | {
    hashQuote: (params: { manifest: any; quote: any }) => string;
    verifyQuoteSignature: (params: {
      manifest: any;
      quote: any;
      signature: string;
      expectedSigner: string;
    }) => boolean;
  } = null;

  try {
    const distSpecifier = "../packages/arcade-contracts-sdk/dist/eip712/quote.js";
    sdkDist = (await import(distSpecifier)) as any;
  } catch {
    sdkDist = null;
  }

  for (const v of EIP712_QUOTE_VECTORS) {
    // Validate digest against raw ethers encoder.
    const domain = v.manifest.eip712?.quote?.domain;
    if (!domain) throw new Error(`[${v.name}] manifest missing eip712.quote.domain`);

    const digest = TypedDataEncoder.hash(domain, QUOTE_TYPES, v.quote);
    assertEqual(`[${v.name}] digest`, digest, v.expectedDigest);

    if (sdkDist?.hashQuote) {
      const digestSdk = sdkDist.hashQuote({ manifest: v.manifest, quote: v.quote });
      assertEqual(`[${v.name}] digest(sdk)`, digestSdk, v.expectedDigest);
    }

    const wallet = new Wallet(v.signerPrivateKey);
    const sig = await wallet.signTypedData(domain, QUOTE_TYPES, v.quote);
    assertEqual(`[${v.name}] signature`, sig, v.expectedSignature);

    if (wallet.address.toLowerCase() !== v.expectedSigner.toLowerCase()) {
      throw new Error(`[${v.name}] signer mismatch expected=${v.expectedSigner} actual=${wallet.address}`);
    }

    const recovered = verifyTypedData(domain, QUOTE_TYPES, v.quote, v.expectedSignature);
    if (recovered.toLowerCase() !== v.expectedSigner.toLowerCase()) {
      throw new Error(`[${v.name}] verifyTypedData failed expected=${v.expectedSigner} actual=${recovered}`);
    }

    if (sdkDist?.verifyQuoteSignature) {
      const ok = sdkDist.verifyQuoteSignature({
        manifest: v.manifest,
        quote: v.quote,
        signature: v.expectedSignature,
        expectedSigner: v.expectedSigner
      });
      if (!ok) throw new Error(`[${v.name}] verifyQuoteSignature(sdk) failed`);
    }

    console.log(`[eip712:vectors] ok ${v.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
