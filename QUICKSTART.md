# Quick Start Guide - Tappy Rocket Deployment

## Files Ready for Deployment ✅

Your project is now structured and ready for Vercel deployment!

## Directory Structure

```
tappyBASIC/
├── public/              ← Main deployment folder (Vercel serves this)
│   ├── index.html      ← Main game file (renamed from game-pixi.html)
│   ├── assets/
│   │   ├── audio/      ← 11 MP3 files (all paths updated)
│   │   └── images/     ← 15 PNG files (all lowercase extensions)
│   └── pixi.min.js     ← Pixi.js backup
├── contract/           ← Smart contract files
│   ├── TappyCredits.sol
│   └── README.md       ← Contract documentation
├── vercel.json         ← Vercel configuration (created)
├── package.json        ← Project metadata (created)
├── README.md           ← Main documentation (created)
├── DEPLOYMENT.md       ← Deployment checklist (created)
└── .gitignore          ← Updated for Vercel

Old folders (can be deleted after verification):
├── game-web3-1.4/      ← Backed up in public/
└── new_contract/       ← Backed up in contract/
```

## What Was Changed

### ✅ Completed Tasks

1. **Restructured for Vercel**
   - Created `public/` folder for static assets
   - Moved all game files into `public/`
   - Renamed `game-pixi.html` → `index.html`

2. **Fixed File Naming**
   - Renamed 6 PNG files to lowercase (gun.png, slow.png, sherk.png, cece.png, invincibility.png, tbagsecured.png)
   - Linux/Vercel servers are case-sensitive ✓

3. **Updated Asset Paths**
   - Changed all `/assets/` (absolute) → `./assets/` (relative)
   - Updated 11 audio paths
   - Updated 10 image paths
   - Fixed inline HTML image src

4. **Created Configuration Files**
   - `vercel.json` - Routing, caching, headers
   - `package.json` - Project metadata
   - `README.md` - Complete documentation
   - `contract/README.md` - Contract documentation
   - `DEPLOYMENT.md` - Deployment checklist

5. **Organized Contract**
   - Moved to `contract/` folder
   - Added comprehensive documentation

6. **Updated .gitignore**
   - Added Vercel-specific entries
   - Added IDE and OS file patterns

## Next Steps (Action Required)

### 1. Deploy Smart Contract (REQUIRED)

```bash
# Option 1: Using Remix IDE (Easiest)
# - Go to https://remix.ethereum.org/
# - Open contract/TappyCredits.sol
# - Compile with Solidity 0.8.17+
# - Deploy to Linea network
# - Copy deployed address

# Option 2: Using Hardhat
cd contract
# Follow instructions in contract/README.md
```

### 2. Update Contract Address (REQUIRED)

After deploying contract, update `public/index.html`:

```javascript
// Line ~635 in public/index.html
const CONTRACT_ADDRESS = '0xYourNewContractAddressHere';
```

### 3. Initialize Git Repository

```bash
git init
git add .
git commit -m "Initial commit - Ready for deployment"
```

### 4. Deploy to Vercel

**Option A: Vercel CLI**
```bash
npm install -g vercel
vercel login
vercel --prod
```

**Option B: GitHub + Vercel Dashboard**
```bash
# 1. Create GitHub repo
# 2. Push code:
git remote add origin https://github.com/yourusername/tappy-rocket.git
git push -u origin main

# 3. Go to vercel.com
# 4. Import GitHub repository
# 5. Deploy (Vercel auto-detects settings)
```

## Testing Locally

```bash
# Install dependencies
npm install

# Start local server
npm run dev

# Open http://localhost:3000
```

## Important Notes

⚠️ **Contract Address Must Be Updated**
- Current address in HTML: `0xB670AB661c91081A44DEE43D9f0c79CEa5930dDf`
- This is the OLD address - you MUST deploy new contract and update!

⚠️ **Test Before Going Live**
- Deploy to Linea testnet first (recommended)
- Test credit purchase flow
- Verify game mechanics work
- Test on mobile devices

📝 **Use DEPLOYMENT.md Checklist**
- Complete checklist in `DEPLOYMENT.md`
- Check off items as you go
- Ensures nothing is missed

## Quick Commands

```bash
# Test locally
npm run dev

# Deploy to Vercel (production)
vercel --prod

# Deploy to Vercel (preview)
vercel

# Check deployment status
vercel ls
```

## Resources

- Contract docs: `contract/README.md`
- Full documentation: `README.md`
- Deployment checklist: `DEPLOYMENT.md`
- Vercel docs: https://vercel.com/docs
- Linea docs: https://docs.linea.build/

## Verification Checklist

Before deploying:
- [ ] Contract deployed to Linea
- [ ] Contract address updated in `public/index.html`
- [ ] Tested locally with `npm run dev`
- [ ] All assets load correctly
- [ ] Audio plays correctly
- [ ] Git repository initialized

Ready to deploy:
- [ ] Code committed to Git
- [ ] Pushed to GitHub (if using GitHub integration)
- [ ] Vercel CLI installed (if using CLI)
- [ ] MetaMask connected to Linea network

## Support

If you encounter issues:
1. Check browser console for errors
2. Review `DEPLOYMENT.md` troubleshooting section
3. Verify all paths are relative (`./assets/`)
4. Ensure contract address is correct

---

**Status**: ✅ Files prepared and ready for deployment
**Next**: Deploy smart contract and update address in `public/index.html`

