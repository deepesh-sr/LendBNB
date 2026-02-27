// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IFlashLoanReceiver.sol";
import "./LendingProtocol.sol";

/// @title FlashLoanLiquidator -- Executes flash-loan-assisted liquidations
/// @notice Used by the liquidation bot to liquidate without upfront capital
contract FlashLoanLiquidator is IFlashLoanReceiver {
    using SafeERC20 for IERC20;

    LendingProtocol public immutable protocol;
    address public immutable owner;

    constructor(address _protocol) {
        protocol = LendingProtocol(_protocol);
        owner = msg.sender;
    }

    /// @notice Initiate a flash loan liquidation
    /// @param marketId The market with the unhealthy position
    /// @param borrower The borrower to liquidate
    /// @param repayAmount Amount of debt to repay
    function initiateLiquidation(
        uint256 marketId,
        address borrower,
        uint256 repayAmount
    ) external {
        bytes memory data = abi.encode(borrower, repayAmount);
        protocol.flashLoan(marketId, repayAmount, address(this), data);
    }

    /// @notice Flash loan callback -- executes the liquidation
    function executeOperation(
        uint256 marketId,
        uint256 amount,
        uint256 fee,
        address initiator,
        bytes calldata data
    ) external override returns (bool) {
        require(msg.sender == address(protocol), "Only protocol");

        (address borrower, uint256 repayAmount) = abi.decode(data, (address, uint256));

        // Get market info
        LendingProtocol.Market memory market = protocol.getMarket(marketId);

        // Approve protocol to take repayment
        IERC20(market.supplyToken).approve(address(protocol), repayAmount);

        // Execute liquidation -- we repay debt and receive collateral
        protocol.liquidate(marketId, borrower, repayAmount);

        // Now we have collateral tokens. In production, we'd swap via PancakeSwap.
        // For hackathon demo, assume the collateral received covers the loan + fee.
        // The profit remains in this contract.

        // Approve flash loan repayment (amount + fee)
        IERC20(market.supplyToken).approve(address(protocol), amount + fee);

        // Transfer the repayment back to protocol
        IERC20(market.supplyToken).safeTransfer(address(protocol), amount + fee);

        return true;
    }

    /// @notice Withdraw accumulated profits
    function withdrawProfit(address token) external {
        require(msg.sender == owner, "Only owner");
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(owner, balance);
        }
    }
}
