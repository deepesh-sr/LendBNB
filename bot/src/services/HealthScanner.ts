import { ethers } from "ethers";
import { UserPosition, LiquidationOpportunity, MarketData } from "../types";
import { Logger } from "../utils/logger";

const log = new Logger("HealthScanner");

const RAY = BigInt("1000000000000000000000000000"); // 1e27
const BASIS_POINTS = 10000n;
const MAX_CLOSE_FACTOR = 5000n; // 50%

/**
 * Scans all tracked positions for liquidation opportunities.
 * Calculates health factors using on-chain oracle prices.
 */
export class HealthScanner {
  private contract: ethers.Contract;
  private marketCache: Map<number, MarketData> = new Map();

  constructor(contract: ethers.Contract) {
    this.contract = contract;
  }

  /** Scan all positions and return liquidatable ones */
  async scanPositions(
    positions: Map<string, UserPosition>
  ): Promise<LiquidationOpportunity[]> {
    const opportunities: LiquidationOpportunity[] = [];

    // Refresh market data
    const marketCount = await this.contract.marketCount();
    for (let i = 0; i < Number(marketCount); i++) {
      await this.refreshMarket(i);
    }

    for (const [_key, pos] of positions) {
      try {
        const opportunity = await this.checkPosition(pos);
        if (opportunity) {
          opportunities.push(opportunity);
        }
      } catch (err) {
        log.error(`Error checking position ${pos.user}`, err);
      }
    }

    if (opportunities.length > 0) {
      log.info(`Found ${opportunities.length} liquidation opportunities`);
    }

    return opportunities;
  }

  /** Check a single position for liquidation eligibility */
  private async checkPosition(
    pos: UserPosition
  ): Promise<LiquidationOpportunity | null> {
    if (pos.borrowedAmount === 0n) return null;

    const market = this.marketCache.get(pos.marketId);
    if (!market) return null;

    try {
      // Get health factor from contract (handles interest accrual internally)
      const healthFactor: bigint = await this.contract.getHealthFactor(
        pos.marketId,
        pos.user
      );

      // Position is liquidatable when health factor < 1.0 (RAY)
      if (healthFactor >= RAY) return null;

      // Calculate max repay amount (50% close factor)
      const maxRepayAmount =
        (pos.borrowedAmount * MAX_CLOSE_FACTOR) / BASIS_POINTS;

      // Get current prices for profit estimation
      const collateralPrice = await this.getOraclePrice(
        market.collateralOracle
      );
      const supplyPrice = await this.getOraclePrice(market.supplyOracle);

      // Estimate profit
      const repayValueInCollateral =
        (maxRepayAmount * supplyPrice) / collateralPrice;
      const collateralSeized =
        (repayValueInCollateral * market.liquidationBonus) / BASIS_POINTS;
      const grossProfit = collateralSeized - repayValueInCollateral;

      return {
        marketId: pos.marketId,
        borrower: pos.user,
        healthFactor,
        debtAmount: pos.borrowedAmount,
        collateralAmount: pos.collateralDeposited,
        maxRepayAmount,
        estimatedProfit: grossProfit,
        collateralPrice,
        supplyPrice,
      };
    } catch {
      return null;
    }
  }

  /** Get price from a Chainlink-style oracle */
  private async getOraclePrice(oracleAddress: string): Promise<bigint> {
    const oracle = new ethers.Contract(
      oracleAddress,
      [
        "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
        "function decimals() view returns (uint8)",
      ],
      this.contract.runner
    );

    const [, price, , ,] = await oracle.latestRoundData();
    const decimals = await oracle.decimals();

    // Normalize to 18 decimals
    if (decimals < 18) {
      return BigInt(price) * 10n ** (18n - BigInt(decimals));
    } else if (decimals > 18) {
      return BigInt(price) / 10n ** (BigInt(decimals) - 18n);
    }
    return BigInt(price);
  }

  /** Refresh market data cache */
  private async refreshMarket(marketId: number): Promise<void> {
    const market = await this.contract.getMarket(marketId);
    this.marketCache.set(marketId, {
      marketId,
      supplyToken: market.supplyToken,
      collateralToken: market.collateralToken,
      totalSupplyDeposits: market.totalSupplyDeposits,
      totalBorrows: market.totalBorrows,
      totalCollateralDeposits: market.totalCollateralDeposits,
      collateralFactor: market.collateralFactor,
      liquidationThreshold: market.liquidationThreshold,
      liquidationBonus: market.liquidationBonus,
      supplyOracle: market.supplyOracle,
      collateralOracle: market.collateralOracle,
      isActive: market.isActive,
      cumulativeBorrowIndex: market.cumulativeBorrowIndex,
    });
  }
}
