import { Redis } from '@upstash/redis';

// Gracefully handle ethers import failure
let ethers;
try {
  ethers = await import('ethers');
} catch (err) {
  console.error('Failed to import ethers:', err);
  ethers = null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method-not-allowed' });
    }

    // Check if ethers is available
    if (!ethers) {
      console.error('Ethers library not available');
      return res.status(500).json({ error: 'ethers-unavailable', details: 'Signature verification not available' });
    }

    const { wallet, score, initials, sig } = req.body;
    console.log('Submit request:', { wallet, score, initials });

    if (!wallet || !sig || score === undefined) {
      return res.status(400).json({ error: 'missing-fields' });
    }

    // Verify signature
    const message = `submit-score:${score}`;
    let signer;
    try {
      signer = ethers.verifyMessage(message, sig);
    } catch (err) {
      console.error('Signature verification failed:', err);
      return res.status(401).json({ error: 'invalid-signature' });
    }

    if (signer.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(401).json({ error: 'signature-mismatch' });
    }

    if (score < 0 || score > 999999) {
      return res.status(400).json({ error: 'invalid-score-range' });
    }

    // Support both KV_* and UPSTASH_* env var naming conventions
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      console.error('Missing Redis credentials');
      return res.status(500).json({ error: 'redis-config-missing', details: 'Redis URL or token not configured' });
    }

    const redis = new Redis({ url, token });

    // Get current leaderboard
    const board = (await redis.get('leaderboard')) || [];
    console.log('Current board before push:', board.length, 'entries');

    // Add new score
    board.push({
      wallet: wallet.toLowerCase(),
      initials: initials?.slice(0, 3).toUpperCase() || '',
      score,
      ts: Date.now()
    });

    console.log('Board after push:', board.length, 'entries');

    // Save back to Redis
    await redis.set('leaderboard', board);
    console.log('Saved to Redis successfully');

    return res.status(200).json({ ok: true, count: board.length });
  } catch (err) {
    console.error('SUBMIT ERROR:', err);
    console.error('Error details:', err.message, err.stack);
    return res.status(500).json({ error: 'submit-failed', details: err.toString() });
  }
}
