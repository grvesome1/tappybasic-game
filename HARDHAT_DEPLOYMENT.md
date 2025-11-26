# Hardhat + Static Vercel Deployment Guide

## Project Structure

```
tappyBASIC/
├── index.html              # Main game file (static HTML + Pixi.js)
├── assets/                 # Game assets (audio, images)
├── pixi.min.js            # Pixi.js library
├── vercel.json            # Vercel configuration
├── contract/              # Hardhat project
│   ├── contracts/
│   │   └── TappyCredits.sol
│   ├── scripts/
│   │   └── deploy.js
│   ├── hardhat.config.js
│   ├── package.json
│   └── .env.example
└── old/                   # Backup folders (can be deleted)
    ├── public/
    ├── game-web3-1.4/
    └── new_contract/
```

## Step 1: Deploy Smart Contract to Linea Sepolia

### 1.1 Setup Environment

```bash
cd contract
cp .env.example .env
```

Edit `.env` and add:
```bash
RPC_URL=https://rpc.sepolia.linea.build
PRIVATE_KEY=0xYOUR_LINEA_SEPOLIA_PRIVATE_KEY_WITH_TEST_ETH
```

**Get Linea Sepolia Test ETH:**
- Faucet: https://faucet.triangleplatform.com/linea/sepolia
- Bridge: https://bridge.linea.build/

### 1.2 Compile and Deploy

```bash
# Compile contract
npx hardhat compile

# Deploy to Linea Sepolia
npx hardhat run scripts/deploy.js --network linea_sepolia
```

**Save the deployed contract address!** You'll see output like:
```
✅ TappyCredits deployed to: 0xABCD1234...
```

### 1.3 Verify Contract (Optional but Recommended)

Go to https://sepolia.lineascan.build/ and verify your contract for transparency.

---

## Step 2: Update Frontend with Contract Address

Edit `index.html` (around line 635):

```javascript
// OLD:
const CONTRACT_ADDRESS = '0xB670AB661c91081A44DEE43D9f0c79CEa5930dDf';

// NEW (use your deployed address):
const CONTRACT_ADDRESS = '0xYOUR_DEPLOYED_CONTRACT_ADDRESS';
```

---

## Step 3: Test Locally

```bash
# From project root
npm run dev
```

Open http://localhost:3000

**Test checklist:**
- [ ] Game loads without errors
- [ ] All assets (images/audio) load correctly
- [ ] Connect MetaMask wallet (Linea Sepolia network)
- [ ] Purchase 1 credit (costs 0.000005 ETH)
- [ ] Credit count increases
- [ ] Start game (consumes 1 credit)
- [ ] Game plays normally

---

## Step 4: Deploy to GitHub

```bash
# From project root
git init
git add .
git commit -m "Tappy Rocket static web3 game + Hardhat contract"

# Create repo on GitHub, then:
git remote add origin git@github.com:YOUR_ORG/YOUR_REPO.git
git branch -M main
git push -u origin main
```

---

## Step 5: Deploy to Vercel

### Option A: Vercel Dashboard (Recommended)

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. **Framework Preset:** Other / Static
4. **Build Command:** (leave empty)
5. **Output Directory:** `.` (root)
6. **Install Command:** `npm install`
7. Click "Deploy"

### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

---

## Step 6: Attach Custom Domain

1. In Vercel project → **Settings** → **Domains**
2. Add your custom domain (the one that served the old site)
3. Configure DNS:
   - **For apex domain (example.com):** Add A record to Vercel IP
   - **For subdomain (www.example.com):** Add CNAME to `cname.vercel-dns.com`
4. Wait for DNS propagation (5-30 minutes)

---

## Step 7: Final Testing

On your production URL:

- [ ] Game loads on custom domain
- [ ] MetaMask connects on Linea Sepolia
- [ ] Credit purchase works (0.000005 ETH)
- [ ] Game mechanics work correctly
- [ ] Audio plays on mobile
- [ ] No console errors

---

## Contract Info

**Network:** Linea Sepolia (Chain ID: 59141)  
**Contract:** TappyCredits.sol  
**Credit Price:** 5,000,000,000,000 wei (0.000005 ETH)

**Functions:**
- `purchaseCreditsWithETH(uint256 amount)` - Buy credits
- `creditPriceETH()` - View price (returns 5000000000000)
- `credits(address)` - View user's credit balance

---

## Troubleshooting

### Contract deployment fails
- Ensure wallet has Linea Sepolia ETH
- Check RPC_URL is correct
- Verify PRIVATE_KEY includes `0x` prefix

### Assets don't load on Vercel
- Verify paths are relative (`./assets/` not `/assets/`)
- Check file extensions are lowercase (.png not .PNG)

### MetaMask connection fails
- Ensure Linea Sepolia network is added to MetaMask
- Chain ID: 59141
- RPC: https://rpc.sepolia.linea.build

### Credit purchase fails
- Verify CONTRACT_ADDRESS in index.html matches deployed address
- Ensure wallet has >= 0.000005 ETH + gas
- Check you're on Linea Sepolia network

---

## Moving to Mainnet

When ready for production on Linea Mainnet:

1. Update `hardhat.config.js`:
```javascript
linea_mainnet: {
  type: "http",
  url: "https://rpc.linea.build",
  accounts: [process.env.MAINNET_PRIVATE_KEY],
  chainId: 59144
}
```

2. Deploy to mainnet:
```bash
npx hardhat run scripts/deploy.js --network linea_mainnet
```

3. Update `index.html` with new mainnet contract address
4. Redeploy to Vercel

---

**Status:** ✅ Ready for deployment
**Next:** Deploy contract, update address, push to GitHub, deploy to Vercel

