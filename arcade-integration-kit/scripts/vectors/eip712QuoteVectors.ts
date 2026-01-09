// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import type { DeploymentManifestV1 } from "../../packages/arcade-contracts-sdk/src/manifest.js";
import type { Quote } from "../../packages/arcade-contracts-sdk/src/eip712/quote.js";

export type Eip712QuoteVector = {
  name: string;
  signerPrivateKey: string;
  expectedSigner: string;
  manifest: DeploymentManifestV1;
  quote: Quote;
  expectedDigest: string;
  expectedSignature: string;
};

const DOMAIN = {
  name: "GruesomeArcade PaymentsRouter",
  version: "2.4",
  chainId: 59141,
  verifyingContract: "0x1111111111111111111111111111111111111111"
};

const FIELDS = [
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
];

function makeManifest(): DeploymentManifestV1 {
  return {
    kitVersion: "2.4.1",
    manifestVersion: 1,
    network: {
      name: "lineaSepolia",
      chainId: DOMAIN.chainId,
      rpcUrlKeyName: "LINEA_SEPOLIA_RPC_URL",
      explorerBaseUrl: null,
      explorerApiUrl: null
    },
    deployedAt: "1970-01-01T00:00:00.000Z",
    gitCommit: null,
    deployerAddress: "0x0000000000000000000000000000000000000000",
    contracts: {
      ArcadePaymentsRouterV2: DOMAIN.verifyingContract,
      ArcadeTreasuryVault: "0x0000000000000000000000000000000000000000",
      ArcadeEpochVaultDaily: "0x0000000000000000000000000000000000000000",
      ArcadeEpochVaultWeekly: "0x0000000000000000000000000000000000000000",
      ArcadeProAvatarV2: "0x0000000000000000000000000000000000000000",
      ArcadePromo: "0x0000000000000000000000000000000000000000"
    },
    eip712: {
      quote: {
        domain: DOMAIN,
        fields: FIELDS
      }
    }
  };
}

// Hardhat default account #1 private key (deterministic, safe for test vectors only)
const PK_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

export const EIP712_QUOTE_VECTORS: Eip712QuoteVector[] = [
  {
    name: "vector-1.kind-1.native",
    signerPrivateKey: PK_1,
    expectedSigner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    manifest: makeManifest(),
    quote: {
      buyer: "0x2222222222222222222222222222222222222222",
      sku: `0x${"11".repeat(32)}`,
      kind: 1,
      payToken: "0x0000000000000000000000000000000000000000",
      amountIn: "123",
      usdCents: "499",
      credits: "5000",
      tier: 0,
      expiresAt: 1700000000,
      nonce: "1",
      ref: `0x${"22".repeat(32)}`,
      dataHash: `0x${"00".repeat(32)}`
    },
    expectedDigest: "0xcbbcbb5db2d623c8ad012ed60664a74cea5ebee167b9139ade7f179923fc845f",
    expectedSignature:
      "0xf5445b2dd8ab4413ec6f0abbb434861484bd9aa188af09a6282379b04cd9dabb10683fa7867109af00bc4aac117467b65b4245bf068008557135ab74f4fa5b191b"
  },
  {
    name: "vector-2.kind-2.erc20",
    signerPrivateKey: PK_1,
    expectedSigner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    manifest: makeManifest(),
    quote: {
      buyer: "0x3333333333333333333333333333333333333333",
      sku: `0x${"33".repeat(32)}`,
      kind: 2,
      payToken: "0x4444444444444444444444444444444444444444",
      amountIn: "999999",
      usdCents: "1299",
      credits: "0",
      tier: 2,
      expiresAt: 1700001234,
      nonce: "42",
      ref: `0x${"44".repeat(32)}`,
      dataHash: `0x${"55".repeat(32)}`
    },
    expectedDigest: "0x129ee8917a6ca7b4beb9c1fc560238a0b61f4f68b7817def9aabab0f3ef22eca",
    expectedSignature:
      "0x894c2dfe95b593797358a288cfaed12411b9e7b98313a4c8b12f2d1a8198792847c1d64ebd018fb551d3aa7292137d5ef6e08dc9bd8ef89a145de6d45f28b08f1c"
  }
];
