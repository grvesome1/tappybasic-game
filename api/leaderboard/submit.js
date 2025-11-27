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

    const redis = new Redis({ url, token });

    const { wallet, score, initials } = req.body || {};

    if (!wallet || typeof score !== 'number') {
      return res.status(400).json({ error: 'missing-fields' });
    }

    if (score < 0 || score > 999999) {
      return res.status(400).json({ error: 'invalid-score-range' });
    }

    const safeInitials =
      (initials || '')
        .toString()
        .slice(0, 3)
        .toUpperCase() || '';

    const board = (await redis.get('leaderboard')) || [];
    const arr = Array.isArray(board) ? board : [];

    arr.push({
      wallet: wallet.toLowerCase(),
      initials: safeInitials,
      score,
      ts: Date.now(),
    });

    await redis.set('leaderboard', arr);

    console.log('Leaderboard updated, total entries:', arr.length);

    return res.status(200).json({ ok: true, count: arr.length });
  } catch (err) {
    console.error('SUBMIT ERROR:', err);
    return res.status(500).json({
      error: 'submit-failed',
      details: String(err),
    });
  }
}
