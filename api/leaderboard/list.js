import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const board = (await kv.get("leaderboard")) || [];

  // sorted desc
  board.sort((a, b) => b.score - a.score);

  res.status(200).json(board.slice(0, 25));
}
