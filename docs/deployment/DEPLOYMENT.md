# Deployment Checklist for Tappy Rocket Web3

## Pre-Deployment Checklist

### 1. Smart Contract Deployment
- [ ] Compile `TappyCredits.sol` with Solidity ^0.8.17
- [ ] Deploy to Linea mainnet (or testnet for testing)
- [ ] Verify contract on Linea block explorer
- [ ] Test `purchaseCreditsWithETH()` function
- [ ] Test `creditPriceETH()` view function
- [ ] Confirm owner address is correct
- [ ] Document deployed contract address: `____________________`

### 2. Frontend Configuration
- [ ] Update `CONTRACT_ADDRESS` in `public/index.html` (line ~635)
- [ ] Verify all asset paths are relative (`./assets/`)
- [ ] Confirm all `.png` extensions are lowercase
- [ ] Test locally with `npm run dev`
- [ ] Verify audio files load correctly
- [ ] Verify image assets load correctly

### 3. Git Repository Setup
- [ ] Initialize git repository: `git init`
- [ ] Add all files: `git add .`
- [ ] Commit: `git commit -m "Initial deployment preparation"`
- [ ] Create GitHub repository
- [ ] Add remote: `git remote add origin <your-repo-url>`
- [ ] Push to GitHub: `git push -u origin main`

### 4. Vercel Deployment
- [ ] Login to Vercel: `vercel login`
- [ ] Deploy: `vercel --prod`
- [ ] OR connect GitHub repo in Vercel dashboard
- [ ] Verify deployment URL works
- [ ] Test on deployed URL

## Post-Deployment Testing

### Functional Tests
- [ ] Website loads without errors (check browser console)
- [ ] MetaMask wallet connection works
- [ ] Network detection (Linea) works correctly
- [ ] Credit purchase flow:
  - [ ] Connect wallet button works
  - [ ] Purchase button appears after connection
  - [ ] Transaction prompts in MetaMask
  - [ ] Credit count updates after purchase
  - [ ] Excess ETH is refunded correctly
- [ ] Game starts correctly (consumes 1 credit)
- [ ] Game over screen displays
- [ ] Restart button works
- [ ] High scores persist (localStorage)

### Audio Tests
- [ ] Background music plays
- [ ] Sound effects work:
  - [ ] Flap sound
  - [ ] Lift sound
  - [ ] Score sound
  - [ ] Explosion sound
  - [ ] Powerup sounds (gun, slow, invincibility, etc.)
  - [ ] $TBAG collection sound
- [ ] Audio works on mobile (iOS Safari, Chrome)
- [ ] Mute toggle works

### Mobile Tests
- [ ] Touch controls work
- [ ] Touch feedback indicator appears
- [ ] Layout responsive on mobile
- [ ] MetaMask mobile integration works
- [ ] Audio plays (after user interaction)
- [ ] Performance acceptable (30+ FPS)

### Browser Compatibility
- [ ] Chrome (desktop)
- [ ] Firefox (desktop)
- [ ] Safari (desktop)
- [ ] Edge (desktop)
- [ ] Chrome Mobile (Android)
- [ ] Safari Mobile (iOS)

### Performance Tests
- [ ] Page load time < 3 seconds
- [ ] Asset loading completes without errors
- [ ] Game runs at 60 FPS (desktop)
- [ ] Game runs at 30+ FPS (mobile)
- [ ] No memory leaks after multiple game sessions

## Smart Contract Monitoring

### After Launch
- [ ] Monitor contract for purchase transactions
- [ ] Verify credit balances update correctly
- [ ] Check for any failed transactions
- [ ] Ensure withdrawal function works (owner only)
- [ ] Monitor gas costs for users

### Security Checks
- [ ] Verify owner address is correct
- [ ] Test ownership transfer (if needed)
- [ ] Ensure only owner can consume credits
- [ ] Verify refund mechanism works

## Common Issues & Solutions

### Issue: Assets Not Loading
**Solution:** Check that all paths use `./assets/` (relative) not `/assets/` (absolute)

### Issue: Audio Not Playing
**Solution:** Ensure user interacts with page first (click anywhere). Check browser console for errors.

### Issue: Wallet Connection Fails
**Solution:** 
- Check MetaMask is installed
- Verify Linea network is added to MetaMask
- Clear browser cache and try again

### Issue: Contract Function Fails
**Solution:**
- Verify contract address is correct
- Check network ID matches Linea
- Ensure sufficient ETH in wallet
- Check gas limit

### Issue: Vercel Deployment Fails
**Solution:**
- Check `vercel.json` syntax is valid
- Verify all files are committed to Git
- Review Vercel build logs for errors
- Ensure `public/` directory exists

## Rollback Plan

If critical issues are found:

1. **Quick Fix**: Update `public/index.html` and redeploy
2. **Contract Issue**: Deploy new contract and update address
3. **Complete Rollback**: Revert to previous Git commit and redeploy

## Final Steps

- [ ] Add custom domain in Vercel (if applicable)
- [ ] Update DNS records (if custom domain)
- [ ] Enable HTTPS (automatic with Vercel)
- [ ] Add analytics (Google Analytics, Plausible, etc.)
- [ ] Monitor error logs in Vercel dashboard
- [ ] Share deployment URL with stakeholders
- [ ] Document contract address in README.md
- [ ] Celebrate! 🎉

## Support Contacts

- **Linea Support**: https://docs.linea.build/
- **Vercel Support**: https://vercel.com/support
- **MetaMask Support**: https://metamask.io/support/

---

**Deployment Date:** _______________
**Deployed By:** _______________
**Contract Address:** _______________
**Vercel URL:** _______________
**Custom Domain:** _______________

