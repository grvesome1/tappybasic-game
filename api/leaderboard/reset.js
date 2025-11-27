import { Redis } from '@upstash/redis';

// Gracefully handle ethers import failure
let ethers;
try {
  ethers = await import('ethers');
} catch (err) {
  console.error('Failed to import ethers:', err);
  ethers = null;
}

const ADMIN = '0x3100ff9597b87e791e5bb8c0d57c94336a432089'.toLowerCase();

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

    const { sig } = req.body;

    if (!sig) {
      return res.status(400).json({ error: 'missing-signature' });
    }

    // Verify admin signature
    let signer;
    try {
      signer = ethers.verifyMessage('admin-reset', sig);
    } catch (err) {
      console.error('Signature verification failed:', err);
      return res.status(401).json({ error: 'invalid-signature' });
    }

    if (signer.toLowerCase() !== ADMIN) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    // Support both KV_* and UPSTASH_* env var naming conventions
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      console.error('Missing Redis credentials');
      return res.status(500).json({ error: 'redis-config-missing', details: 'Redis URL or token not configured' });
    }

    const redis = new Redis({ url, token });

    console.log('Admin reset requested by:', signer);
    await redis.set('leaderboard', []);
    console.log('Leaderboard reset successfully');

    return res.status(200).json({ ok: true, message: 'Leaderboard reset' });
  } catch (err) {
    console.error('RESET ERROR:', err);
    console.error('Error details:', err.message, err.stack);
    return res.status(500).json({ error: 'reset-failed', details: err.toString() });
  }
}
