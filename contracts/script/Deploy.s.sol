// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LendingProtocol.sol";
import "../test/mocks/MockERC20.sol";
import "../test/mocks/MockChainlinkAggregator.sol";

/// @notice Deploy script for BNB testnet
contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy protocol
        LendingProtocol protocol = new LendingProtocol();
        console.log("LendingProtocol deployed at:", address(protocol));

        // Deploy mock tokens (for testnet)
        MockERC20 usdt = new MockERC20("USDT", "USDT", 18);
        MockERC20 wbnb = new MockERC20("Wrapped BNB", "WBNB", 18);
        MockERC20 btcb = new MockERC20("BTCB", "BTCB", 18);
        console.log("USDT:", address(usdt));
        console.log("WBNB:", address(wbnb));
        console.log("BTCB:", address(btcb));

        // Deploy mock oracles
        MockChainlinkAggregator usdtOracle = new MockChainlinkAggregator(1e8, 8, "USDT/USD");
        MockChainlinkAggregator bnbOracle = new MockChainlinkAggregator(600e8, 8, "BNB/USD");
        MockChainlinkAggregator btcOracle = new MockChainlinkAggregator(95000e8, 8, "BTC/USD");
        console.log("USDT Oracle:", address(usdtOracle));
        console.log("BNB Oracle:", address(bnbOracle));
        console.log("BTC Oracle:", address(btcOracle));

        // Create BNB/USDT market
        uint256 market1 = protocol.createMarket(
            address(usdt),          // supply token
            address(wbnb),          // collateral token
            address(usdtOracle),    // supply oracle
            address(bnbOracle),     // collateral oracle
            8000,                   // 80% collateral factor
            8500,                   // 85% liquidation threshold
            11000,                  // 10% liquidation bonus
            0.02e27,                // 2% base rate
            0.1e27,                 // 10% multiplier
            3e27,                   // 300% jump multiplier
            0.8e27,                 // 80% kink
            1000                    // 10% reserve factor
        );
        console.log("BNB/USDT Market ID:", market1);

        // Create BTCB/USDT market
        uint256 market2 = protocol.createMarket(
            address(usdt),
            address(btcb),
            address(usdtOracle),
            address(btcOracle),
            7500,                   // 75% collateral factor
            8000,                   // 80% liquidation threshold
            11000,                  // 10% liquidation bonus
            0.02e27,
            0.1e27,
            3e27,
            0.8e27,
            1000
        );
        console.log("BTCB/USDT Market ID:", market2);

        // Mint initial liquidity tokens to deployer
        usdt.mint(msg.sender, 1_000_000e18);
        wbnb.mint(msg.sender, 1_000e18);
        btcb.mint(msg.sender, 10e18);

        vm.stopBroadcast();
    }
}
