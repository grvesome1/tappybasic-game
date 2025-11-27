import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Support both KV_* and UPSTASH_* env var naming conventions
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      console.error('Missing Redis credentials');
      return res.status(500).json({ error: 'redis-config-missing', details: 'Redis URL or token not configured' });
    }

    const redis = new Redis({ url, token });
    console.log('Fetching leaderboard from Redis...');
    
    const board = (await redis.get('leaderboard')) || [];
    console.log('Retrieved board:', board.length, 'entries');
    
    board.sort((a, b) => b.score - a.score);
    const top25 = board.slice(0, 25);
    console.log('Returning top', top25.length, 'scores');
    
    return res.status(200).json(top25);
  } catch (err) {
    console.error('LIST ERROR:', err);
    console.error('Error details:', err.message, err.stack);
    return res.status(500).json({ error: 'list-failed', details: err.toString() });
  }
}
