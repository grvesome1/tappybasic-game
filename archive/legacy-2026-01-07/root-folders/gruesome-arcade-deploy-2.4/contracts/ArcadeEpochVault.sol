// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  Gruesøme's Arcade — Epoch Vault (Merkle claims in mUSD)
  built by gruesøme
  SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

  Purpose:
  - Hold reward token (mUSD on Linea)
  - Publish daily epoch distributions as a Merkle root (one root per YYYYMMDD)
  - Let users claim with user-paid gas
  - Use an oracle signature so publishing can be permissionless but still authorized

  Design notes:
  - Root publishing is permissionless but must include a valid EIP-712 signature by oracleSigner.
  - Claims use the classic (index, account, amount) MerkleDistributor pattern to enable bitmaps.
*/

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ArcadeEpochVault is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // Roles
    bytes32 public constant PARAM_ROLE = keccak256("PARAM_ROLE");
    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");
    bytes32 public constant SWEEP_ROLE = keccak256("SWEEP_ROLE");

    IERC20 public immutable rewardToken; // mUSD

    address public oracleSigner;

    // EIP-712 typed data
    bytes32 private constant EPOCH_TYPEHASH = keccak256("Epoch(uint32 ymd,bytes32 root,uint256 totalAmount)");

    struct Epoch {
        bytes32 root;
        uint256 totalAmount;
        uint256 totalClaimed;
        uint64 publishedAt;
    }

    // epochs[ymd] => epoch record
    mapping(uint32 => Epoch) public epochs;

    // claimedBitMap[ymd][wordIndex] => 256-bit word
    mapping(uint32 => mapping(uint256 => uint256)) private claimedBitMap;

    event EpochPublished(uint32 indexed ymd, bytes32 indexed root, uint256 totalAmount, address indexed publisher);
    event Claimed(uint32 indexed ymd, uint256 indexed index, address indexed account, uint256 amount);
    event OracleSignerUpdated(address indexed oldSigner, address indexed newSigner);

    error BadSignature();
    error EpochAlreadyPublished();
    error EpochNotPublished();
    error AlreadyClaimed();
    error InvalidProof();
    error BadParams();

    constructor(address admin, address rewardToken_, address oracleSigner_)
        EIP712("GruesomeArcadeEpochVault", "1")
    {
        if (admin == address(0)) admin = msg.sender;
        if (rewardToken_ == address(0) || oracleSigner_ == address(0)) revert BadParams();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PARAM_ROLE, admin);
        _grantRole(PAUSE_ROLE, admin);
        _grantRole(SWEEP_ROLE, admin);

        rewardToken = IERC20(rewardToken_);
        oracleSigner = oracleSigner_;
    }

    function pause() external onlyRole(PAUSE_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSE_ROLE) {
        _unpause();
    }

    function setOracleSigner(address newSigner) external onlyRole(PARAM_ROLE) {
        if (newSigner == address(0)) revert BadParams();
        address old = oracleSigner;
        oracleSigner = newSigner;
        emit OracleSignerUpdated(old, newSigner);
    }

    // --- Publish (permissionless, signature-authorized) ---
    function publishEpoch(uint32 ymd, bytes32 root, uint256 totalAmount, bytes calldata oracleSig)
        external
        whenNotPaused
    {
        if (ymd == 0 || root == bytes32(0)) revert BadParams();
        if (epochs[ymd].root != bytes32(0)) revert EpochAlreadyPublished();

        bytes32 structHash = keccak256(abi.encode(EPOCH_TYPEHASH, ymd, root, totalAmount));
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, oracleSig);
        if (recovered != oracleSigner) revert BadSignature();

        epochs[ymd] = Epoch({
            root: root,
            totalAmount: totalAmount,
            totalClaimed: 0,
            publishedAt: uint64(block.timestamp)
        });

        emit EpochPublished(ymd, root, totalAmount, msg.sender);
    }

    // --- Claim helpers (bitmap) ---
    function isClaimed(uint32 ymd, uint256 index) public view returns (bool) {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        uint256 word = claimedBitMap[ymd][wordIndex];
        uint256 mask = (1 << bitIndex);
        return word & mask == mask;
    }

    function _setClaimed(uint32 ymd, uint256 index) internal {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        claimedBitMap[ymd][wordIndex] = claimedBitMap[ymd][wordIndex] | (1 << bitIndex);
    }

    // --- Claim ---
    function claim(
        uint32 ymd,
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external whenNotPaused nonReentrant {
        Epoch memory ep = epochs[ymd];
        if (ep.root == bytes32(0)) revert EpochNotPublished();
        if (isClaimed(ymd, index)) revert AlreadyClaimed();

        // Leaf: keccak256(abi.encodePacked(index, account, amount))
        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        if (!MerkleProof.verify(merkleProof, ep.root, node)) revert InvalidProof();

        _setClaimed(ymd, index);

        // Effects before interaction
        epochs[ymd].totalClaimed = ep.totalClaimed + amount;

        // Transfer reward token
        rewardToken.safeTransfer(account, amount);

        emit Claimed(ymd, index, account, amount);
    }


    /// @notice Batch claim helper. Anyone may call (tokens always go to the listed accounts).
    /// @dev Useful for "automatic" payouts by a relayer (at the cost of gas).
    ///      For large winner sets, prefer letting users self-claim.
    function claimMany(
        uint32 ymd,
        uint256[] calldata indices,
        address[] calldata accounts,
        uint256[] calldata amounts,
        bytes32[][] calldata merkleProofs
    ) external whenNotPaused nonReentrant {
        if (indices.length == 0) revert BadParams();
        if (indices.length != accounts.length) revert BadParams();
        if (indices.length != amounts.length) revert BadParams();
        if (indices.length != merkleProofs.length) revert BadParams();

        Epoch memory ep = epochs[ymd];
        if (ep.root == bytes32(0)) revert EpochNotPublished();

        uint256 totalClaimed_ = ep.totalClaimed;

        for (uint256 i = 0; i < indices.length; i++) {
            uint256 index = indices[i];
            address account = accounts[i];
            uint256 amount = amounts[i];

            if (isClaimed(ymd, index)) revert AlreadyClaimed();

            // Leaf: keccak256(abi.encodePacked(index, account, amount))
            bytes32 node = keccak256(abi.encodePacked(index, account, amount));
            if (!MerkleProof.verify(merkleProofs[i], ep.root, node)) revert InvalidProof();

            _setClaimed(ymd, index);
            totalClaimed_ += amount;

            rewardToken.safeTransfer(account, amount);
            emit Claimed(ymd, index, account, amount);
        }

        epochs[ymd].totalClaimed = totalClaimed_;
    }

    // --- Admin sweep (safety) ---
    function sweepERC20(address token, address to, uint256 amount) external onlyRole(SWEEP_ROLE) nonReentrant {
        require(to != address(0), "bad_to");
        IERC20(token).safeTransfer(to, amount);
    }
}
