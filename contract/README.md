# TappyCredits Smart Contract

## Overview

Minimal credit contract for Tappy Rocket game on Linea blockchain. Players purchase play credits with ETH at a fixed price.

## Contract Details

- **License**: MIT
- **Solidity Version**: ^0.8.17
- **Network**: Linea
- **Author**: gruesøme

## Features

- Fixed credit price: 5,000,000,000,000 wei (0.000005 ETH per credit)
- Simple mapping-based credit storage per address
- Owner-controlled credit consumption for backend integration
- Automatic refund of excess ETH on purchases
- Owner withdrawal function

## Functions

### Public/External Functions

#### `purchaseCreditsWithETH(uint256 amount)` - payable
Purchase credits with ETH. Excess ETH is automatically refunded.

**Parameters:**
- `amount`: Number of credits to purchase

**Requirements:**
- `amount > 0`
- `msg.value >= CREDIT_PRICE_WEI * amount`

**Emits:** `CreditsPurchased(address user, uint256 amount, uint256 cost)`

#### `creditPriceETH()` - view
Returns the fixed credit price in wei.

**Returns:** `uint256` - 5,000,000,000,000 (constant)

#### `credits(address user)` - view
Returns credit balance for a given address.

**Parameters:**
- `user`: Address to query

**Returns:** `uint256` - Credit balance

### Owner-Only Functions

#### `consumeCredit(address user, uint256 amount)`
Deduct credits from a user's balance. Used by backend when game starts.

**Parameters:**
- `user`: Address to deduct credits from
- `amount`: Number of credits to consume

**Requirements:**
- Only callable by owner
- `credits[user] >= amount`

**Emits:** `CreditsConsumed(address user, uint256 amount)`

#### `withdrawAll()`
Withdraw entire contract balance to owner address.

**Requirements:**
- Only callable by owner
- Contract balance > 0

**Emits:** `Withdrawn(address owner, uint256 amount)`

#### `transferOwnership(address newOwner)`
Transfer ownership to a new address.

**Parameters:**
- `newOwner`: New owner address (cannot be zero address)

**Requirements:**
- Only callable by owner
- `newOwner != address(0)`

**Emits:** `OwnershipTransferred(address previousOwner, address newOwner)`

## Events

```solidity
event CreditsPurchased(address indexed user, uint256 amount, uint256 cost);
event CreditsConsumed(address indexed user, uint256 amount);
event Withdrawn(address indexed owner, uint256 amount);
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
```

## Deployment Instructions

### Using Remix IDE

1. Open [Remix IDE](https://remix.ethereum.org/)
2. Create new file `TappyCredits.sol`
3. Copy contract code from `TappyCredits.sol`
4. Select compiler version 0.8.17 or higher
5. Compile contract
6. Deploy to Linea:
   - Environment: "Injected Provider - MetaMask"
   - Ensure MetaMask is connected to Linea network
   - Click "Deploy"
   - Confirm transaction in MetaMask

### Using Hardhat

```bash
# Install dependencies
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# Create deployment script
npx hardhat init

# Configure hardhat.config.js for Linea
# Add deployment script to scripts/deploy.js

# Deploy
npx hardhat run scripts/deploy.js --network linea
```

### Using Foundry

```bash
# Install Foundry (if not installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Deploy to Linea
forge create TappyCredits \\
  --rpc-url https://rpc.linea.build \\
  --private-key YOUR_PRIVATE_KEY \\
  --verify
```

## Post-Deployment

1. **Verify Contract** on Linea block explorer:
   - Go to [Linea Explorer](https://lineascan.build/)
   - Enter deployed contract address
   - Click "Verify and Publish"
   - Select compiler version and optimization settings
   - Paste contract code
   - Submit for verification

2. **Update Frontend**: Copy deployed address to `public/index.html`:
   ```javascript
   const CONTRACT_ADDRESS = '0xYourDeployedAddress';
   ```

3. **Test Contract**:
   - Purchase 1 credit (send 0.000005 ETH)
   - Verify credit balance increased
   - Test withdrawal function (owner only)

## Security Considerations

⚠️ **Single Owner Risk**: Contract uses simple owner pattern. For production, consider:
- Multi-signature wallet as owner
- Timelock for ownership transfers
- Emergency pause mechanism

⚠️ **No Rate Limiting**: Users can purchase unlimited credits. Consider adding:
- Maximum purchase limits per transaction
- Cooldown periods between purchases

⚠️ **Backend Integration Required**: Credit consumption requires backend service with owner private key. Ensure:
- Secure key management
- Rate limiting on backend
- Proper authentication

## ABI for Frontend Integration

Minimal ABI used in `public/index.html`:

```javascript
const CONTRACT_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'purchaseCreditsWithETH',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'creditPriceETH',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'credits',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];
```

## Gas Estimates

- Deploy: ~400,000 gas
- purchaseCreditsWithETH: ~50,000 gas
- consumeCredit: ~30,000 gas
- withdrawAll: ~30,000 gas

## Current Status

🔴 **CONTRACT NEEDS REDEPLOYMENT**

Previous address: `0xB670AB661c91081A44DEE43D9f0c79CEa5930dDf`

After redeployment, update:
1. `public/index.html` line ~635 with new contract address
2. This README with new address
3. Test all functions before going live

## License

MIT License - See contract source code for full license text

---

**Built by gruesøme** | Signature: `YnVpbHQgYnkgZ3J1ZXPDuG1l`
