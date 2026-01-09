// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet, TypedDataEncoder, verifyTypedData, id } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function bytes32From(value) {
  if (typeof value === "string" && value.startsWith("0x") && value.length === 66) return value;
  return id(String(value));
}

function buildTypesFromManifest(manifest) {
  const fields = manifest?.eip712?.quote?.fields;
  if (Array.isArray(fields) && fields.length > 0) return { Quote: fields };
  return {
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
}

async function main() {
  const manifestPath = path.join(__dirname, "..", "deployments", "latest.json");
  const manifest = readJson(manifestPath);
  const domain = manifest?.eip712?.quote?.domain;
  if (!domain) throw new Error("smoke failed: manifest missing eip712.quote.domain");
  const types = buildTypesFromManifest(manifest);

  const pk = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const wallet = new Wallet(pk);

  const quote = {
    buyer: "0x2222222222222222222222222222222222222222",
    sku: bytes32From("smoke-test-sku"),
    kind: 1,
    payToken: "0x0000000000000000000000000000000000000000",
    amountIn: 123n,
    usdCents: 499,
    credits: 5000,
    tier: 0,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    nonce: 1n,
    ref: bytes32From("smoke"),
    dataHash: `0x${"00".repeat(32)}`
  };

  const digest = TypedDataEncoder.hash(domain, types, quote);
  const signature = await wallet.signTypedData(domain, types, quote);

  const recovered = verifyTypedData(domain, types, quote, signature);
  const ok = recovered.toLowerCase() === wallet.address.toLowerCase();

  if (!ok) {
    throw new Error(`smoke failed: verifyTypedData mismatch (recovered=${recovered}, digest=${digest})`);
  }

  console.log(`[smoke] ok manifest=${manifestPath}`);
  console.log(`[smoke] signer=${wallet.address}`);
  console.log(`[smoke] digest=${digest}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
