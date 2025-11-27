import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method-not-allowed' });
    }

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

    const adminToken = process.env.LEADERBOARD_ADMIN_TOKEN;
    if (!adminToken) {
      return res.status(500).json({
        error: 'admin-token-missing',
        details: 'LEADERBOARD_ADMIN_TOKEN not set',
      });
    }

    const { token: provided } = req.body || {};
    if (!provided || provided !== adminToken) {
      return res.status(403).json({ error: 'not-authorized' });
    }

    const redis = new Redis({ url, token });

    await redis.set('leaderboard', []);
    console.log('Leaderboard reset by admin');

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('RESET ERROR:', err);
    return res.status(500).json({
      error: 'reset-failed',
      details: String(err),
    });
  }
}
