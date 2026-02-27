// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WadRayMath library
/// @notice Fixed-point math: wad = 1e18, ray = 1e27
library WadRayMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant RAY = 1e27;
    uint256 internal constant HALF_WAD = 0.5e18;
    uint256 internal constant HALF_RAY = 0.5e27;
    uint256 internal constant WAD_RAY_RATIO = 1e9;

    function rayMul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0 || b == 0) return 0;
        return (a * b + HALF_RAY) / RAY;
    }

    function rayDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 halfB = b / 2;
        return (a * RAY + halfB) / b;
    }

    function wadMul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0 || b == 0) return 0;
        return (a * b + HALF_WAD) / WAD;
    }

    function wadDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 halfB = b / 2;
        return (a * WAD + halfB) / b;
    }

    function wadToRay(uint256 a) internal pure returns (uint256) {
        return a * WAD_RAY_RATIO;
    }

    function rayToWad(uint256 a) internal pure returns (uint256) {
        return (a + WAD_RAY_RATIO / 2) / WAD_RAY_RATIO;
    }
}
