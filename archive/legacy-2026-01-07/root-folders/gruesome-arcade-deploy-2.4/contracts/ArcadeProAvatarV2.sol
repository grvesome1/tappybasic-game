// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Arcade PRO Avatar (SBT-first) with nickname.
/// @dev Payment is handled by ArcadePaymentsRouterV2. This contract is only "mint/renew state".
contract ArcadeProAvatarV2 is Ownable {
    // --- ERC721 minimal ---
    string public name = "Arcade PRO Avatar (v2)";
    string public symbol = "APROA";

    mapping(uint256 => address) internal _ownerOf;
    mapping(address => uint256) internal _balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event Transfer(address indexed from, address indexed to, uint256 indexed id);
    event Approval(address indexed owner, address indexed spender, uint256 indexed id);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    // --- Identity / membership ---
    uint256 public nextTokenId = 1;
    mapping(address => uint256) public tokenIdByOwner;

    mapping(uint256 => string) public tokenURIById;
    mapping(uint256 => bytes32) public dnaHashById;
    mapping(uint256 => string) public nicknameById;

    // Membership tier + expiry (UTC seconds)
    mapping(uint256 => uint8) public membershipTierById;
    mapping(uint256 => uint64) public membershipExpiresAtById;

    // Router allowed to mint/renew
    address public paymentsRouter;

    // SBT lock toggle
    bool public transfersUnlocked;

    // "Lifetime" cutoff (defaults to 2026-01-30 00:00:00 UTC)
    uint64 public lifetimeCutoff = 1769731200;

    event RouterSet(address indexed router);
    event TransfersUnlockedSet(bool unlocked);
    event LifetimeCutoffSet(uint64 cutoff);

    event ProMinted(address indexed user, uint256 indexed tokenId, uint8 tier, uint64 expiresAt, string nickname);
    event ProRenewed(address indexed user, uint256 indexed tokenId, uint8 tier, uint64 expiresAt);

    modifier onlyRouter() {
        require(msg.sender == paymentsRouter, "NOT_ROUTER");
        _;
    }

    constructor(address _owner) {
        require(_owner != address(0), "ZERO_OWNER");
        _transferOwnership(_owner);
    }

    // --- ERC721 views ---
    function ownerOf(uint256 id) public view returns (address owner_) {
        owner_ = _ownerOf[id];
        require(owner_ != address(0), "NOT_MINTED");
    }

    function balanceOf(address owner_) public view returns (uint256) {
        require(owner_ != address(0), "ZERO_OWNER");
        return _balanceOf[owner_];
    }

    function tokenURI(uint256 id) public view returns (string memory) {
        require(_ownerOf[id] != address(0), "NOT_MINTED");
        return tokenURIById[id];
    }

    // --- ERC721 approvals (blocked while SBT locked) ---
    function approve(address spender, uint256 id) public {
        require(transfersUnlocked, "SBT_LOCKED");
        address owner_ = ownerOf(id);
        require(msg.sender == owner_ || isApprovedForAll[owner_][msg.sender], "NOT_AUTH");
        getApproved[id] = spender;
        emit Approval(owner_, spender, id);
    }

    function setApprovalForAll(address operator, bool approved) public {
        require(transfersUnlocked, "SBT_LOCKED");
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 id) public {
        require(transfersUnlocked, "SBT_LOCKED");
        require(from == ownerOf(id), "WRONG_FROM");
        require(to != address(0), "ZERO_TO");
        require(
            msg.sender == from || msg.sender == getApproved[id] || isApprovedForAll[from][msg.sender],
            "NOT_AUTH"
        );

        _beforeTokenTransfer(from, to, id);

        unchecked {
            _balanceOf[from]--;
            _balanceOf[to]++;
        }
        _ownerOf[id] = to;
        delete getApproved[id];

        emit Transfer(from, to, id);
    }

    /// @dev Keep the 1-per-wallet invariant.
    function _beforeTokenTransfer(address from, address to, uint256 id) internal {
        // If minting, from == 0.
        if (from != address(0)) {
            // clear old owner mapping
            tokenIdByOwner[from] = 0;
        }
        if (to != address(0)) {
            // enforce one token per wallet
            require(tokenIdByOwner[to] == 0, "ONE_PER_WALLET");
            tokenIdByOwner[to] = id;
        }
    }

    // --- Router-admin configuration ---
    function setPaymentsRouter(address router) external onlyOwner {
        paymentsRouter = router;
        emit RouterSet(router);
    }

    function setTransfersUnlocked(bool unlocked) external onlyOwner {
        transfersUnlocked = unlocked;
        emit TransfersUnlockedSet(unlocked);
    }

    function setLifetimeCutoff(uint64 cutoff) external onlyOwner {
        lifetimeCutoff = cutoff;
        emit LifetimeCutoffSet(cutoff);
    }

    // --- Membership helpers ---
    function isProActive(address user) external view returns (bool) {
        uint256 id = tokenIdByOwner[user];
        if (id == 0) return false;
        return membershipExpiresAtById[id] >= uint64(block.timestamp);
    }

    function proStatus(address user) external view returns (uint256 tokenId, uint8 tier, uint64 expiresAt, bool active) {
        tokenId = tokenIdByOwner[user];
        if (tokenId == 0) {
            tier = 0;
            expiresAt = 0;
            active = false;
            return (tokenId, tier, expiresAt, active);
        }
        tier = membershipTierById[tokenId];
        expiresAt = membershipExpiresAtById[tokenId];
        active = expiresAt >= uint64(block.timestamp);
    }

    // --- Router entrypoints ---
    /// @notice Mint a PRO Avatar (one per wallet).
    /// @dev Payment happens in the PaymentsRouter; this is state-only.
    function mintFromRouter(
        address to,
        uint8 tier,
        string calldata _tokenURI,
        bytes32 dnaHash,
        string calldata nickname
    ) external onlyRouter returns (uint256 tokenId) {
        require(to != address(0), "ZERO_TO");
        require(tokenIdByOwner[to] == 0, "ALREADY_HAS_TOKEN");
        require(tier >= 1 && tier <= 3, "BAD_TIER");
        require(bytes(nickname).length <= 24, "NICK_TOO_LONG");

        tokenId = nextTokenId++;
        _beforeTokenTransfer(address(0), to, tokenId);

        _balanceOf[to] = 1;
        _ownerOf[tokenId] = to;

        tokenURIById[tokenId] = _tokenURI;
        dnaHashById[tokenId] = dnaHash;
        nicknameById[tokenId] = nickname;

        membershipTierById[tokenId] = tier;
        uint64 expiresAt = _computeNewExpiry(uint64(block.timestamp), tier, true);
        membershipExpiresAtById[tokenId] = expiresAt;

        emit Transfer(address(0), to, tokenId);
        emit ProMinted(to, tokenId, tier, expiresAt, nickname);
    }

    /// @notice Renew/extend PRO membership for an existing token.
    function renewFromRouter(address user, uint8 tier) external onlyRouter returns (uint64 newExpiresAt) {
        require(user != address(0), "ZERO_USER");
        uint256 tokenId = tokenIdByOwner[user];
        require(tokenId != 0, "NO_TOKEN");
        require(tier >= 1 && tier <= 3, "BAD_TIER");

        uint64 base = membershipExpiresAtById[tokenId];
        if (base < uint64(block.timestamp)) base = uint64(block.timestamp);

        newExpiresAt = _computeNewExpiry(base, tier, false);
        membershipTierById[tokenId] = tier;
        membershipExpiresAtById[tokenId] = newExpiresAt;

        emit ProRenewed(user, tokenId, tier, newExpiresAt);
    }

    /// @dev "Tier 3 = lifetime until cutoff; after cutoff, annual".
    function _computeNewExpiry(uint64 base, uint8 tier, bool isMint) internal view returns (uint64) {
        if (tier == 1 || tier == 2) {
            // 30 days
            return base + uint64(30 days);
        }
        // tier == 3
        if (uint64(block.timestamp) < lifetimeCutoff) {
            // Before cutoff, tier 3 means "active until cutoff" (one-time).
            // On renew (or mint), we just set expiry to cutoff.
            return lifetimeCutoff;
        }
        // After cutoff: annual
        return base + uint64(365 days);
    }
}
