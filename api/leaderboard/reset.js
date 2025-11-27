import { kv } from '@vercel/kv';
import { ethers } from 'ethers';

const ADMIN = "0x3100ff9597b87e791e5bb8c0d57c94336a432089".toLowerCase();

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { sig } = req.body || {};
    if (!sig) {
      return res.status(400).json({ error: "Missing signature" });
    }

    let signer;
    try {
      signer = ethers.verifyMessage("admin-reset", sig);
    } catch (err) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    if (signer.toLowerCase() !== ADMIN) {
      return res.status(403).json({ error: "Not admin" });
    }

    await kv.set("leaderboard", []);
    return res.status(200).json({ ok: true });
  }
  catch (err) {
    console.error("RESET ERROR:", err);
    return res.status(500).json({ error: "reset-failed", details: err.toString() });
  }
}
