import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  try {
    const board = (await redis.get("leaderboard")) || [];
    board.sort((a, b) => b.score - a.score);
    return res.status(200).json(board.slice(0, 25));
  } catch (err) {
    console.error("LIST ERROR:", err);
    return res.status(500).json({ error: "list-failed", details: err.toString() });
  }
}
