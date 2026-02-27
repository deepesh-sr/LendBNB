// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockChainlinkAggregator -- Controllable price feed for testing
/// @notice Replaces MetaLend's custom Oracle account with admin-set prices
contract MockChainlinkAggregator {
    int256 public price;
    uint256 public updatedAt;
    uint8 public _decimals;
    string public description;

    constructor(int256 _price, uint8 dec, string memory _description) {
        price = _price;
        _decimals = dec;
        description = _description;
        updatedAt = block.timestamp;
    }

    function setPrice(int256 _price) external {
        price = _price;
        updatedAt = block.timestamp;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt_, uint80 answeredInRound)
    {
        return (1, price, block.timestamp, updatedAt, 1);
    }
}
