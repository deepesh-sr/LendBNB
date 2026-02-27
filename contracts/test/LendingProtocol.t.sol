// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LendingProtocol.sol";
import "./mocks/MockERC20.sol";
import "./mocks/MockChainlinkAggregator.sol";

contract LendingProtocolTest is Test {
    LendingProtocol public protocol;
    MockERC20 public usdt;
    MockERC20 public bnb;
    MockChainlinkAggregator public usdtOracle;
    MockChainlinkAggregator public bnbOracle;

    address public admin = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public liquidator = address(0x11C);

    uint256 public marketId;

    // Market params
    uint256 constant COLLATERAL_FACTOR = 8000;  // 80%
    uint256 constant LIQUIDATION_THRESHOLD = 8500; // 85%
    uint256 constant LIQUIDATION_BONUS = 11000; // 10% bonus
    uint256 constant BASE_RATE = 0.02e27;       // 2% base
    uint256 constant MULTIPLIER = 0.1e27;       // 10% slope
    uint256 constant JUMP_MULTIPLIER = 3e27;    // 300% jump slope
    uint256 constant KINK = 0.8e27;             // 80% optimal
    uint256 constant RESERVE_FACTOR = 1000;     // 10%

    function setUp() public {
        protocol = new LendingProtocol();

        // Deploy mock tokens
        usdt = new MockERC20("USDT", "USDT", 18);
        bnb = new MockERC20("Wrapped BNB", "WBNB", 18);

        // Deploy mock oracles (USDT = $1, BNB = $600)
        usdtOracle = new MockChainlinkAggregator(1e8, 8, "USDT/USD");
        bnbOracle = new MockChainlinkAggregator(600e8, 8, "BNB/USD");

        // Create market
        marketId = protocol.createMarket(
            address(usdt),
            address(bnb),
            address(usdtOracle),
            address(bnbOracle),
            COLLATERAL_FACTOR,
            LIQUIDATION_THRESHOLD,
            LIQUIDATION_BONUS,
            BASE_RATE,
            MULTIPLIER,
            JUMP_MULTIPLIER,
            KINK,
            RESERVE_FACTOR
        );

        // Mint tokens to users
        usdt.mint(alice, 100_000e18);
        usdt.mint(bob, 100_000e18);
        usdt.mint(liquidator, 100_000e18);
        bnb.mint(alice, 100e18);
        bnb.mint(bob, 100e18);

        // Approve protocol
        vm.startPrank(alice);
        usdt.approve(address(protocol), type(uint256).max);
        bnb.approve(address(protocol), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(bob);
        usdt.approve(address(protocol), type(uint256).max);
        bnb.approve(address(protocol), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(liquidator);
        usdt.approve(address(protocol), type(uint256).max);
        bnb.approve(address(protocol), type(uint256).max);
        vm.stopPrank();
    }

    // ============ Market Creation Tests ============

    function test_createMarket() public view {
        LendingProtocol.Market memory market = protocol.getMarket(marketId);
        assertEq(market.supplyToken, address(usdt));
        assertEq(market.collateralToken, address(bnb));
        assertEq(market.collateralFactor, COLLATERAL_FACTOR);
        assertEq(market.liquidationThreshold, LIQUIDATION_THRESHOLD);
        assertEq(market.isActive, true);
        assertEq(market.cumulativeBorrowIndex, 1e27);
        assertEq(protocol.marketCount(), 1);
    }

    function test_createMarket_revertInvalidParams() public {
        // collateralFactor >= liquidationThreshold
        vm.expectRevert(LendingProtocol.InvalidMarketParams.selector);
        protocol.createMarket(
            address(usdt), address(bnb),
            address(usdtOracle), address(bnbOracle),
            9000, 8500, // CF > LT
            LIQUIDATION_BONUS, BASE_RATE, MULTIPLIER, JUMP_MULTIPLIER, KINK, RESERVE_FACTOR
        );
    }

    function test_createMarket_revertSameToken() public {
        vm.expectRevert(LendingProtocol.InvalidMarketParams.selector);
        protocol.createMarket(
            address(usdt), address(usdt), // same token
            address(usdtOracle), address(bnbOracle),
            COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD,
            LIQUIDATION_BONUS, BASE_RATE, MULTIPLIER, JUMP_MULTIPLIER, KINK, RESERVE_FACTOR
        );
    }

    // ============ Supply Tests ============

    function test_supply() public {
        vm.prank(alice);
        protocol.supply(marketId, 10_000e18);

        LendingProtocol.UserPosition memory pos = protocol.getPosition(marketId, alice);
        assertEq(pos.supplyDeposited, 10_000e18);
        assertEq(pos.ctokenBalance, 10_000e18); // 1:1 initial rate

        LendingProtocol.Market memory market = protocol.getMarket(marketId);
        assertEq(market.totalSupplyDeposits, 10_000e18);
        assertEq(market.totalCtokenSupply, 10_000e18);
    }

    function test_supply_multipleUsers() public {
        vm.prank(alice);
        protocol.supply(marketId, 5_000e18);

        vm.prank(bob);
        protocol.supply(marketId, 3_000e18);

        LendingProtocol.Market memory market = protocol.getMarket(marketId);
        assertEq(market.totalSupplyDeposits, 8_000e18);
        assertEq(market.totalCtokenSupply, 8_000e18);
    }

    // ============ Withdraw Tests ============

    function test_withdraw() public {
        vm.startPrank(alice);
        protocol.supply(marketId, 10_000e18);

        uint256 balanceBefore = usdt.balanceOf(alice);
        protocol.withdraw(marketId, 5_000e18); // withdraw half cTokens
        uint256 balanceAfter = usdt.balanceOf(alice);

        assertEq(balanceAfter - balanceBefore, 5_000e18);

        LendingProtocol.UserPosition memory pos = protocol.getPosition(marketId, alice);
        assertEq(pos.ctokenBalance, 5_000e18);
        vm.stopPrank();
    }

    function test_withdraw_revertInsufficientBalance() public {
        vm.startPrank(alice);
        protocol.supply(marketId, 1_000e18);

        vm.expectRevert(LendingProtocol.InsufficientBalance.selector);
        protocol.withdraw(marketId, 2_000e18);
        vm.stopPrank();
    }

    // ============ Borrow Tests ============

    function test_borrow() public {
        // Alice supplies USDT
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        // Bob borrows USDT with BNB collateral
        // 1 BNB = $600, collateral factor 80%, so max borrow = 0.8 * 600 = $480
        vm.prank(bob);
        protocol.borrow(marketId, 1e18, 400e18); // 1 BNB collateral, borrow 400 USDT

        LendingProtocol.UserPosition memory pos = protocol.getPosition(marketId, bob);
        assertEq(pos.collateralDeposited, 1e18);
        assertEq(pos.borrowedAmount, 400e18);

        // Bob should have received 400 USDT
        assertEq(usdt.balanceOf(bob), 100_400e18); // initial 100k + 400
    }

    function test_borrow_revertInsufficientCollateral() public {
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        // Try to borrow more than collateral allows
        // 1 BNB = $600, CF 80%, max = $480
        vm.prank(bob);
        vm.expectRevert(LendingProtocol.InsufficientCollateral.selector);
        protocol.borrow(marketId, 1e18, 500e18); // Trying to borrow $500 > $480 max
    }

    function test_borrow_revertInsufficientLiquidity() public {
        // Alice supplies only 100 USDT
        vm.prank(alice);
        protocol.supply(marketId, 100e18);

        // Bob tries to borrow 200 USDT (more than available)
        vm.prank(bob);
        vm.expectRevert(LendingProtocol.InsufficientLiquidity.selector);
        protocol.borrow(marketId, 1e18, 200e18);
    }

    // ============ Repay Tests ============

    function test_repay() public {
        // Setup: Alice supplies, Bob borrows
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        vm.prank(bob);
        protocol.borrow(marketId, 1e18, 400e18);

        // Bob repays half
        vm.prank(bob);
        protocol.repay(marketId, 200e18);

        LendingProtocol.UserPosition memory pos = protocol.getPosition(marketId, bob);
        assertEq(pos.borrowedAmount, 200e18);
    }

    function test_repay_full() public {
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        vm.prank(bob);
        protocol.borrow(marketId, 1e18, 400e18);

        // Bob repays everything (overpay gets capped)
        vm.prank(bob);
        protocol.repay(marketId, 1_000e18); // Overpay, should cap at 400

        LendingProtocol.UserPosition memory pos = protocol.getPosition(marketId, bob);
        assertEq(pos.borrowedAmount, 0);
    }

    // ============ Withdraw Collateral Tests ============

    function test_withdrawCollateral_noBorrows() public {
        // Bob deposits collateral without borrowing
        vm.prank(bob);
        protocol.borrow(marketId, 5e18, 0); // deposit 5 BNB, borrow 0

        vm.prank(bob);
        protocol.withdrawCollateral(marketId, 3e18);

        LendingProtocol.UserPosition memory pos = protocol.getPosition(marketId, bob);
        assertEq(pos.collateralDeposited, 2e18);
    }

    function test_withdrawCollateral_withBorrows_healthOk() public {
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        // Bob deposits 10 BNB ($6000) and borrows only 100 USDT (very safe)
        vm.prank(bob);
        protocol.borrow(marketId, 10e18, 100e18);

        // Withdraw 5 BNB -- still healthy: 5 BNB * $600 * 85% / 100 >> 1.0
        vm.prank(bob);
        protocol.withdrawCollateral(marketId, 5e18);

        LendingProtocol.UserPosition memory pos = protocol.getPosition(marketId, bob);
        assertEq(pos.collateralDeposited, 5e18);
    }

    function test_withdrawCollateral_revertHealthTooLow() public {
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        // Bob deposits 1 BNB ($600) borrows 400 USDT (near max)
        vm.prank(bob);
        protocol.borrow(marketId, 1e18, 400e18);

        // Try to withdraw all collateral -- should fail
        vm.prank(bob);
        vm.expectRevert(LendingProtocol.HealthFactorTooLow.selector);
        protocol.withdrawCollateral(marketId, 1e18);
    }

    // ============ Liquidation Tests ============

    function test_liquidate() public {
        // Setup: Alice supplies, Bob borrows
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        vm.prank(bob);
        protocol.borrow(marketId, 1e18, 400e18); // 1 BNB, borrow 400 USDT

        // Drop BNB price from $600 to $400 -- makes position unhealthy
        // HF = (1 * 400 * 8500 / 10000) / (400 * 1) = 340 / 400 = 0.85 < 1.0
        bnbOracle.setPrice(400e8);

        // Liquidator repays 200 USDT (50% of debt = max close factor)
        uint256 liquidatorBnbBefore = bnb.balanceOf(liquidator);
        vm.prank(liquidator);
        protocol.liquidate(marketId, bob, 200e18);

        // Liquidator should have received collateral with bonus
        // collateralToSeize = 200 * (1/400) * 11000 / 10000 = 200 * 1e18/400e18 * 1.1
        // = 200 * 1.1 / 400 = 0.55 BNB
        uint256 liquidatorBnbAfter = bnb.balanceOf(liquidator);
        uint256 collateralReceived = liquidatorBnbAfter - liquidatorBnbBefore;
        assertGt(collateralReceived, 0);

        // Bob's debt should be reduced
        LendingProtocol.UserPosition memory pos = protocol.getPosition(marketId, bob);
        assertEq(pos.borrowedAmount, 200e18);
    }

    function test_liquidate_revertHealthy() public {
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        vm.prank(bob);
        protocol.borrow(marketId, 1e18, 100e18); // Very safe position

        // Try to liquidate healthy position
        vm.prank(liquidator);
        vm.expectRevert(LendingProtocol.PositionHealthy.selector);
        protocol.liquidate(marketId, bob, 50e18);
    }

    function test_liquidate_revertExcessive() public {
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        vm.prank(bob);
        protocol.borrow(marketId, 1e18, 400e18);

        bnbOracle.setPrice(400e8); // Make unhealthy

        // Try to liquidate more than 50% (close factor)
        vm.prank(liquidator);
        vm.expectRevert(LendingProtocol.ExcessiveLiquidation.selector);
        protocol.liquidate(marketId, bob, 300e18); // 75% > 50% max
    }

    // ============ Flash Loan Tests ============

    function test_flashLoan() public {
        // Supply liquidity first
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        // Deploy a simple flash loan receiver that repays
        SimpleFlashReceiver receiver = new SimpleFlashReceiver(address(protocol));
        usdt.mint(address(receiver), 1_000e18); // Pre-fund for fee

        protocol.flashLoan(marketId, 10_000e18, address(receiver), "");
    }

    // ============ Interest Accrual Tests ============

    function test_interestAccrual() public {
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        // 10 BNB = $6000, CF 80% = $4800 max. Borrow 4000 USDT (safe)
        vm.prank(bob);
        protocol.borrow(marketId, 10e18, 4_000e18);

        // Advance time by 1 year
        vm.warp(block.timestamp + 365.25 days);

        // Trigger accrual by calling any function
        vm.prank(alice);
        protocol.supply(marketId, 1e18);

        // Total borrows should have increased due to interest
        LendingProtocol.Market memory market = protocol.getMarket(marketId);
        assertGt(market.totalBorrows, 4_000e18);
        assertGt(market.totalReserves, 0);
    }

    // ============ View Function Tests ============

    function test_getHealthFactor() public {
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        vm.prank(bob);
        protocol.borrow(marketId, 1e18, 100e18);

        uint256 hf = protocol.getHealthFactor(marketId, bob);
        // HF = (1 * 600 * 8500 / 10000) / (100 * 1) = 510 / 100 = 5.1
        assertGt(hf, 5e27); // > 5x healthy
    }

    function test_utilization() public {
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        // 10 BNB = $6000, CF 80% = $4800 max. Borrow 4000 USDT
        vm.prank(bob);
        protocol.borrow(marketId, 10e18, 4_000e18);

        uint256 util = protocol.getUtilization(marketId);
        // 4000 / 50000 = 8%
        assertApproxEqRel(util, 0.08e27, 0.01e27); // ~8%
    }

    // ============ Pause Tests ============

    function test_pause() public {
        protocol.pauseProtocol();

        vm.prank(alice);
        vm.expectRevert();
        protocol.supply(marketId, 1_000e18);
    }

    function test_repay_whenPaused() public {
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        vm.prank(bob);
        protocol.borrow(marketId, 1e18, 100e18);

        protocol.pauseProtocol();

        // Repay should still work when paused (solvency)
        vm.prank(bob);
        protocol.repay(marketId, 50e18);
    }

    function test_liquidate_whenPaused() public {
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        vm.prank(bob);
        protocol.borrow(marketId, 1e18, 400e18);

        bnbOracle.setPrice(400e8);
        protocol.pauseProtocol();

        // Liquidate should still work when paused (solvency)
        vm.prank(liquidator);
        protocol.liquidate(marketId, bob, 200e18);
    }

    // ============ Full Cycle Integration Test ============

    function test_fullCycle() public {
        // 1. Alice supplies 50k USDT
        vm.prank(alice);
        protocol.supply(marketId, 50_000e18);

        // 2. Bob borrows with BNB collateral
        vm.prank(bob);
        protocol.borrow(marketId, 5e18, 2_000e18);

        // 3. Time passes, interest accrues
        vm.warp(block.timestamp + 30 days);

        // 4. Bob repays
        vm.prank(bob);
        protocol.repay(marketId, 2_100e18); // Repay with some buffer for interest

        // 5. Bob withdraws collateral
        vm.prank(bob);
        protocol.withdrawCollateral(marketId, 5e18);

        // 6. Alice withdraws with interest earned
        LendingProtocol.UserPosition memory alicePos = protocol.getPosition(marketId, alice);
        vm.prank(alice);
        protocol.withdraw(marketId, alicePos.ctokenBalance);

        // Alice should have earned some interest
        assertGt(usdt.balanceOf(alice), 100_000e18);
    }
}

/// @notice Simple flash loan receiver for testing
contract SimpleFlashReceiver is IFlashLoanReceiver {
    using SafeERC20 for IERC20;

    address public protocol;

    constructor(address _protocol) {
        protocol = _protocol;
    }

    function executeOperation(
        uint256 marketId,
        uint256 amount,
        uint256 fee,
        address,
        bytes calldata
    ) external override returns (bool) {
        // Get supply token address
        LendingProtocol.Market memory market = LendingProtocol(protocol).getMarket(marketId);

        // Repay flash loan + fee
        IERC20(market.supplyToken).safeTransfer(protocol, amount + fee);

        return true;
    }
}
