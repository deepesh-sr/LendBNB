// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./WadRayMath.sol";

/// @title InterestRateModel -- Utilization-based kinked interest rate model
/// @notice Replaces MetaLend's flat 2%/1% rates from utils.rs:8-48
/// @dev Uses a two-slope model: gentle slope below kink, steep slope above
library InterestRateModel {
    using WadRayMath for uint256;

    uint256 internal constant RAY = 1e27;
    uint256 internal constant SECONDS_PER_YEAR = 365.25 days;
    uint256 internal constant BASIS_POINTS = 10_000;

    /// @notice Calculate utilization rate = totalBorrows / totalSupply
    function getUtilization(uint256 totalSupply, uint256 totalBorrows) internal pure returns (uint256) {
        if (totalSupply == 0) return 0;
        return totalBorrows.rayDiv(totalSupply);
    }

    /// @notice Calculate borrow rate using kinked model
    /// @param totalSupply Total supply deposits
    /// @param totalBorrows Total outstanding borrows
    /// @param baseRate Base annual borrow rate (ray)
    /// @param multiplier Rate slope below kink (ray)
    /// @param jumpMultiplier Rate slope above kink (ray)
    /// @param kink Optimal utilization point (ray, e.g., 0.8e27 = 80%)
    /// @return Annual borrow rate (ray)
    function getBorrowRate(
        uint256 totalSupply,
        uint256 totalBorrows,
        uint256 baseRate,
        uint256 multiplier,
        uint256 jumpMultiplier,
        uint256 kink
    ) internal pure returns (uint256) {
        uint256 utilization = getUtilization(totalSupply, totalBorrows);

        if (utilization <= kink) {
            return baseRate + utilization.rayMul(multiplier);
        } else {
            uint256 normalRate = baseRate + kink.rayMul(multiplier);
            uint256 excessUtilization = utilization - kink;
            return normalRate + excessUtilization.rayMul(jumpMultiplier);
        }
    }

    /// @notice Supply rate = borrowRate * utilization * (1 - reserveFactor)
    function getSupplyRate(
        uint256 borrowRate,
        uint256 totalSupply,
        uint256 totalBorrows,
        uint256 reserveFactor
    ) internal pure returns (uint256) {
        uint256 utilization = getUtilization(totalSupply, totalBorrows);
        uint256 rateBeforeReserve = borrowRate.rayMul(utilization);
        return rateBeforeReserve * (BASIS_POINTS - reserveFactor) / BASIS_POINTS;
    }
}
