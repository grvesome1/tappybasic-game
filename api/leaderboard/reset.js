import { kv } from '@vercel/kv';
import { ethers } from 'ethers';

const ADMIN = "0x3100ff9597b87e791e5bb8c0d57c94336a432089".toLowerCase();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { sig } = req.body;
  if (!sig) return res.status(401).end();

  const message = "admin-reset";
  const signer = ethers.verifyMessage(message, sig);

  if (signer.toLowerCase() !== ADMIN) {
    return res.status(403).json({ error: "not admin" });
  }

  await kv.set("leaderboard", []);
  return res.status(200).json({ ok: true, cleared: true });
}
