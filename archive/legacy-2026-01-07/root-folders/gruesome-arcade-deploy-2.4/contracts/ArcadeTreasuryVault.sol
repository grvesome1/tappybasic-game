// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Minimal UniswapV3/PancakeV3-compatible router interface.
///      Works with PancakeSwap v3 SwapRouter on Linea (Uniswap V3-style).
interface IV3SwapRouter {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    struct ExactOutputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);

    function exactOutput(ExactOutputParams calldata params) external payable returns (uint256 amountIn);

    function refundETH() external payable;
}

/// @notice Treasury vault for holding ANY ERC20 + native ETH.
/// @dev v2.4 adds a *keeper-limited* swap+funding module so the treasury can auto-convert
///      ETH and LINEA (ERC20) into mUSD to keep payout vaults funded.
///
/// Security model:
/// - `owner` SHOULD be a multisig Safe.
/// - `keeper` is a hot key used by automation.
/// - keeper can ONLY:
///   - swap configured "autoConvertToken" assets into `mUSD`
///   - deliver `mUSD` ONLY to allowlisted payout vaults
/// - keeper CANNOT withdraw arbitrary tokens/ETH to arbitrary addresses.
contract ArcadeTreasuryVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------
    // Admin / roles
    // ---------------------------

    /// @notice Automation key allowed to run swaps + fund payout vaults.
    address public keeper;

    modifier onlyKeeperOrOwner() {
        require(msg.sender == keeper || msg.sender == owner(), "NOT_AUTH");
        _;
    }

    // ---------------------------
    // Treasury metadata
    // ---------------------------

    /// @notice Optional labeling for "reserve" tokens the treasury intends to hold long-term
    ///         (e.g., TBAG / RUSTYAI buyback treasury holdings).
    mapping(address => bool) public reserveToken;

    /// @notice Tokens allowed to be auto-converted into mUSD by the keeper.
    /// @dev Use address(0) to represent native ETH.
    mapping(address => bool) public autoConvertToken;

    /// @notice Allowlist of payout vaults that may receive mUSD from keeper actions.
    mapping(address => bool) public payoutVault;

    // ---------------------------
    // Swap configuration
    // ---------------------------

    /// @notice Payout stable token used by epoch vaults.
    address public mUSD;

    /// @notice Wrapped ETH on the current chain.
    /// @dev For Linea mainnet WETH is deployed by Linea team (commonly used in DEX routing).
    address public WETH;

    /// @notice UniswapV3/PancakeV3-compatible router used for swaps.
    address public swapRouter;

    /// @notice Encoded path for exactOutput swaps to mUSD.
    /// @dev Key is the INPUT ASSET the treasury is spending:
    ///      - address(0) for native ETH (path should end in WETH)
    ///      - LINEA token address for LINEA->...->mUSD
    ///
    /// Path encoding for exactOutput: tokenOut, fee, tokenIn (reversed order).
    mapping(address => bytes) public exactOutPathToMUSD;

    /// @notice Optional per-asset cap for amountInMaximum in swaps.
    /// @dev Key is tokenIn (address(0) for ETH). 0 = no cap.
    mapping(address => uint256) public maxSwapIn;

    // ---------------------------
    // Events
    // ---------------------------

    event KeeperSet(address indexed oldKeeper, address indexed newKeeper);
    event ReserveTokenSet(address indexed token, bool enabled);
    event AutoConvertTokenSet(address indexed token, bool enabled);
    event PayoutVaultSet(address indexed vault, bool allowed);
    event SwapConfigSet(address indexed mUSD, address indexed WETH, address indexed router);
    event ExactOutPathSet(address indexed tokenIn, bytes path);
    event MaxSwapInSet(address indexed tokenIn, uint256 maxAmountIn);

    event TreasuryWithdrawERC20(address indexed token, address indexed to, uint256 amount);
    event TreasuryWithdrawETH(address indexed to, uint256 amount);
    event TreasuryBatchWithdrawERC20(address indexed token, uint256 count, uint256 totalAmount);
    event TreasuryBatchWithdrawETH(uint256 count, uint256 totalAmount);

    /// @notice Emitted when the keeper performs a swap that delivers mUSD into a payout vault.
    event TreasurySwapToMUSD(
        address indexed tokenIn,
        address indexed payoutVault,
        uint256 amountInUsed,
        uint256 amountOut,
        uint256 deadline
    );

    /// @notice Emitted when the keeper directly funds a payout vault with existing mUSD.
    event TreasuryFundedVault(address indexed payoutVault, uint256 amount);

    // ---------------------------
    // Constructor
    // ---------------------------

    constructor(address initialOwner) {
        require(initialOwner != address(0), "ZERO_OWNER");
        _transferOwnership(initialOwner);
    }

    receive() external payable {}

    // ---------------------------
    // Admin setters (multisig)
    // ---------------------------

    function setKeeper(address newKeeper) external onlyOwner {
        address old = keeper;
        keeper = newKeeper;
        emit KeeperSet(old, newKeeper);
    }

    /// @notice Mark a token as a "reserve" token for UI + reporting.
    /// @dev This does not restrict deposits; it is purely metadata.
    function setReserveToken(address token, bool enabled) external onlyOwner {
        require(token != address(0), "ZERO_TOKEN");
        reserveToken[token] = enabled;
        emit ReserveTokenSet(token, enabled);
    }

    /// @notice Allow (or disallow) the keeper to auto-convert an asset into mUSD.
    /// @dev token==address(0) represents native ETH.
    function setAutoConvertToken(address token, bool enabled) external onlyOwner {
        autoConvertToken[token] = enabled;
        emit AutoConvertTokenSet(token, enabled);
    }

    /// @notice Allow (or disallow) a payout vault address to receive mUSD via keeper actions.
    function setPayoutVault(address vault, bool allowed) external onlyOwner {
        require(vault != address(0), "ZERO_VAULT");
        payoutVault[vault] = allowed;
        emit PayoutVaultSet(vault, allowed);
    }

    /// @notice Configure swap router + core assets.
    /// @dev Can be updated as DEX routing changes.
    function setSwapConfig(address _mUSD, address _WETH, address _router) external onlyOwner {
        require(_mUSD != address(0), "ZERO_MUSD");
        require(_WETH != address(0), "ZERO_WETH");
        require(_router != address(0), "ZERO_ROUTER");
        mUSD = _mUSD;
        WETH = _WETH;
        swapRouter = _router;
        emit SwapConfigSet(_mUSD, _WETH, _router);
    }

    /// @notice Set the exactOutput path that ends in tokenIn and starts from mUSD.
    function setExactOutPathToMUSD(address tokenIn, bytes calldata path) external onlyOwner {
        require(path.length > 0, "EMPTY_PATH");
        exactOutPathToMUSD[tokenIn] = path;
        emit ExactOutPathSet(tokenIn, path);
    }

    /// @notice Set an optional per-swap input cap for an asset (0 = unlimited).
    function setMaxSwapIn(address tokenIn, uint256 maxAmountIn) external onlyOwner {
        maxSwapIn[tokenIn] = maxAmountIn;
        emit MaxSwapInSet(tokenIn, maxAmountIn);
    }

    // ---------------------------
    // Keeper actions (automation)
    // ---------------------------

    /// @notice Directly fund a payout vault with existing mUSD held in treasury.
    function fundVaultMUSD(address vault, uint256 amount) external onlyKeeperOrOwner nonReentrant {
        require(payoutVault[vault], "BAD_VAULT");
        require(mUSD != address(0), "NO_MUSD");
        IERC20(mUSD).safeTransfer(vault, amount);
        emit TreasuryFundedVault(vault, amount);
    }

    /// @notice Swap native ETH (from treasury balance) to receive EXACT `amountOut` mUSD in a payout vault.
    /// @dev Uses exactOutput; any unused ETH is refunded back to treasury via router.refundETH().
    /// @param vault Must be allowlisted by `setPayoutVault`.
    /// @param amountOut Exact mUSD to deliver to the payout vault.
    /// @param amountInMaximum Maximum ETH to spend.
    /// @param deadline Timestamp after which the swap is invalid.
    function swapETHForExactMUSDToVault(
        address vault,
        uint256 amountOut,
        uint256 amountInMaximum,
        uint256 deadline
    ) external onlyKeeperOrOwner nonReentrant returns (uint256 amountInUsed) {
        require(payoutVault[vault], "BAD_VAULT");
        require(autoConvertToken[address(0)], "ETH_AUTOCONVERT_OFF");
        require(mUSD != address(0) && WETH != address(0) && swapRouter != address(0), "SWAP_NOT_CONFIGURED");

        bytes memory path = exactOutPathToMUSD[address(0)];
        require(path.length > 0, "NO_PATH");
        require(amountOut > 0, "BAD_OUT");
        require(amountInMaximum > 0, "BAD_MAX_IN");

        uint256 cap = maxSwapIn[address(0)];
        if (cap != 0) require(amountInMaximum <= cap, "MAX_IN_CAP");
        require(address(this).balance >= amountInMaximum, "INSUFFICIENT_ETH");

        uint256 beforeBal = IERC20(mUSD).balanceOf(vault);

        IV3SwapRouter.ExactOutputParams memory params = IV3SwapRouter.ExactOutputParams({
            path: path,
            recipient: vault,
            deadline: deadline,
            amountOut: amountOut,
            amountInMaximum: amountInMaximum
        });

        amountInUsed = IV3SwapRouter(swapRouter).exactOutput{value: amountInMaximum}(params);

        // Refund unused ETH (if any) back to this treasury.
        IV3SwapRouter(swapRouter).refundETH();

        uint256 afterBal = IERC20(mUSD).balanceOf(vault);
        require(afterBal >= beforeBal + amountOut, "BAD_MUSD_OUT");

        emit TreasurySwapToMUSD(address(0), vault, amountInUsed, amountOut, deadline);
    }

    /// @notice Swap an ERC20 token held by the treasury into EXACT `amountOut` mUSD in a payout vault.
    /// @dev Uses exactOutput and resets allowance to 0 after.
    function swapTokenForExactMUSDToVault(
        address tokenIn,
        address vault,
        uint256 amountOut,
        uint256 amountInMaximum,
        uint256 deadline
    ) external onlyKeeperOrOwner nonReentrant returns (uint256 amountInUsed) {
        require(tokenIn != address(0), "BAD_TOKEN");
        require(payoutVault[vault], "BAD_VAULT");
        require(autoConvertToken[tokenIn], "TOKEN_AUTOCONVERT_OFF");
        require(mUSD != address(0) && swapRouter != address(0), "SWAP_NOT_CONFIGURED");

        bytes memory path = exactOutPathToMUSD[tokenIn];
        require(path.length > 0, "NO_PATH");
        require(amountOut > 0, "BAD_OUT");
        require(amountInMaximum > 0, "BAD_MAX_IN");

        uint256 cap = maxSwapIn[tokenIn];
        if (cap != 0) require(amountInMaximum <= cap, "MAX_IN_CAP");

        IERC20 inToken = IERC20(tokenIn);
        require(inToken.balanceOf(address(this)) >= amountInMaximum, "INSUFFICIENT_IN_TOKEN");

        uint256 beforeBal = IERC20(mUSD).balanceOf(vault);

        // Approve exact max amount for this swap.
        inToken.safeApprove(swapRouter, 0);
        inToken.safeApprove(swapRouter, amountInMaximum);

        IV3SwapRouter.ExactOutputParams memory params = IV3SwapRouter.ExactOutputParams({
            path: path,
            recipient: vault,
            deadline: deadline,
            amountOut: amountOut,
            amountInMaximum: amountInMaximum
        });

        amountInUsed = IV3SwapRouter(swapRouter).exactOutput(params);

        // Remove allowance after swap.
        inToken.safeApprove(swapRouter, 0);

        uint256 afterBal = IERC20(mUSD).balanceOf(vault);
        require(afterBal >= beforeBal + amountOut, "BAD_MUSD_OUT");

        emit TreasurySwapToMUSD(tokenIn, vault, amountInUsed, amountOut, deadline);
    }

    // ---------------------------
    // Owner withdrawals (manual ops)
    // ---------------------------

    function withdrawERC20(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(token != address(0), "ZERO_TOKEN");
        require(to != address(0), "ZERO_TO");
        IERC20(token).safeTransfer(to, amount);
        emit TreasuryWithdrawERC20(token, to, amount);
    }

    function withdrawETH(address payable to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "ZERO_TO");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "ETH_SEND_FAILED");
        emit TreasuryWithdrawETH(to, amount);
    }

    /// @notice Batch ERC20 payouts (useful for small winner sets, refunds, manual adjustments).
    /// @dev For large winner sets, prefer ArcadeEpochVault Merkle claims.
    function batchWithdrawERC20(
        address token,
        address[] calldata to,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        require(token != address(0), "ZERO_TOKEN");
        require(to.length == amounts.length, "LEN_MISMATCH");

        uint256 total;
        for (uint256 i = 0; i < to.length; i++) {
            address dst = to[i];
            require(dst != address(0), "ZERO_TO");
            uint256 amt = amounts[i];
            total += amt;
            IERC20(token).safeTransfer(dst, amt);
        }

        emit TreasuryBatchWithdrawERC20(token, to.length, total);
    }

    /// @notice Batch ETH payouts.
    /// @dev Use sparingly (gas can spike). For large sets, prefer claim-based payouts.
    function batchWithdrawETH(
        address[] calldata to,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        require(to.length == amounts.length, "LEN_MISMATCH");

        uint256 total;
        for (uint256 i = 0; i < to.length; i++) {
            address payable dst = payable(to[i]);
            require(dst != address(0), "ZERO_TO");
            uint256 amt = amounts[i];
            total += amt;
            (bool ok,) = dst.call{value: amt}("");
            require(ok, "ETH_SEND_FAILED");
        }

        emit TreasuryBatchWithdrawETH(to.length, total);
    }
}
