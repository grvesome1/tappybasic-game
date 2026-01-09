// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import hre from "hardhat";
import type { TypedDataField } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QUOTE_TYPES: Record<string, TypedDataField[]> = {
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
  const deployments = getDeploymentPath(networkName);
  const d = JSON.parse(fs.readFileSync(deployments, "utf8"));
  const router = (d.contracts || d._legacy?.contracts)?.ArcadePaymentsRouterV2 as string;
  if (!router) throw new Error(`Missing contracts.ArcadePaymentsRouterV2 in ${deployments}`);

  const pk = (process.env.QUOTE_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "").trim();
  if (!pk) throw new Error("Set QUOTE_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY for testing)");

  const quoteJson = (process.env.QUOTE_JSON || "").trim();
  const quotePath = (process.env.QUOTE_JSON_PATH || "").trim();

  let quote: any;
  if (quotePath) {
    quote = JSON.parse(fs.readFileSync(quotePath, "utf8"));
  } else if (quoteJson) {
    quote = JSON.parse(quoteJson);
  } else {
    throw new Error(`Provide a quote via QUOTE_JSON (inline JSON) or QUOTE_JSON_PATH (file path).
Example:
QUOTE_JSON='{"buyer":"0x...","sku":"0x...32bytes...","kind":1,"payToken":"0x...","amountIn":"1000000","usdCents":500,"credits":500,"tier":0,"expiresAt":1730000000,"nonce":1,"ref":"0x...32bytes..."}'`);
  }

  // Source of truth: deployed router contract constants.
  const Router = await ethers.getContractFactory("ArcadePaymentsRouterV2");
  const routerContract = Router.attach(router);
  const domainName: string = await routerContract.EIP712_NAME();
  const domainVersion: string = await routerContract.EIP712_VERSION();

  const domain = {
    name: domainName,
    version: domainVersion,
    chainId: Number(net.chainId),
    verifyingContract: router
  };

  // Ensure dataHash exists (required by router). For PRO mint, we can compute it from env.
  if (!quote.dataHash) {
    // Default: ZeroHash
    quote.dataHash = ethers.ZeroHash;
  }

  // If PRO mint and dataHash is zero, optionally compute from payload values.
  // Env option A: PRO_PAYLOAD_JSON='{"tokenURI":"ipfs://...","dnaHash":"0x..32bytes..","nickname":"grue"}'
  // Env option B: PRO_TOKEN_URI / PRO_DNA_HASH / PRO_NICKNAME
  if (Number(quote.kind) === 2 && (quote.dataHash === ethers.ZeroHash || quote.dataHash === "0x" + "0".repeat(64))) {
    const payloadJson = (process.env.PRO_PAYLOAD_JSON || "").trim();
    let tokenURI = (process.env.PRO_TOKEN_URI || "").trim();
    let dnaHash = (process.env.PRO_DNA_HASH || "").trim();
    let nickname = (process.env.PRO_NICKNAME || "").trim();

    if (payloadJson) {
      const p = JSON.parse(payloadJson);
      tokenURI = p.tokenURI;
      dnaHash = p.dnaHash;
      nickname = p.nickname;
    }

    if (tokenURI && dnaHash && nickname) {
      const coder = ethers.AbiCoder.defaultAbiCoder();
      const encoded = coder.encode(["string", "bytes32", "string"], [tokenURI, dnaHash, nickname]);
      quote.dataHash = ethers.keccak256(encoded);
      console.log(`[signQuote] computed quote.dataHash from PRO payload: ${quote.dataHash}`);
    } else {
      console.warn(
        "[signQuote] quote.kind==KIND_PRO_MINT but dataHash is zero and no PRO payload env vars were provided.\n" +
          "Set quote.dataHash in QUOTE_JSON or provide PRO_PAYLOAD_JSON / PRO_TOKEN_URI+PRO_DNA_HASH+PRO_NICKNAME."
      );
    }
  }

  const wallet = new ethers.Wallet(pk);
  const digest = ethers.TypedDataEncoder.hash(domain, QUOTE_TYPES, quote);
  const sig = await wallet.signTypedData(domain, QUOTE_TYPES, quote);

  console.log(
    JSON.stringify(
      {
        network: networkName,
        chainId: Number(net.chainId),
        verifyingContract: router,
        digest,
        signature: sig,
        quote
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
