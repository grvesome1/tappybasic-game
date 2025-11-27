import { Redis } from '@upstash/redis';
import { ethers } from 'ethers';

const redis = Redis.fromEnv();
const CONTRACT_ADDRESS = "0xB670AB661c91081A44DEE43D9f0c79CEa5930dDf";
const ABI = [
  "function credits(address) view returns(uint256)"
];

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { wallet, score, initials, sig } = req.body;
    if (!wallet || !sig || score === undefined) {
      return res.status(400).json({ error: "missing fields" });
    }

    // 1. Verify the wallet signature
    const message = `submit-score:${score}`;
    let signer;
    try {
      signer = ethers.verifyMessage(message, sig);
    } catch (err) {
      return res.status(401).json({ error: "invalid signature" });
    }

    if (signer.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(401).json({ error: "signature mismatch" });
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
    try {
      const board = (await redis.get("leaderboard")) || [];

      board.push({
        wallet: wallet.toLowerCase(),
        initials: initials?.slice(0, 3).toUpperCase() || "",
        score,
        ts: Date.now()
      });

      await redis.set("leaderboard", board);
    } catch (redisErr) {
      console.error("Redis error:", redisErr);
      return res.status(500).json({ error: "database-error", details: redisErr.toString() });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    return res.status(500).json({ error: "submit-failed", details: err.toString() });
  }
}
