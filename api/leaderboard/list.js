import * as R from '../_lib/redis.js';

export default async function handler(req, res) {
  try {
    if (!R.enabledReadOnlyOk()) {
      const info = R.envInfo();
      return res.status(500).json({
        error: 'redis-config-missing',
        details: info.notes || 'KV REST env not configured (KV_REST_API_URL + token).',
      });
    }

    const redis = R.client({ allowReadOnly: true });

    const board = (await redis.get('leaderboard')) || [];
    // Ensure it's an array
    const arr = Array.isArray(board) ? board : [];

    arr.sort((a, b) => b.score - a.score);

    console.log('Returning top', arr.length, 'scores');
    return res.status(200).json(arr.slice(0, 3));
  } catch (err) {
    console.error('LIST ERROR:', err);
    return res.status(500).json({
      error: 'list-failed',
      details: String(err),
    });
  }
}
