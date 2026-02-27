// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title OracleLib -- Chainlink price feed wrapper with staleness checks
/// @notice Replaces MetaLend's custom Oracle account and get_asset_price() from utils.rs
library OracleLib {
    uint256 internal constant MAX_STALENESS = 3600; // 1 hour

    /// @notice Minimal Chainlink AggregatorV3 interface
    function getPrice(address feed) internal view returns (uint256) {
        // Call latestRoundData on the Chainlink aggregator
        (bool success, bytes memory data) = feed.staticcall(
            abi.encodeWithSignature("latestRoundData()")
        );
        require(success, "Oracle call failed");

        (, int256 price, , uint256 updatedAt, ) = abi.decode(
            data,
            (uint80, int256, uint256, uint256, uint80)
        );

        // Staleness check (replaces oracle.is_valid(current_slot, 100) from utils.rs:61)
        require(block.timestamp - updatedAt <= MAX_STALENESS, "Oracle stale");
        require(price > 0, "Invalid price");

        // Get decimals
        (bool decSuccess, bytes memory decData) = feed.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        require(decSuccess, "Decimals call failed");
        uint8 decimals = abi.decode(decData, (uint8));

        // Normalize to 18 decimals
        if (decimals < 18) {
            return uint256(price) * 10 ** (18 - decimals);
        } else if (decimals > 18) {
            return uint256(price) / 10 ** (decimals - 18);
        }
        return uint256(price);
    }
}
