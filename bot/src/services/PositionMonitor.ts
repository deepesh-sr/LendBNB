import { ethers } from "ethers";
import { UserPosition } from "../types";
import { Logger } from "../utils/logger";

const log = new Logger("PositionMonitor");

/**
 * Monitors on-chain events to track all positions with active borrows.
 * Replaces the need to scan all accounts like on Solana.
 */
export class PositionMonitor {
  private contract: ethers.Contract;
  private positions: Map<string, UserPosition> = new Map();

  constructor(contract: ethers.Contract) {
    this.contract = contract;
  }

  /** Build initial position map from historical Borrow events */
  async bootstrap(fromBlock: number = 0): Promise<void> {
    log.info("Bootstrapping positions from historical events...");

    const borrowFilter = this.contract.filters.Borrow();
    const borrowEvents = await this.contract.queryFilter(
      borrowFilter,
      fromBlock
    );

    for (const event of borrowEvents) {
      const parsed = this.contract.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });
      if (!parsed) continue;

      const { marketId, user } = parsed.args;
      await this.refreshPosition(Number(marketId), user);
    }

    log.info(`Bootstrapped ${this.positions.size} positions`);
  }

  /** Start real-time event monitoring */
  async startListening(): Promise<void> {
    log.info("Starting real-time event monitoring...");

    this.contract.on("Borrow", async (marketId: bigint, user: string) => {
      log.info("Borrow event", { marketId: Number(marketId), user });
      await this.refreshPosition(Number(marketId), user);
    });

    this.contract.on("Repay", async (marketId: bigint, user: string) => {
      log.info("Repay event", { marketId: Number(marketId), user });
      await this.refreshPosition(Number(marketId), user);
    });

    this.contract.on(
      "Liquidation",
      async (marketId: bigint, borrower: string) => {
        log.info("Liquidation event", {
          marketId: Number(marketId),
          borrower,
        });
        await this.refreshPosition(Number(marketId), borrower);
      }
    );

    this.contract.on(
      "CollateralWithdrawn",
      async (marketId: bigint, user: string) => {
        log.info("CollateralWithdrawn event", {
          marketId: Number(marketId),
          user,
        });
        await this.refreshPosition(Number(marketId), user);
      }
    );

    this.contract.on(
      "CollateralDeposited",
      async (marketId: bigint, user: string) => {
        await this.refreshPosition(Number(marketId), user);
      }
    );
  }

  /** Refresh a single position from the contract */
  async refreshPosition(marketId: number, user: string): Promise<void> {
    const pos = await this.contract.getPosition(marketId, user);
    const key = `${marketId}-${user}`;

    const position: UserPosition = {
      user,
      marketId,
      supplyDeposited: pos.supplyDeposited,
      collateralDeposited: pos.collateralDeposited,
      borrowedAmount: pos.borrowedAmount,
      ctokenBalance: pos.ctokenBalance,
      borrowIndex: pos.borrowIndex,
    };

    if (position.borrowedAmount > 0n) {
      this.positions.set(key, position);
    } else {
      this.positions.delete(key);
    }
  }

  /** Get all tracked positions with active borrows */
  getActivePositions(): Map<string, UserPosition> {
    return this.positions;
  }

  /** Get count of active positions */
  getPositionCount(): number {
    return this.positions.size;
  }
}
