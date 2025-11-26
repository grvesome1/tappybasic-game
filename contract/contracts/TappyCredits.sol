// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/*
 * Minimal credit contract for Tappy Rocket on Linea.
 *
 * Players can buy play credits with ETH at a fixed price of 5,000,000,000,000 wei (0.000005 ETH).
 * Credits are stored per user and can be consumed by the admin backend when a game starts.
 *
 * This contract exposes a `creditPriceETH()` view to remain compatible with existing
 * front‑end integrations that expect to read the credit price from a smart contract.
 *
 * built by gruesøme
 * Signature: YnVpbHQgYnkgZ3J1ZXPDuG1l
 */

contract TappyCredits {
    // Address with admin privileges (owner).
    address public owner;

    // Fixed credit price: 5,000,000,000,000 wei (0.000005 ETH).
    // Declared as a constant for efficiency and clarity.
    uint256 public constant CREDIT_PRICE_WEI = 5_000_000_000_000;

    // Mapping to track credits purchased by each address.
    mapping(address => uint256) public credits;

    // Event emitted when a user purchases credits.
    event CreditsPurchased(address indexed user, uint256 amount, uint256 cost);

    // Event emitted when the owner withdraws the contract’s ETH balance.
    event Withdrawn(address indexed owner, uint256 amount);

    // Modifier to restrict functions to the contract owner.
    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    /**
     * @dev Constructor sets the deploying address as the owner.
     */
    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Purchase `amount` of credits with ETH.  Excess ETH is refunded.
     * @param amount Number of credits to purchase.
     */
    function purchaseCreditsWithETH(uint256 amount) external payable {
        require(amount > 0, "Amount must be greater than zero");
        uint256 requiredWei = CREDIT_PRICE_WEI * amount;
        require(msg.value >= requiredWei, "Insufficient ETH sent");

        // Increase the buyer’s credit balance.
        credits[msg.sender] += amount;
        emit CreditsPurchased(msg.sender, amount, requiredWei);

        // Refund any overpayment.
        uint256 excess = msg.value - requiredWei;
        if (excess > 0) {
            payable(msg.sender).transfer(excess);
        }
    }

    /**
     * @dev View function to return the credit price in wei.  Maintains API compatibility
     *      with front‑end code expecting `creditPriceETH()`.
     * @return The fixed credit price (wei).
     */
    function creditPriceETH() external pure returns (uint256) {
        return CREDIT_PRICE_WEI;
    }

    /**
     * @dev Withdraw the entire ETH balance to the owner.
     */
    function withdrawAll() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        emit Withdrawn(owner, balance);
        payable(owner).transfer(balance);
    }

    /**
     * @dev Admin function to consume credits on behalf of a user.  Typically called
     *      by the backend when a game session starts.
     * @param user Address whose credits are to be consumed.
     * @param amount Number of credits to consume.
     */
    function consumeCredit(address user, uint256 amount) external onlyOwner {
        require(user != address(0), "Invalid user address");
        require(amount > 0, "Amount must be greater than zero");
        require(credits[user] >= amount, "Insufficient credits");
        credits[user] -= amount;
    }

    /**
     * @dev Transfer ownership to a new address.  New owner cannot be the zero address.
     * @param newOwner Address of the new owner.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is the zero address");
        owner = newOwner;
    }
}