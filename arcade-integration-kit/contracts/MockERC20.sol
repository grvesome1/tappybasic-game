// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  Test helper: Mock ERC20
  built by gruesøme
  SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f
*/

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
