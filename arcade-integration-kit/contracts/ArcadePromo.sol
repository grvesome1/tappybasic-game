// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  Gruesøme's Arcade — Promo Claims (on-chain receipt)
  built by gruesøme
  SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

  Purpose:
  - Provide a gas-paid, publicly verifiable "promo claim" transaction
  - Enforce one-claim-per-address-per-game (configurable by admin)
  - Emit a receipt event that the Web2 ledger uses to credit promo AC

  Notes:
  - This contract does NOT maintain an on-chain AC balance (v1 design).
  - Game IDs are bytes32 (typically keccak256 of the string id, e.g. keccak256("moonshot")).
*/

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract ArcadePromo is AccessControl, Pausable {
    // Roles
    bytes32 public constant PARAM_ROLE = keccak256("PARAM_ROLE");
    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");

    // Promo grant amount per gameId (AC units).
    mapping(bytes32 => uint256) public promoGrantAC;

    // claimed[user][gameId] = true once claimed
    mapping(address => mapping(bytes32 => bool)) public claimed;

    event PromoConfigured(bytes32 indexed gameId, uint256 grantAC);
    event PromoClaimed(address indexed user, bytes32 indexed gameId, uint256 grantAC, bytes32 indexed ref);

    error NoPromoConfigured();
    error AlreadyClaimed();
    error BadParams();

    constructor(address admin) {
        if (admin == address(0)) admin = msg.sender;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PARAM_ROLE, admin);
        _grantRole(PAUSE_ROLE, admin);
    }

    function pause() external onlyRole(PAUSE_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSE_ROLE) {
        _unpause();
    }

    function setPromo(bytes32 gameId, uint256 grantAC) external onlyRole(PARAM_ROLE) {
        if (gameId == bytes32(0)) revert BadParams();
        // grantAC can be 0 to disable promo
        promoGrantAC[gameId] = grantAC;
        emit PromoConfigured(gameId, grantAC);
    }

    function claimPromo(bytes32 gameId, bytes32 ref) external whenNotPaused returns (uint256 grantAC) {
        grantAC = promoGrantAC[gameId];
        if (grantAC == 0) revert NoPromoConfigured();
        if (claimed[msg.sender][gameId]) revert AlreadyClaimed();

        claimed[msg.sender][gameId] = true;
        emit PromoClaimed(msg.sender, gameId, grantAC, ref);
    }
}
