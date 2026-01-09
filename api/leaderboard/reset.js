import * as R from '../_lib/redis.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method-not-allowed' });
    }

    if (!R.enabled()) {
      const info = R.envInfo();
      return res.status(500).json({
        error: 'redis-config-missing',
        details: info.notes || 'KV REST env not configured for write (KV_REST_API_URL+TOKEN or UPSTASH_REDIS_REST_URL+TOKEN).',
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

    const redis = R.client();

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
