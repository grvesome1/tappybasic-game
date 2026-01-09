# EIP-712 Quote Types (copy/paste)

These definitions match `ArcadePaymentsRouterV2.sol`.

---

## Domain

```js
const domain = {
  name: "GruesomeArcade PaymentsRouter",
  version: "2.4",
  chainId,                // number
  verifyingContract,      // router address
};
```

---

## Types

```js
const types = {
  Quote: [
    { name: "buyer", type: "address" },
    { name: "sku", type: "bytes32" },
    { name: "kind", type: "uint8" },
    { name: "payToken", type: "address" },  // address(0) for native ETH
    { name: "amountIn", type: "uint256" },
    { name: "usdCents", type: "uint256" },
    { name: "credits", type: "uint256" },   // only for KIND_CREDITS, else 0
    { name: "tier", type: "uint8" },        // only for PRO kinds, else 0
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "ref", type: "bytes32" },
    { name: "dataHash", type: "bytes32" }, // keccak256(extra data payload). For PRO mint: keccak256(abi.encode(tokenURI,dnaHash,nickname))
  ],
};
```

---

## Message Example

```js
const message = {
  buyer: "0xBuyer...",
  sku: ethers.encodeBytes32String("AC_1000"),
  kind: 1, // KIND_CREDITS
  payToken: "0xmUSD...",
  amountIn: "10000000", // token units (e.g., 10 mUSD with 6 decimals)
  usdCents: "1000",
  credits: "1050",
  tier: 0,
  expiresAt: Math.floor(Date.now() / 1000) + 60,
  nonce: "123456789",
  ref: ethers.keccak256(ethers.toUtf8Bytes("campaign:launch")),
  dataHash: ethers.ZeroHash,
};
```

---

## Signing (ethers v6)

```js
const signature = await quoteSigner.signTypedData(domain, types, message);
// send {message, signature} to client
```

---

## Verifying (client-side optional)

Client-side verification is optional (router will enforce on-chain), but helpful for debugging.

```js
const recovered = ethers.verifyTypedData(domain, types, message, signature);
```
