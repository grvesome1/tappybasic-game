import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    const board = (await kv.get("leaderboard")) || [];
    board.sort((a, b) => b.score - a.score);
    return res.status(200).json(board.slice(0, 25));
  } catch (err) {
    console.error("LIST ERROR:", err);
    return res.status(500).json({ error: "list-failed", details: err.toString() });
  }
}
