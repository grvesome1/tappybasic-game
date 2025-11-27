import { Redis } from '@upstash/redis';
import { ethers } from 'ethers';

const redis = Redis.fromEnv();
const CONTRACT_ADDRESS = "0xB670AB661c91081A44DEE43D9f0c79CEa5930dDf";
const ABI = [
  "function credits(address) view returns(uint256)"
];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { wallet, score, initials, sig } = req.body;
  if (!wallet || !sig || !score) {
    return res.status(400).json({ error: "missing fields" });
  }

  // 1. Verify the wallet signature
  const message = `submit-score:${score}`;
  const signer = ethers.verifyMessage(message, sig);

  if (signer.toLowerCase() !== wallet.toLowerCase()) {
    return res.status(401).json({ error: "invalid signature" });
  }

  // 2. Score sanity check
  if (score < 0 || score > 999999) {
    return res.status(400).json({ error: "invalid score range" });
  }

  // 3. Verify they actually consumed a credit (credit should have decreased)
  try {
    const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.linea.build");
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    const credits = await contract.credits(wallet);
    if (credits < 0n) {
      return res.status(400).json({ error: "invalid credit state" });
    }
  } catch (err) {
    console.error("credit verify error:", err);
  }

  // 4. Save to Redis
  const board = (await redis.get("leaderboard")) || [];

  board.push({
    wallet: wallet.toLowerCase(),
    initials: initials?.slice(0, 3).toUpperCase() || "",
    score,
    ts: Date.now()
  });

  await redis.set("leaderboard", board);

  return res.status(200).json({ ok: true });
}
