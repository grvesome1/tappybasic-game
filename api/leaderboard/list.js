import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  try {
    const url =
      process.env.KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_URL;
    const token =
      process.env.KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      return res.status(500).json({
        error: 'redis-config-missing',
        details: 'KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN not set',
      });
    }

    const redis = new Redis({ url, token });

    const board = (await redis.get('leaderboard')) || [];
    // Ensure it's an array
    const arr = Array.isArray(board) ? board : [];

    arr.sort((a, b) => b.score - a.score);

    console.log('Returning top', arr.length, 'scores');
    return res.status(200).json(arr.slice(0, 4));
  } catch (err) {
    console.error('LIST ERROR:', err);
    return res.status(500).json({
      error: 'list-failed',
      details: String(err),
    });
  }
}
