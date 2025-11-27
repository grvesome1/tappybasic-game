# Leaderboard Setup Guide

## ✅ What's Been Implemented

Your leaderboard system is now fully integrated with:

- **3 Vercel Serverless API Endpoints** (`/api/leaderboard/list.js`, `/api/leaderboard/submit.js`, `/api/leaderboard/reset.js`)
- **Frontend UI** in game over screen showing top 25 scores
- **Secure Score Submission** with wallet signature verification
- **Admin Controls** for wallet `0x3100ff9597b87e791e5bb8c0d57c94336a432089`
- **Optional Initials** (3 letters max) for leaderboard display

## 🔧 Required: Set Up Vercel KV

To enable the leaderboard, you need to create a Vercel KV database:

### Step 1: Go to Vercel Dashboard
1. Visit [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project: `tappybasic-game`

### Step 2: Create KV Database
1. Click on the **Storage** tab
2. Click **Create Database**
3. Select **KV** (Key-Value Store)
4. Name it: `tappybasic-leaderboard`
5. Click **Create**

### Step 3: Connect to Your Project
1. After creating, click **Connect to Project**
2. Select `tappybasic-game`
3. Select environment: **Production** (and optionally Preview/Development)
4. Click **Connect**

### Step 4: Deploy
```bash
npx vercel deploy --prod --yes
```

That's it! The leaderboard will now work automatically.

## 🎮 How It Works

### For Players:
1. **Play the game** - Use a credit to start
2. **Game Over** - Score is automatically submitted (prompts for optional initials)
3. **View Leaderboard** - Top 25 scores shown in game over screen

### For Admin (0x3100ff9597b87e791e5bb8c0d57c94336a432089):
- **Reset Button** appears automatically when admin wallet is connected
- Click to wipe entire leaderboard (requires wallet signature)

## 🔒 Security Features

✅ **Signature Verification** - Players must sign `submit-score:<score>` with their wallet
✅ **Score Range Check** - Scores must be between 0 and 999,999
✅ **On-Chain Validation** - Backend verifies credit consumption via smart contract
✅ **Admin-Only Reset** - Only admin wallet can clear leaderboard

## 📊 Data Structure

Each leaderboard entry contains:
```json
{
  "wallet": "0xabc...",
  "initials": "ABC",
  "score": 12345,
  "ts": 1700000000000
}
```

## 🚀 API Endpoints

- **GET** `/api/leaderboard/list` - Returns top 25 scores (sorted descending)
- **POST** `/api/leaderboard/submit` - Submit a score (requires wallet signature)
- **POST** `/api/leaderboard/reset` - Admin-only leaderboard wipe

## 🧪 Testing

1. Connect wallet in game
2. Buy a credit and play
3. After game over, enter initials when prompted
4. Check game over screen for your score in the leaderboard
5. (Admin only) Test reset button

## 📝 Notes

- Leaderboard shows **wallet address (first 6 chars)** if no initials provided
- Initials are automatically **uppercased** and limited to **3 characters**
- Leaderboard is **global** - synced across all devices
- Admin wallet hardcoded: `0x3100ff9597b87e791e5bb8c0d57c94336a432089`
