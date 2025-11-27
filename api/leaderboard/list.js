import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  try {
    console.log("Fetching leaderboard from Redis...");
    const board = (await redis.get("leaderboard")) || [];
    console.log("Retrieved board:", board.length, "entries");
    
    board.sort((a, b) => b.score - a.score);
    const top25 = board.slice(0, 25);
    console.log("Returning top", top25.length, "scores");
    
    return res.status(200).json(top25);
  } catch (err) {
    console.error("LIST ERROR:", err);
    console.error("Error details:", err.message, err.stack);
    return res.status(500).json({ error: "list-failed", details: err.toString() });
  }
}
