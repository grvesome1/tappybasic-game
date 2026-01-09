// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import fs from "fs";
import path from "path";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import { ethers } from "ethers";

type Payout = { account: string; amount: string };

type InputShape = {
  ymd: number;
  payouts: Payout[];
};

async function main() {
  const inputPath = (process.env.PAYOUTS_JSON_PATH || process.argv[2] || "").trim();
  if (!inputPath) {
    throw new Error(
      "Provide PAYOUTS_JSON_PATH or pass a file path as arg.\n" +
        "Input JSON format: { \"ymd\": 20260107, \"payouts\": [{\"account\":\"0x..\",\"amount\":\"123\"}] }"
    );
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8")) as InputShape;
  if (!raw.ymd || !Number.isInteger(raw.ymd)) throw new Error("ymd must be an integer like 20260107");
  if (!Array.isArray(raw.payouts) || raw.payouts.length === 0) throw new Error("payouts must be a non-empty array");

  // Deterministic ordering: keep input order, index = array position.
  const leaves: Buffer[] = [];
  let totalAmount = 0n;

  for (let i = 0; i < raw.payouts.length; i++) {
    const p = raw.payouts[i];
    if (!ethers.isAddress(p.account)) throw new Error(`Bad address at index ${i}: ${p.account}`);
    const amt = BigInt(p.amount);
    if (amt <= 0n) throw new Error(`Amount must be > 0 at index ${i}`);

    totalAmount += amt;

    // Leaf matches Solidity: keccak256(abi.encodePacked(index, account, amount))
    const packed = ethers.solidityPacked(["uint256", "address", "uint256"], [BigInt(i), p.account, amt]);
    const leaf = keccak256(packed);
    leaves.push(leaf);
  }

  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = tree.getHexRoot();

  const entries = raw.payouts.map((p, i) => {
    const packed = ethers.solidityPacked(["uint256", "address", "uint256"], [BigInt(i), p.account, BigInt(p.amount)]);
    const leaf = keccak256(packed);
    return {
      index: i,
      account: p.account,
      amount: p.amount,
      proof: tree.getHexProof(leaf)
    };
  });

  const out = {
    ymd: raw.ymd,
    root,
    totalAmount: totalAmount.toString(),
    payouts: entries
  };

  const outPath = (process.env.OUT_JSON_PATH || "").trim() || path.join(path.dirname(inputPath), `epoch_${raw.ymd}_merkle.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(`[merkle] ymd=${raw.ymd}`);
  console.log(`[merkle] root=${root}`);
  console.log(`[merkle] totalAmount=${totalAmount.toString()}`);
  console.log(`[merkle] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
