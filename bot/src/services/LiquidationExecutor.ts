import { ethers } from "ethers";
import { LiquidationOpportunity } from "../types";
import { Logger } from "../utils/logger";

const log = new Logger("LiquidationExecutor");

/**
 * Executes liquidation transactions.
 * Supports both direct liquidation and flash-loan-assisted liquidation.
 */
export class LiquidationExecutor {
  private contract: ethers.Contract;
  private wallet: ethers.Wallet;
  private maxGasPriceGwei: number;

  constructor(
    contract: ethers.Contract,
    wallet: ethers.Wallet,
    maxGasPriceGwei: number
  ) {
    this.contract = contract;
    this.wallet = wallet;
    this.maxGasPriceGwei = maxGasPriceGwei;
  }

  /** Execute a direct liquidation (requires bot to hold supply tokens) */
  async executeLiquidation(
    opportunity: LiquidationOpportunity
  ): Promise<boolean> {
    try {
      log.info("Executing liquidation", {
        marketId: opportunity.marketId,
        borrower: opportunity.borrower,
        repayAmount: opportunity.maxRepayAmount.toString(),
        estimatedProfit: opportunity.estimatedProfit.toString(),
      });

      // Check gas price
      const feeData = await this.wallet.provider!.getFeeData();
      const gasPrice = feeData.gasPrice || 0n;
      const maxGasWei = ethers.parseUnits(
        this.maxGasPriceGwei.toString(),
        "gwei"
      );

      if (gasPrice > maxGasWei) {
        log.warn("Gas price too high, skipping", {
          gasPrice: gasPrice.toString(),
          maxGas: maxGasWei.toString(),
        });
        return false;
      }

      // Estimate gas
      const gasEstimate = await this.contract.liquidate.estimateGas(
        opportunity.marketId,
        opportunity.borrower,
        opportunity.maxRepayAmount
      );

      // Add 20% buffer
      const gasLimit = (gasEstimate * 120n) / 100n;

      // Execute
      const tx = await this.contract.liquidate(
        opportunity.marketId,
        opportunity.borrower,
        opportunity.maxRepayAmount,
        { gasLimit }
      );

      log.info(`Liquidation tx submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      log.info(`Liquidation confirmed in block ${receipt?.blockNumber}`, {
        gasUsed: receipt?.gasUsed.toString(),
      });

      return true;
    } catch (err) {
      log.error("Liquidation failed", err);
      return false;
    }
  }

  /** Execute via flash loan liquidator contract (no upfront capital needed) */
  async executeFlashLoanLiquidation(
    flashLoanContract: ethers.Contract,
    opportunity: LiquidationOpportunity
  ): Promise<boolean> {
    try {
      log.info("Executing flash loan liquidation", {
        marketId: opportunity.marketId,
        borrower: opportunity.borrower,
        repayAmount: opportunity.maxRepayAmount.toString(),
      });

      const tx = await flashLoanContract.initiateLiquidation(
        opportunity.marketId,
        opportunity.borrower,
        opportunity.maxRepayAmount,
        { gasLimit: 500_000 }
      );

      log.info(`Flash loan liquidation tx: ${tx.hash}`);
      const receipt = await tx.wait();
      log.info(
        `Flash loan liquidation confirmed in block ${receipt?.blockNumber}`
      );

      return true;
    } catch (err) {
      log.error("Flash loan liquidation failed", err);
      return false;
    }
  }
}
