import { Redis } from '@upstash/redis';
import { ethers } from 'ethers';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});
const CONTRACT_ADDRESS = "0xB670AB661c91081A44DEE43D9f0c79CEa5930dDf";
const ABI = ["function credits(address) view returns(uint256)"];

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { wallet, score, initials, sig } = req.body;
    console.log("Submit request:", { wallet, score, initials });

    if (!wallet || !sig || score === undefined) {
      return res.status(400).json({ error: "missing fields" });
    }

    const message = `submit-score:${score}`;
    let signer;
    try {
      signer = ethers.verifyMessage(message, sig);
    } catch (err) {
      console.error("Signature verification failed:", err);
      return res.status(401).json({ error: "invalid signature" });
    }

    if (signer.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(401).json({ error: "signature mismatch" });
    }

    if (score < 0 || score > 999999) {
      return res.status(400).json({ error: "invalid score range" });
    }

    // Get current leaderboard
    const board = (await redis.get("leaderboard")) || [];
    console.log("Current board before push:", board);

    // Add new score
    board.push({
      wallet: wallet.toLowerCase(),
      initials: initials?.slice(0, 3).toUpperCase() || "",
      score,
      ts: Date.now()
    });

    console.log("Board after push:", board);

    // Save back to Redis
    await redis.set("leaderboard", board);
    console.log("Saved to Redis successfully");

    return res.status(200).json({ ok: true, count: board.length });
  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    return res.status(500).json({ error: "submit-failed", details: err.toString() });
  }
}
