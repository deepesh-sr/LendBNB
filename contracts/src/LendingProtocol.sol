// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./libraries/WadRayMath.sol";
import "./libraries/OracleLib.sol";
import "./libraries/InterestRateModel.sol";
import "./interfaces/IFlashLoanReceiver.sol";

/// @title LendingProtocol -- MetaLend ported to BNB Chain
/// @notice Dual-asset lending protocol with liquidation support and flash loans
/// @dev Ported from Solana MetaLend (capstone_bootcamp_3) with improvements
contract LendingProtocol is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    // ============ Constants ============

    uint256 public constant RAY = 1e27;
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant FLASH_LOAN_FEE_BPS = 30; // 0.3% (same as MetaLend)
    uint256 public constant SECONDS_PER_YEAR = 365.25 days;
    uint256 public constant MAX_CLOSE_FACTOR = 5000; // 50% max liquidation per tx
    uint256 public constant SCALING_FACTOR = 1e18; // For cToken exchange rate

    // ============ Structs (ported from state.rs) ============

    /// @notice Market configuration -- maps from MetaLend's Market PDA account
    struct Market {
        address supplyToken;              // supply_mint
        address collateralToken;          // collateral_mint
        uint256 totalSupplyDeposits;      // total_supply_deposits
        uint256 totalBorrows;             // total_borrows
        uint256 totalCollateralDeposits;  // total_collateral_deposits
        uint256 totalCtokenSupply;        // total_ctoken_supply
        uint256 collateralFactor;         // basis points (e.g., 8000 = 80%)
        uint256 liquidationThreshold;     // basis points (e.g., 8500 = 85%)
        uint256 lastUpdateTimestamp;      // last_update_slot -> timestamp
        uint256 cumulativeBorrowIndex;    // scaled 1e27 (ray), starts at RAY
        address supplyOracle;             // Chainlink aggregator for supply asset
        address collateralOracle;         // Chainlink aggregator for collateral asset
        bool isActive;
        uint256 baseRate;                 // base annual borrow rate (ray)
        uint256 multiplier;               // rate slope below kink (ray)
        uint256 jumpMultiplier;           // rate slope above kink (ray)
        uint256 kink;                     // optimal utilization (ray)
        uint256 liquidationBonus;         // basis points (e.g., 11000 = 10% bonus)
        uint256 reserveFactor;            // basis points (e.g., 1000 = 10%)
        uint256 totalReserves;            // accumulated protocol reserves
    }

    /// @notice User position -- maps from MetaLend's UserDeposit PDA account
    struct UserPosition {
        uint256 supplyDeposited;          // supply_deposited
        uint256 collateralDeposited;      // collateral_deposited
        uint256 borrowedAmount;           // borrowed_amount (principal)
        uint256 ctokenBalance;            // ctoken_balance
        uint256 borrowIndex;              // snapshot of cumulative borrow index at last update
    }

    // ============ State ============

    uint256 public marketCount;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => UserPosition)) public positions;

    // ============ Events (critical for liquidation bot monitoring) ============

    event MarketCreated(
        uint256 indexed marketId,
        address supplyToken,
        address collateralToken,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    );
    event Supply(
        uint256 indexed marketId,
        address indexed user,
        uint256 amount,
        uint256 ctokensMinted
    );
    event Withdraw(
        uint256 indexed marketId,
        address indexed user,
        uint256 ctokensBurned,
        uint256 amountReturned
    );
    event CollateralDeposited(
        uint256 indexed marketId,
        address indexed user,
        uint256 amount
    );
    event Borrow(
        uint256 indexed marketId,
        address indexed user,
        uint256 collateralAmount,
        uint256 borrowAmount,
        uint256 healthFactor
    );
    event Repay(
        uint256 indexed marketId,
        address indexed user,
        uint256 repayAmount,
        uint256 remainingDebt
    );
    event CollateralWithdrawn(
        uint256 indexed marketId,
        address indexed user,
        uint256 amount
    );
    event Liquidation(
        uint256 indexed marketId,
        address indexed borrower,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 healthFactorBefore
    );
    event FlashLoan(
        uint256 indexed marketId,
        address indexed receiver,
        uint256 amount,
        uint256 fee
    );
    event InterestAccrued(
        uint256 indexed marketId,
        uint256 borrowRate,
        uint256 newBorrowIndex,
        uint256 timestamp
    );

    // ============ Errors (mapped from MetaLend's LendingError) ============

    error MarketNotActive();
    error InsufficientBalance();
    error InsufficientCollateral();
    error InsufficientLiquidity();
    error PositionHealthy();
    error ExcessiveLiquidation();
    error FlashLoanNotRepaid();
    error HasBorrows();
    error InvalidMarketParams();
    error MathOverflow();
    error HealthFactorTooLow();

    // ============ Constructor ============

    constructor() Ownable(msg.sender) {}

    // ============ Admin Functions ============

    /// @notice Create a new lending market -- from instructions/market.rs
    function createMarket(
        address supplyToken,
        address collateralToken,
        address supplyOracle,
        address collateralOracle,
        uint256 collateralFactor,
        uint256 liquidationThreshold,
        uint256 liquidationBonus,
        uint256 baseRate,
        uint256 multiplier,
        uint256 jumpMultiplier,
        uint256 kink,
        uint256 reserveFactor
    ) external onlyOwner returns (uint256 marketId) {
        if (collateralFactor >= liquidationThreshold) revert InvalidMarketParams();
        if (liquidationThreshold >= BASIS_POINTS) revert InvalidMarketParams();
        if (supplyToken == collateralToken) revert InvalidMarketParams();
        if (liquidationBonus < BASIS_POINTS) revert InvalidMarketParams();

        marketId = marketCount++;
        Market storage market = markets[marketId];
        market.supplyToken = supplyToken;
        market.collateralToken = collateralToken;
        market.supplyOracle = supplyOracle;
        market.collateralOracle = collateralOracle;
        market.collateralFactor = collateralFactor;
        market.liquidationThreshold = liquidationThreshold;
        market.liquidationBonus = liquidationBonus;
        market.baseRate = baseRate;
        market.multiplier = multiplier;
        market.jumpMultiplier = jumpMultiplier;
        market.kink = kink;
        market.reserveFactor = reserveFactor;
        market.cumulativeBorrowIndex = RAY; // Start at 1.0 (like MetaLend's SCALING_FACTOR init)
        market.lastUpdateTimestamp = block.timestamp;
        market.isActive = true;

        emit MarketCreated(marketId, supplyToken, collateralToken, collateralFactor, liquidationThreshold);
    }

    function pauseProtocol() external onlyOwner {
        _pause();
    }

    function unpauseProtocol() external onlyOwner {
        _unpause();
    }

    // ============ Supply Functions (from instructions/supply.rs) ============

    /// @notice Supply assets to earn interest via cTokens
    function supply(uint256 marketId, uint256 amount) external nonReentrant whenNotPaused {
        Market storage market = markets[marketId];
        if (!market.isActive) revert MarketNotActive();

        _accrueInterest(marketId);

        // Calculate exchange rate (from utils.rs:81-100)
        uint256 exchangeRate = _getExchangeRate(market);

        // Calculate cTokens to mint (from utils.rs:103-116)
        uint256 ctokensMinted = (amount * SCALING_FACTOR + exchangeRate - 1) / exchangeRate;

        // Transfer supply tokens in
        IERC20(market.supplyToken).safeTransferFrom(msg.sender, address(this), amount);

        // Update state
        UserPosition storage pos = positions[marketId][msg.sender];
        pos.supplyDeposited += amount;
        pos.ctokenBalance += ctokensMinted;
        market.totalSupplyDeposits += amount;
        market.totalCtokenSupply += ctokensMinted;

        emit Supply(marketId, msg.sender, amount, ctokensMinted);
    }

    /// @notice Withdraw supplied assets by burning cTokens (from instructions/withdraw.rs)
    function withdraw(uint256 marketId, uint256 ctokenAmount) external nonReentrant whenNotPaused {
        Market storage market = markets[marketId];
        if (!market.isActive) revert MarketNotActive();

        UserPosition storage pos = positions[marketId][msg.sender];
        if (pos.ctokenBalance < ctokenAmount) revert InsufficientBalance();

        _accrueInterest(marketId);

        // Calculate underlying tokens to return (from utils.rs:119-124)
        uint256 exchangeRate = _getExchangeRate(market);
        uint256 tokensToReturn = ctokenAmount * exchangeRate / SCALING_FACTOR;

        // Check available liquidity
        uint256 availableLiquidity = market.totalSupplyDeposits - market.totalBorrows;
        if (tokensToReturn > availableLiquidity) revert InsufficientLiquidity();

        // Update state before transfer
        pos.ctokenBalance -= ctokenAmount;
        pos.supplyDeposited = pos.supplyDeposited > tokensToReturn
            ? pos.supplyDeposited - tokensToReturn
            : 0;
        market.totalCtokenSupply -= ctokenAmount;
        market.totalSupplyDeposits -= tokensToReturn;

        // Transfer tokens out
        IERC20(market.supplyToken).safeTransfer(msg.sender, tokensToReturn);

        emit Withdraw(marketId, msg.sender, ctokenAmount, tokensToReturn);
    }

    // ============ Borrow Functions (from instructions/borrow.rs) ============

    /// @notice Deposit collateral and borrow supply tokens
    function borrow(
        uint256 marketId,
        uint256 collateralAmount,
        uint256 borrowAmount
    ) external nonReentrant whenNotPaused {
        Market storage market = markets[marketId];
        if (!market.isActive) revert MarketNotActive();

        _accrueInterest(marketId);

        UserPosition storage pos = positions[marketId][msg.sender];

        // Apply pending interest to user's existing borrow
        _updateUserBorrow(pos, market);

        // Deposit collateral if provided (from borrow.rs:31-51)
        if (collateralAmount > 0) {
            IERC20(market.collateralToken).safeTransferFrom(msg.sender, address(this), collateralAmount);
            pos.collateralDeposited += collateralAmount;
            market.totalCollateralDeposits += collateralAmount;

            emit CollateralDeposited(marketId, msg.sender, collateralAmount);
        }

        if (borrowAmount > 0) {
            // Get oracle prices (from borrow.rs:27-28)
            uint256 collateralPrice = OracleLib.getPrice(market.collateralOracle);
            uint256 supplyPrice = OracleLib.getPrice(market.supplyOracle);

            // Calculate max borrow (from utils.rs:155-167)
            uint256 totalCollateralValue = pos.collateralDeposited * collateralPrice / 1e18;
            uint256 maxBorrowValue = totalCollateralValue * market.collateralFactor / BASIS_POINTS;
            uint256 newTotalBorrow = pos.borrowedAmount + borrowAmount;
            uint256 newBorrowValue = newTotalBorrow * supplyPrice / 1e18;

            if (newBorrowValue > maxBorrowValue) revert InsufficientCollateral();

            // Check pool liquidity (from borrow.rs:80-87)
            uint256 availableLiquidity = market.totalSupplyDeposits - market.totalBorrows;
            if (borrowAmount > availableLiquidity) revert InsufficientLiquidity();

            // Transfer supply tokens to borrower (from borrow.rs:113-133)
            IERC20(market.supplyToken).safeTransfer(msg.sender, borrowAmount);

            // Update borrow state (from borrow.rs:136-144)
            pos.borrowedAmount += borrowAmount;
            market.totalBorrows += borrowAmount;

            // Calculate health factor for event
            uint256 hf = _calculateHealthFactor(pos, market, collateralPrice, supplyPrice);
            emit Borrow(marketId, msg.sender, collateralAmount, borrowAmount, hf);
        }
    }

    /// @notice Repay borrowed tokens (from instructions/repay.rs)
    function repay(uint256 marketId, uint256 amount) external nonReentrant {
        Market storage market = markets[marketId];

        _accrueInterest(marketId);

        UserPosition storage pos = positions[marketId][msg.sender];

        // Apply pending interest
        _updateUserBorrow(pos, market);

        // Cap repayment at outstanding debt
        uint256 repayAmount = amount > pos.borrowedAmount ? pos.borrowedAmount : amount;
        if (repayAmount == 0) revert InsufficientBalance();

        // Transfer repayment from user
        IERC20(market.supplyToken).safeTransferFrom(msg.sender, address(this), repayAmount);

        // Update state
        pos.borrowedAmount -= repayAmount;
        market.totalBorrows -= repayAmount;

        emit Repay(marketId, msg.sender, repayAmount, pos.borrowedAmount);
    }

    /// @notice Withdraw collateral (from instructions/borrow.rs:155-219)
    /// @dev Improved: allows partial withdrawal with active borrows if health > 1.0
    function withdrawCollateral(uint256 marketId, uint256 amount) external nonReentrant whenNotPaused {
        Market storage market = markets[marketId];
        UserPosition storage pos = positions[marketId][msg.sender];

        if (pos.collateralDeposited < amount) revert InsufficientBalance();

        _accrueInterest(marketId);
        _updateUserBorrow(pos, market);

        // If user has active borrows, check health after withdrawal
        if (pos.borrowedAmount > 0) {
            uint256 collateralPrice = OracleLib.getPrice(market.collateralOracle);
            uint256 supplyPrice = OracleLib.getPrice(market.supplyOracle);

            uint256 remainingCollateral = pos.collateralDeposited - amount;
            uint256 collateralValue = remainingCollateral * collateralPrice / 1e18;
            uint256 thresholdValue = collateralValue * market.liquidationThreshold / BASIS_POINTS;
            uint256 borrowValue = pos.borrowedAmount * supplyPrice / 1e18;

            if (borrowValue >= thresholdValue) revert HealthFactorTooLow();
        }

        // Transfer collateral back
        pos.collateralDeposited -= amount;
        market.totalCollateralDeposits -= amount;
        IERC20(market.collateralToken).safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(marketId, msg.sender, amount);
    }

    // ============ Liquidation (from instructions/liquidate.rs) ============

    /// @notice Liquidate an undercollateralized position
    /// @dev Fixed from MetaLend: properly converts between supply and collateral prices
    function liquidate(
        uint256 marketId,
        address borrower,
        uint256 repayAmount
    ) external nonReentrant {
        Market storage market = markets[marketId];

        _accrueInterest(marketId);

        UserPosition storage pos = positions[marketId][borrower];

        // Apply pending interest to get true debt
        _updateUserBorrow(pos, market);

        // Get prices
        uint256 collateralPrice = OracleLib.getPrice(market.collateralOracle);
        uint256 supplyPrice = OracleLib.getPrice(market.supplyOracle);

        // Check if position is liquidatable (from liquidate.rs:24-41)
        uint256 healthFactor = _calculateHealthFactor(pos, market, collateralPrice, supplyPrice);
        if (healthFactor >= RAY) revert PositionHealthy();

        // Close factor check -- max 50% of debt per liquidation (improvement over MetaLend)
        uint256 maxRepay = pos.borrowedAmount * MAX_CLOSE_FACTOR / BASIS_POINTS;
        if (repayAmount > maxRepay) revert ExcessiveLiquidation();
        if (repayAmount > pos.borrowedAmount) repayAmount = pos.borrowedAmount;

        // Calculate collateral to seize with bonus
        // FIX from MetaLend: liquidate.rs:44-45 doesn't convert between asset prices
        // Original: collateral_to_seize = liquidation_amount * liquidation_bonus / 1000
        // Fixed: properly convert repay amount to collateral value using both oracle prices
        uint256 repayValueInCollateral = repayAmount * supplyPrice / collateralPrice;
        uint256 collateralToSeize = repayValueInCollateral * market.liquidationBonus / BASIS_POINTS;

        // Cap at available collateral
        if (collateralToSeize > pos.collateralDeposited) {
            collateralToSeize = pos.collateralDeposited;
        }

        // Transfer repayment from liquidator to protocol
        IERC20(market.supplyToken).safeTransferFrom(msg.sender, address(this), repayAmount);

        // Transfer seized collateral to liquidator
        IERC20(market.collateralToken).safeTransfer(msg.sender, collateralToSeize);

        // Update state
        pos.borrowedAmount -= repayAmount;
        pos.collateralDeposited -= collateralToSeize;
        market.totalBorrows -= repayAmount;
        market.totalCollateralDeposits -= collateralToSeize;

        emit Liquidation(marketId, borrower, msg.sender, repayAmount, collateralToSeize, healthFactor);
    }

    // ============ Flash Loan (from instructions/flash_loan.rs) ============

    /// @notice Execute a flash loan
    function flashLoan(
        uint256 marketId,
        uint256 amount,
        address receiver,
        bytes calldata data
    ) external nonReentrant whenNotPaused {
        Market storage market = markets[marketId];
        if (!market.isActive) revert MarketNotActive();

        uint256 fee = amount * FLASH_LOAN_FEE_BPS / BASIS_POINTS;

        // Record balance before
        uint256 balanceBefore = IERC20(market.supplyToken).balanceOf(address(this));

        // Transfer tokens to receiver
        IERC20(market.supplyToken).safeTransfer(receiver, amount);

        // Callback
        bool success = IFlashLoanReceiver(receiver).executeOperation(
            marketId,
            amount,
            fee,
            msg.sender,
            data
        );
        require(success, "Flash loan callback failed");

        // Verify repayment
        uint256 balanceAfter = IERC20(market.supplyToken).balanceOf(address(this));
        if (balanceAfter < balanceBefore + fee) revert FlashLoanNotRepaid();

        // Fee goes to supply deposits (benefits suppliers)
        market.totalSupplyDeposits += fee;

        emit FlashLoan(marketId, receiver, amount, fee);
    }

    // ============ View Functions ============

    /// @notice Get market data
    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    /// @notice Get user position
    function getPosition(uint256 marketId, address user) external view returns (UserPosition memory) {
        return positions[marketId][user];
    }

    /// @notice Get health factor for a position
    function getHealthFactor(uint256 marketId, address user) external view returns (uint256) {
        Market storage market = markets[marketId];
        UserPosition storage pos = positions[marketId][user];

        if (pos.borrowedAmount == 0) return type(uint256).max;

        uint256 collateralPrice = OracleLib.getPrice(market.collateralOracle);
        uint256 supplyPrice = OracleLib.getPrice(market.supplyOracle);

        return _calculateHealthFactor(pos, market, collateralPrice, supplyPrice);
    }

    /// @notice Get current exchange rate for cTokens
    function getExchangeRate(uint256 marketId) external view returns (uint256) {
        return _getExchangeRate(markets[marketId]);
    }

    /// @notice Get current utilization rate
    function getUtilization(uint256 marketId) external view returns (uint256) {
        Market storage market = markets[marketId];
        return InterestRateModel.getUtilization(market.totalSupplyDeposits, market.totalBorrows);
    }

    /// @notice Get current borrow rate
    function getBorrowRate(uint256 marketId) external view returns (uint256) {
        Market storage market = markets[marketId];
        return InterestRateModel.getBorrowRate(
            market.totalSupplyDeposits,
            market.totalBorrows,
            market.baseRate,
            market.multiplier,
            market.jumpMultiplier,
            market.kink
        );
    }

    /// @notice Get current supply rate
    function getSupplyRate(uint256 marketId) external view returns (uint256) {
        Market storage market = markets[marketId];
        uint256 borrowRate = InterestRateModel.getBorrowRate(
            market.totalSupplyDeposits,
            market.totalBorrows,
            market.baseRate,
            market.multiplier,
            market.jumpMultiplier,
            market.kink
        );
        return InterestRateModel.getSupplyRate(
            borrowRate,
            market.totalSupplyDeposits,
            market.totalBorrows,
            market.reserveFactor
        );
    }

    // ============ Internal Functions ============

    /// @notice Accrue interest on a market (replaces update_market_interest from utils.rs:10-48)
    function _accrueInterest(uint256 marketId) internal {
        Market storage market = markets[marketId];
        uint256 timeElapsed = block.timestamp - market.lastUpdateTimestamp;
        if (timeElapsed == 0 || market.totalBorrows == 0) {
            market.lastUpdateTimestamp = block.timestamp;
            return;
        }

        // Calculate current borrow rate
        uint256 borrowRate = InterestRateModel.getBorrowRate(
            market.totalSupplyDeposits,
            market.totalBorrows,
            market.baseRate,
            market.multiplier,
            market.jumpMultiplier,
            market.kink
        );

        // Calculate interest accrued
        uint256 borrowInterest = market.totalBorrows * borrowRate * timeElapsed / SECONDS_PER_YEAR / RAY;

        if (borrowInterest > 0) {
            // Protocol reserves
            uint256 reserveAmount = borrowInterest * market.reserveFactor / BASIS_POINTS;

            // Update state
            market.totalBorrows += borrowInterest;
            market.totalSupplyDeposits += (borrowInterest - reserveAmount);
            market.totalReserves += reserveAmount;

            // Update cumulative borrow index
            uint256 rateIncrement = borrowRate * timeElapsed / SECONDS_PER_YEAR;
            market.cumulativeBorrowIndex = market.cumulativeBorrowIndex.rayMul(RAY + rateIncrement);
        }

        market.lastUpdateTimestamp = block.timestamp;

        emit InterestAccrued(marketId, borrowRate, market.cumulativeBorrowIndex, block.timestamp);
    }

    /// @notice Update user's borrow with accrued interest via borrow index
    function _updateUserBorrow(UserPosition storage pos, Market storage market) internal {
        if (pos.borrowedAmount > 0 && pos.borrowIndex > 0) {
            // borrowedAmount = borrowedAmount * currentIndex / userIndex
            pos.borrowedAmount = pos.borrowedAmount * market.cumulativeBorrowIndex / pos.borrowIndex;
        }
        pos.borrowIndex = market.cumulativeBorrowIndex;
    }

    /// @notice Calculate exchange rate (from utils.rs:81-100)
    function _getExchangeRate(Market storage market) internal view returns (uint256) {
        if (market.totalCtokenSupply == 0 || market.totalSupplyDeposits == 0) {
            return SCALING_FACTOR; // 1:1 initial rate
        }
        uint256 rate = market.totalSupplyDeposits * SCALING_FACTOR / market.totalCtokenSupply;
        return rate >= SCALING_FACTOR ? rate : SCALING_FACTOR;
    }

    /// @notice Calculate health factor (from utils.rs:127-141)
    function _calculateHealthFactor(
        UserPosition storage pos,
        Market storage market,
        uint256 collateralPrice,
        uint256 supplyPrice
    ) internal view returns (uint256) {
        if (pos.borrowedAmount == 0) return type(uint256).max;

        uint256 collateralValue = pos.collateralDeposited * collateralPrice / 1e18;
        uint256 thresholdValue = collateralValue * market.liquidationThreshold / BASIS_POINTS;
        uint256 borrowValue = pos.borrowedAmount * supplyPrice / 1e18;

        if (borrowValue == 0) return type(uint256).max;
        return thresholdValue * RAY / borrowValue;
    }
}
