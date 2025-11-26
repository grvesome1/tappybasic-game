# $TBAG's Tappy Rocket - Web3 Game

A Pixi.js-based endless runner game integrated with Ethereum smart contracts on the Linea blockchain for credit purchases.

## Features

- 🎮 **Engaging Gameplay**: Endless runner with progressive difficulty and powerup system
- 🔗 **Web3 Integration**: MetaMask wallet connection for on-chain credit purchases
- 💰 **Credit System**: Purchase play credits with ETH (0.000005 ETH per credit)
- 🎨 **Rich Graphics**: Pixi.js WebGL rendering with particle effects and animations
- 🎵 **Immersive Audio**: Background music and dynamic sound effects
- 📱 **Mobile Friendly**: Touch controls and responsive design
- 💾 **Persistent Data**: High scores and credits saved locally

## Tech Stack

- **Frontend**: HTML5, JavaScript (ES6+), Pixi.js v7.3.2
- **Web3**: Ethers.js v6.6.2
- **Blockchain**: Linea network
- **Smart Contract**: Solidity ^0.8.17
- **Hosting**: Vercel (recommended)

## Project Structure

```
tappyBASIC/
├── public/               # Static assets served by Vercel
│   ├── index.html       # Main game file (3865 lines)
│   ├── assets/
│   │   ├── audio/       # 11 MP3 sound effects + background music
│   │   └── images/      # 11 PNG game sprites and UI elements
│   └── pixi.min.js      # Pixi.js library backup (CDN fallback)
├── contract/            # Smart contract source
│   └── TappyCredits.sol # Credit purchase contract
├── vercel.json          # Vercel deployment configuration
├── package.json         # Project metadata
└── README.md           # This file
```

## Smart Contract

### TappyCredits.sol

- **Network**: Linea
- **Current Address**: `0xB670AB661c91081A44DEE43D9f0c79CEa5930dDf` (needs redeployment)
- **Credit Price**: 5,000,000,000,000 wei (0.000005 ETH) - fixed price
- **Functions**:
  - `purchaseCreditsWithETH(uint256 amount)` - Buy credits with ETH
  - `creditPriceETH()` - View credit price
  - `credits(address)` - View user's credit balance
  - `consumeCredit(address, uint256)` - Admin function to deduct credits
  - `withdrawAll()` - Owner withdraws contract balance

## Deployment Instructions

### Prerequisites

- Node.js 16+ installed
- Vercel CLI: `npm install -g vercel`
- MetaMask or compatible Web3 wallet
- Access to Linea network RPC

### 1. Deploy Smart Contract

```bash
# Navigate to contract directory
cd contract

# Deploy using your preferred tool (Hardhat, Foundry, Remix)
# Example with Remix:
# 1. Open TappyCredits.sol in Remix IDE
# 2. Compile with Solidity 0.8.17+
# 3. Deploy to Linea network
# 4. Verify contract on Linea block explorer
```

### 2. Update Contract Address

After deploying the contract, update the address in `public/index.html`:

```javascript
// Line ~635 in index.html
const CONTRACT_ADDRESS = '0xYourNewContractAddress';
```

### 3. Deploy to Vercel

#### Option A: Using Vercel CLI

```bash
# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

#### Option B: Using GitHub Integration

```bash
# Push to GitHub
git init
git add .
git commit -m "Initial deployment preparation"
git remote add origin https://github.com/yourusername/tappy-rocket.git
git push -u origin main

# Connect repository in Vercel dashboard:
# 1. Go to vercel.com/new
# 2. Import your GitHub repository
# 3. Keep default settings (Vercel detects config automatically)
# 4. Deploy
```

### 4. Local Development

```bash
# Install dependencies
npm install

# Start local server
npm run dev

# Server runs at http://localhost:3000
```

### 5. Post-Deployment Testing

- [ ] Connect MetaMask wallet
- [ ] Switch to Linea network
- [ ] Purchase a credit (0.000005 ETH)
- [ ] Start game (consumes 1 credit)
- [ ] Verify audio playback
- [ ] Test on mobile device
- [ ] Check high score persistence

## Environment Configuration

No environment variables required. All configuration is in `public/index.html`:

- **CONTRACT_ADDRESS** (line ~635): Smart contract address
- **CREDIT_PRICE_WEI** (line ~669): 5000000000000n (hardcoded)
- **Game Constants** (line ~614-628): Balance and mechanics

## Game Mechanics

### Powerups

- 🔫 **Gun**: Shoot obstacles for 10 seconds
- ⏰ **Slow Motion**: Reduces game speed by 40%
- 🔵 **Sherk**: Double score for 10 seconds
- 🛡️ **Invincibility**: Immunity to obstacles for 5 seconds
- 🚀 **Cece**: Auto-fire missiles

### Scoring

- Pass through obstacles: +1 point
- Collect $TBAG tokens: Special achievement
- Combo multipliers: Chain successful dodges
- Speed increases: Progressive difficulty

## Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Optimizations

- Object pooling for game entities
- Particle containers (10-100x faster rendering)
- Texture caching with `cacheAsBitmap`
- Off-screen culling for background layers
- Audio sprite loading with Web Audio API

## Security Considerations

⚠️ **Client-Side Credit Management**: Credits are stored in localStorage and can be manipulated. For production use, implement server-side validation or on-chain credit consumption.

⚠️ **Contract Ownership**: Single owner address. Consider multi-sig for production.

## Troubleshooting

### Audio Not Playing

- Ensure user interaction before audio plays (browser requirement)
- Check browser audio permissions
- Verify assets are loaded: Check browser console

### Wallet Connection Issues

- Ensure MetaMask is installed
- Switch to Linea network in MetaMask
- Check network ID matches Linea

### Deployment Issues

- Verify all paths are relative (`./assets/` not `/assets/`)
- Check file name casing (Linux is case-sensitive)
- Review Vercel build logs for errors

## Credits

- **Game Design & Development**: gruesøme
- **Background Music**: Elisaveta Stoycheva (Pixabay)
- **Graphics Library**: Pixi.js Team
- **Web3 Integration**: Ethers.js Team

## License

MIT License - See contract header for full license text

## Support

For issues or questions about deployment, please refer to:
- [Vercel Documentation](https://vercel.com/docs)
- [Linea Documentation](https://docs.linea.build/)
- [Pixi.js Documentation](https://pixijs.com/)

---

**Built by gruesøme** | Signature: `YnVpbHQgYnkgZ3J1ZXPDuG1l`
