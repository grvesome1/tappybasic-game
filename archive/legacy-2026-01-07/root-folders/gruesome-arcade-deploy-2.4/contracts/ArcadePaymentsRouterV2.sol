// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

/*
  Gruesøme's Arcade — Payments Router (V2)

  This router is the on-chain "receipt + routing" layer for the Arcade's hybrid Web2/Web3 economy.

  - Users submit a backend-signed EIP-712 Quote (anti-tamper + anti-replay)
  - The router verifies the signature + consumes the quote (one-time use)
  - Funds are routed according to per-kind SplitBps (basis points)
  - When payToken == mUSD, daily/weekly pots are funded directly on-chain
  - When payToken != mUSD, funds go to the Treasury Vault for off-chain swap/accounting

  Notes:
  - Ownership should be transferred to a multisig after deployment.
  - Default KIND_CREDITS split implements the "7% ops, 10% treasury, rest to payouts" policy.
*/

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IArcadeProAvatarV2 {
    function mintFromRouter(
        address to,
        uint8 tier,
        string calldata tokenURI,
        bytes32 dnaHash,
        string calldata nickname
    ) external returns (uint256 tokenId);

    function renewFromRouter(address user, uint8 tier) external returns (uint64 newExpiresAt);
}

/// @notice Universal payments router for Gruesome Arcade.
contract ArcadePaymentsRouterV2 is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // --- Quote types ---
    string public constant EIP712_NAME = "GruesomeArcade PaymentsRouter";
    // NOTE: bumping version changes the EIP-712 domain separator (intentional for new deployments)
    string public constant EIP712_VERSION = "2.4";

    // Quote kind enum (extend via skuKind mapping)
    uint8 public constant KIND_NONE = 0;
    uint8 public constant KIND_CREDITS = 1;
    uint8 public constant KIND_PRO_MINT = 2;
    uint8 public constant KIND_PRO_RENEW = 3;
    uint8 public constant KIND_GENERIC = 4;

    struct Quote {
        address buyer;      // must match msg.sender
        bytes32 sku;        // standardized SKU id (bytes32)
        uint8 kind;         // one of KIND_*
        address payToken;   // address(0) = native ETH
        uint256 amountIn;   // token amount to pay (or msg.value)
        uint256 usdCents;   // price in USD cents (accounting + backend UI)
        uint256 credits;    // credits to grant (only for KIND_CREDITS)
        uint8 tier;         // membership tier (only for PRO kinds)
        uint64 expiresAt;   // unix seconds
        uint256 nonce;      // unique per buyer (recommended)
        bytes32 ref;        // optional referral/campaign id
        bytes32 dataHash;   // optional: keccak256(extra data payload). Used for PRO mint metadata binding.
    }

    bytes32 internal constant QUOTE_TYPEHASH = keccak256(
        "Quote(address buyer,bytes32 sku,uint8 kind,address payToken,uint256 amountIn,uint256 usdCents,uint256 credits,uint8 tier,uint64 expiresAt,uint256 nonce,bytes32 ref,bytes32 dataHash)"
    );

    struct SplitBps {
        uint16 opsBps;
        uint16 dailyBps;
        uint16 weeklyBps;
        uint16 treasuryBps;
    }

    // --- Config ---
    address public immutable mUSD;          // payout stable token (e.g., Linea mUSD)
    address public treasuryVault;           // custody sink for non-mUSD payments (TBAG/RUSTYAI/ETH/etc)
    address public opsWallet;               // ops revenue receiver (for direct mUSD flows)
    address public dailyPot;                // mUSD receiver for daily payouts pool
    address public weeklyPot;               // mUSD receiver for weekly payouts pool

    address public quoteSigner;             // backend signer for quotes
    IArcadeProAvatarV2 public proAvatar;    // required for PRO mint/renew

    bool public paused;

    // Allowlist of pay tokens (address(0) native is implicitly allowed)
    mapping(address => bool) public tokenAllowed;

    /// @notice Token list for UI discovery.
    /// @dev We keep a monotonically growing list so UIs can enumerate.
    ///      Disallowed tokens remain in the list but `tokenAllowed[token]` will be false.
    address[] private _tokenList;
    mapping(address => bool) private _tokenEverListed;

    /// @notice Returns the full token list ever allowlisted (may include disabled tokens).
    /// @dev Frontends should filter with `tokenAllowed(token)`.
    function getTokenList() external view returns (address[] memory) {
        return _tokenList;
    }

    /// @notice Number of tokens in the list.
    function tokenListCount() external view returns (uint256) {
        return _tokenList.length;
    }

    // For non-mUSD tokens, optionally route the OPS portion directly to opsWallet in the same token.
    mapping(address => bool) public directOpsToken;

    // SKU -> kind binding (prevents signing "wrong kind" for an SKU)
    mapping(bytes32 => uint8) public skuKind;

    // kind -> split basis points
    mapping(uint8 => SplitBps) public kindSplits;

    // quote digest -> used
    mapping(bytes32 => bool) public usedQuote;

    // --- Events ---
    event PausedSet(bool paused);

    event QuoteSignerSet(address indexed signer);
    event ProAvatarSet(address indexed proAvatar);
    event TreasuryVaultSet(address indexed vault);
    event RecipientsSet(address indexed opsWallet, address indexed dailyPot, address indexed weeklyPot);

    event TokenAllowed(address indexed token, bool allowed);
    event DirectOpsTokenSet(address indexed token, bool enabled);
    event SkuKindSet(bytes32 indexed sku, uint8 kind);
    event KindSplitsSet(uint8 indexed kind, uint16 opsBps, uint16 dailyBps, uint16 weeklyBps, uint16 treasuryBps);

    /// @notice Canonical receipt event for ANY payment.
    /// @dev If payToken != mUSD, the router sends the *full* amount to treasuryVault (directPotFunding=false).
    ///      In that case ops/daily/weekly/treasury amounts are "intended allocations" for accounting only.
    event PaymentExecuted(
        bytes32 indexed quoteId,
        address indexed buyer,
        bytes32 indexed sku,
        uint8 kind,
        address payToken,
        uint256 amountIn,
        uint256 usdCents,
        uint256 credits,
        uint8 tier,
        uint256 opsAmount,
        uint256 dailyPotAmount,
        uint256 weeklyPotAmount,
        uint256 treasuryAmount,
        uint256 opsRouted,
        uint256 treasuryRouted,
        bool directPotFunding,
        bytes32 ref
    );

    event CreditsPurchased(bytes32 indexed quoteId, address indexed buyer, uint256 credits, uint256 usdCents, bytes32 ref);
    event ProMinted(bytes32 indexed quoteId, address indexed buyer, uint256 tokenId, uint8 tier);
    event ProRenewed(bytes32 indexed quoteId, address indexed buyer, uint8 tier, uint64 newExpiresAt);

    constructor(
        address _owner,
        address _mUSD,
        address _treasuryVault,
        address _opsWallet,
        address _dailyPot,
        address _weeklyPot,
        address _quoteSigner
    ) EIP712(EIP712_NAME, EIP712_VERSION) {
        require(_owner != address(0), "ZERO_OWNER");
        require(_mUSD != address(0), "ZERO_MUSD");
        require(_treasuryVault != address(0), "ZERO_TREASURY");
        require(_opsWallet != address(0), "ZERO_OPS");
        require(_dailyPot != address(0), "ZERO_DAILY");
        require(_weeklyPot != address(0), "ZERO_WEEKLY");
        require(_quoteSigner != address(0), "ZERO_SIGNER");

        _transferOwnership(_owner);

        mUSD = _mUSD;
        treasuryVault = _treasuryVault;
        opsWallet = _opsWallet;
        dailyPot = _dailyPot;
        weeklyPot = _weeklyPot;
        quoteSigner = _quoteSigner;

        // Allow mUSD by default
        tokenAllowed[_mUSD] = true;
        _recordToken(_mUSD);
        emit TokenAllowed(_mUSD, true);

        // Default splits (can be changed by owner)
        // KIND_CREDITS: 7% ops, 10% treasury, remaining 83% to payouts (keeps old 85/15 daily/weekly ratio)
        //  - daily: 70.55%
        //  - weekly: 12.45%
        _setKindSplits(KIND_CREDITS, SplitBps({opsBps: 700, dailyBps: 7055, weeklyBps: 1245, treasuryBps: 1000}));

        // PRO mint/renew: 25% ops, 0% daily, 50% weekly, 25% treasury
        _setKindSplits(KIND_PRO_MINT, SplitBps({opsBps: 2500, dailyBps: 0, weeklyBps: 5000, treasuryBps: 2500}));
        _setKindSplits(KIND_PRO_RENEW, SplitBps({opsBps: 2500, dailyBps: 0, weeklyBps: 5000, treasuryBps: 2500}));

        // Generic payments default to treasury (admin can override).
        _setKindSplits(KIND_GENERIC, SplitBps({opsBps: 0, dailyBps: 0, weeklyBps: 0, treasuryBps: 10_000}));
    }

    receive() external payable {}

    // --- Admin ---
    modifier whenNotPaused() {
        require(!paused, "PAUSED");
        _;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    function setQuoteSigner(address signer) external onlyOwner {
        require(signer != address(0), "ZERO_SIGNER");
        quoteSigner = signer;
        emit QuoteSignerSet(signer);
    }

    function setProAvatar(address _proAvatar) external onlyOwner {
        proAvatar = IArcadeProAvatarV2(_proAvatar);
        emit ProAvatarSet(_proAvatar);
    }

    function setTreasuryVault(address vault) external onlyOwner {
        require(vault != address(0), "ZERO_TREASURY");
        treasuryVault = vault;
        emit TreasuryVaultSet(vault);
    }

    function setRecipients(address _opsWallet, address _dailyPot, address _weeklyPot) external onlyOwner {
        require(_opsWallet != address(0), "ZERO_OPS");
        require(_dailyPot != address(0), "ZERO_DAILY");
        require(_weeklyPot != address(0), "ZERO_WEEKLY");
        opsWallet = _opsWallet;
        dailyPot = _dailyPot;
        weeklyPot = _weeklyPot;
        emit RecipientsSet(_opsWallet, _dailyPot, _weeklyPot);
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        require(token != address(0), "ZERO_TOKEN");
        tokenAllowed[token] = allowed;
        if (allowed) {
            _recordToken(token);
        }
        emit TokenAllowed(token, allowed);
    }

    function _recordToken(address token) internal {
        if (!_tokenEverListed[token]) {
            _tokenEverListed[token] = true;
            _tokenList.push(token);
        }
    }

    function setDirectOpsToken(address token, bool enabled) external onlyOwner {
        require(token != address(0), "ZERO_TOKEN");
        directOpsToken[token] = enabled;
        emit DirectOpsTokenSet(token, enabled);
    }

    function setSkuKind(bytes32 sku, uint8 kind) external onlyOwner {
        require(kind != KIND_NONE, "BAD_KIND");
        skuKind[sku] = kind;
        emit SkuKindSet(sku, kind);
    }

    function setKindSplits(uint8 kind, SplitBps calldata splits) external onlyOwner {
        _setKindSplits(kind, splits);
    }

    /// @notice Rescue any ERC20 or ETH accidentally sent to this router.
    /// This router should not custody funds long-term.
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "ZERO_TOKEN");
        require(to != address(0), "ZERO_TO");
        IERC20(token).safeTransfer(to, amount);
    }

    function rescueETH(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "ZERO_TO");
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "ETH_SEND_FAIL");
    }

    function _setKindSplits(uint8 kind, SplitBps memory splits) internal {
        require(kind != KIND_NONE, "BAD_KIND");
        uint256 sum = uint256(splits.opsBps) + uint256(splits.dailyBps) + uint256(splits.weeklyBps) + uint256(splits.treasuryBps);
        require(sum == 10_000, "BPS_SUM");
        kindSplits[kind] = splits;
        emit KindSplitsSet(kind, splits.opsBps, splits.dailyBps, splits.weeklyBps, splits.treasuryBps);
    }

    // --- Quote hashing ---
    function quoteDigest(Quote calldata q) external view returns (bytes32) {
        return _hashTypedDataV4(_structHash(q));
    }

    function _structHash(Quote calldata q) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                q.buyer,
                q.sku,
                q.kind,
                q.payToken,
                q.amountIn,
                q.usdCents,
                q.credits,
                q.tier,
                q.expiresAt,
                q.nonce,
                q.ref,
                q.dataHash
            )
        );
    }

    function _verifyAndConsumeQuote(Quote calldata q, bytes calldata sig) internal returns (bytes32 quoteId) {
        require(q.buyer == msg.sender, "NOT_BUYER");
        require(q.expiresAt >= uint64(block.timestamp), "EXPIRED");

        // If skuKind is configured, enforce it.
        uint8 bound = skuKind[q.sku];
        if (bound != KIND_NONE) {
            require(q.kind == bound, "SKU_KIND_MISMATCH");
        }
        require(q.kind != KIND_NONE, "BAD_KIND");

        // Token allowlist (native ETH: payToken==0, allowed implicitly)
        if (q.payToken != address(0)) {
            require(tokenAllowed[q.payToken], "TOKEN_NOT_ALLOWED");
        }

        quoteId = _hashTypedDataV4(_structHash(q));

        require(!usedQuote[quoteId], "QUOTE_USED");

        address signer = ECDSA.recover(quoteId, sig);
        require(signer == quoteSigner, "BAD_SIGNER");

        usedQuote[quoteId] = true;
    }

    // --- Unified entrypoint (recommended for frontend) ---
    /// @notice Single purchase entrypoint for ALL kinds.
    /// @param data Extra calldata used by some kinds:
    ///             - KIND_PRO_MINT: abi.encode(string tokenURI, bytes32 dnaHash, string nickname)
    ///             - other kinds: pass 0x
    function processPayment(Quote calldata q, bytes calldata sig, bytes calldata data)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 quoteId, bytes memory result)
    {
        return _processPayment(q, sig, data);
    }

    function _processPayment(Quote calldata q, bytes calldata sig, bytes memory data)
        internal
        returns (bytes32 quoteId, bytes memory result)
    {
        if (q.kind == KIND_CREDITS) {
            require(q.credits > 0, "NO_CREDITS");
            quoteId = _executePayment(q, sig);
            emit CreditsPurchased(quoteId, msg.sender, q.credits, q.usdCents, q.ref);
            return (quoteId, bytes(""));
        }

        if (q.kind == KIND_PRO_MINT) {
            require(address(proAvatar) != address(0), "NO_PRO_AVATAR");
            require(q.tier >= 1 && q.tier <= 3, "BAD_TIER");

            (string memory tokenURI, bytes32 dnaHash, string memory nickname) = abi.decode(data, (string, bytes32, string));

            // Bind user-generated metadata to the signed quote.
            // The user can still generate their own PNG + metadata off-chain; this just prevents
            // swapping the payload after the backend priced/signed it.
            require(q.dataHash != bytes32(0), "NO_DATA_HASH");
            require(keccak256(data) == q.dataHash, "DATA_HASH_MISMATCH");

            quoteId = _executePayment(q, sig);
            uint256 tokenId = proAvatar.mintFromRouter(msg.sender, q.tier, tokenURI, dnaHash, nickname);
            emit ProMinted(quoteId, msg.sender, tokenId, q.tier);
            return (quoteId, abi.encode(tokenId));
        }

        if (q.kind == KIND_PRO_RENEW) {
            require(address(proAvatar) != address(0), "NO_PRO_AVATAR");
            require(q.tier >= 1 && q.tier <= 3, "BAD_TIER");

            quoteId = _executePayment(q, sig);
            uint64 newExpiresAt = proAvatar.renewFromRouter(msg.sender, q.tier);
            emit ProRenewed(quoteId, msg.sender, q.tier, newExpiresAt);
            return (quoteId, abi.encode(newExpiresAt));
        }

        // KIND_GENERIC and any future kinds (with configured splits)
        quoteId = _executePayment(q, sig);
        return (quoteId, bytes(""));
    }

    // --- Legacy entrypoints (kept for compatibility) ---
    function purchaseCredits(Quote calldata q, bytes calldata sig)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 quoteId)
    {
        require(q.kind == KIND_CREDITS, "NOT_CREDITS");
        (quoteId,) = _processPayment(q, sig, bytes(""));
    }

    function mintProAvatar(
        Quote calldata q,
        bytes calldata sig,
        string calldata tokenURI,
        bytes32 dnaHash,
        string calldata nickname
    ) external payable nonReentrant whenNotPaused returns (bytes32 quoteId, uint256 tokenId) {
        require(q.kind == KIND_PRO_MINT, "NOT_PRO_MINT");
        bytes memory out;
        (quoteId, out) = _processPayment(q, sig, abi.encode(tokenURI, dnaHash, nickname));
        tokenId = abi.decode(out, (uint256));
    }

    function renewPro(Quote calldata q, bytes calldata sig)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 quoteId, uint64 newExpiresAt)
    {
        require(q.kind == KIND_PRO_RENEW, "NOT_PRO_RENEW");
        bytes memory out;
        (quoteId, out) = _processPayment(q, sig, bytes(""));
        newExpiresAt = abi.decode(out, (uint64));
    }

    /// @notice Generic "pay only" (no mint/renew). Useful for future SKUs.
    /// @dev This intentionally does NOT attempt to mint/renew even if you pass a PRO kind.
    function payOnly(Quote calldata q, bytes calldata sig)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 quoteId)
    {
        quoteId = _executePayment(q, sig);
    }

    // --- Payment execution ---
    function _executePayment(Quote calldata q, bytes calldata sig) internal returns (bytes32 quoteId) {
        quoteId = _verifyAndConsumeQuote(q, sig);

        SplitBps memory s = kindSplits[q.kind];
        require(uint256(s.opsBps) + uint256(s.dailyBps) + uint256(s.weeklyBps) + uint256(s.treasuryBps) == 10_000, "SPLIT_MISSING");

        // Amounts in token units (for event + direct transfers if applicable)
        uint256 opsAmt = (q.amountIn * s.opsBps) / 10_000;
        uint256 dailyAmt = (q.amountIn * s.dailyBps) / 10_000;
        uint256 weeklyAmt = (q.amountIn * s.weeklyBps) / 10_000;
        uint256 treasuryAmt = q.amountIn - opsAmt - dailyAmt - weeklyAmt;

        // "directPotFunding" only when paying in mUSD (pots are denominated in mUSD).
        bool direct = (q.payToken == mUSD);

        // Actual routed amounts (useful for reconciliation).
        uint256 opsRouted = 0;
        uint256 treasuryRouted = 0;

        if (q.payToken == address(0)) {
            // Native ETH (optional support). For ETH, always route to treasury to keep custody simple.
            require(msg.value == q.amountIn, "BAD_MSG_VALUE");
            (bool ok,) = payable(treasuryVault).call{value: q.amountIn}("");
            require(ok, "TREASURY_ETH_FAIL");
            treasuryRouted = q.amountIn;
        } else {
            // ERC20 payments must not send ETH alongside.
            require(msg.value == 0, "NO_NATIVE");

            IERC20 pay = IERC20(q.payToken);

            if (!direct) {
                // Non-mUSD ERC20
                // Default: full amount to treasuryVault (custody), so it can be swapped to mUSD off-chain.
                // Optional: route the OPS portion directly to opsWallet in the same token,
                // while the remainder stays in treasury custody.
                if (directOpsToken[q.payToken] && opsAmt > 0) {
                    pay.safeTransferFrom(msg.sender, opsWallet, opsAmt);
                    opsRouted = opsAmt;

                    uint256 rest = q.amountIn - opsAmt;
                    if (rest > 0) {
                        pay.safeTransferFrom(msg.sender, treasuryVault, rest);
                    }
                    treasuryRouted = rest;
                } else {
                    pay.safeTransferFrom(msg.sender, treasuryVault, q.amountIn);
                    treasuryRouted = q.amountIn;
                }
            } else {
                // mUSD direct allocation
                // Pull once into router then split out.
                pay.safeTransferFrom(msg.sender, address(this), q.amountIn);

                if (opsAmt > 0) {
                    pay.safeTransfer(opsWallet, opsAmt);
                    opsRouted = opsAmt;
                }
                if (dailyAmt > 0) pay.safeTransfer(dailyPot, dailyAmt);
                if (weeklyAmt > 0) pay.safeTransfer(weeklyPot, weeklyAmt);
                if (treasuryAmt > 0) {
                    pay.safeTransfer(treasuryVault, treasuryAmt);
                    treasuryRouted = treasuryAmt;
                }
            }
        }

        emit PaymentExecuted(
            quoteId,
            msg.sender,
            q.sku,
            q.kind,
            q.payToken,
            q.amountIn,
            q.usdCents,
            q.credits,
            q.tier,
            opsAmt,
            dailyAmt,
            weeklyAmt,
            treasuryAmt,
            opsRouted,
            treasuryRouted,
            direct,
            q.ref
        );
    }
}
