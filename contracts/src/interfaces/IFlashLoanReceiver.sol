// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IFlashLoanReceiver -- Callback interface for flash loan receivers
/// @notice Ported from MetaLend's flash_loan.rs callback pattern
interface IFlashLoanReceiver {
    /// @notice Called by LendingProtocol after flash loan funds are transferred
    /// @param marketId The market from which funds were borrowed
    /// @param amount The amount of tokens borrowed
    /// @param fee The fee that must be paid on top of the borrowed amount
    /// @param initiator The address that initiated the flash loan
    /// @param data Arbitrary data passed through from the flash loan call
    /// @return True if the operation was successful
    function executeOperation(
        uint256 marketId,
        uint256 amount,
        uint256 fee,
        address initiator,
        bytes calldata data
    ) external returns (bool);
}
