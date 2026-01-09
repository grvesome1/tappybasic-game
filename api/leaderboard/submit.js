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

    const { wallet, score, initials, tbags } = req.body || {};

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

    const redis = R.client();
    const board = (await redis.get('leaderboard')) || [];
    // Ensure we always work with a sane array of entries
    const arr = Array.isArray(board)
      ? board.filter((entry) => entry && typeof entry.score === 'number')
      : [];

    const entry = {
      wallet: wallet.toLowerCase(),
      initials: safeInitials,
      score,
      tbags: typeof tbags === 'number' ? tbags : 0,
      ts: Date.now(),
    };

    arr.push(entry);

    // Keep the stored leaderboard bounded and focused on the highest scores
    const MAX_ENTRIES = 100;
    arr.sort((a, b) => b.score - a.score);
    if (arr.length > MAX_ENTRIES) {
      arr.length = MAX_ENTRIES;
    }

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
