import { ethers } from "ethers";
import { loadConfig } from "./config";
import { PositionMonitor } from "./services/PositionMonitor";
import { HealthScanner } from "./services/HealthScanner";
import { LiquidationExecutor } from "./services/LiquidationExecutor";
import { Logger } from "./utils/logger";
import * as protocolAbi from "../abi/LendingProtocol.json";

const log = new Logger("Bot");

async function main() {
  log.info("Starting MetaLend Liquidation Bot...");

  // Load config
  const config = loadConfig();
  log.info("Config loaded", {
    rpcUrl: config.rpcUrl,
    protocolAddress: config.protocolAddress,
    scanInterval: config.scanIntervalMs,
  });

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  log.info(`Bot wallet: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  log.info(`Wallet balance: ${ethers.formatEther(balance)} BNB`);

  // Setup contract
  const protocol = new ethers.Contract(
    config.protocolAddress,
    protocolAbi,
    wallet
  );

  // Initialize services
  const monitor = new PositionMonitor(protocol);
  const scanner = new HealthScanner(protocol);
  const executor = new LiquidationExecutor(
    protocol,
    wallet,
    config.maxGasPriceGwei
  );

  // Bootstrap from historical events
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 50000); // Last ~50k blocks
  await monitor.bootstrap(fromBlock);

  // Start real-time monitoring
  await monitor.startListening();
  log.info("Real-time monitoring active");

  // Main loop: scan positions periodically
  log.info(
    `Starting scan loop (every ${config.scanIntervalMs}ms)...`
  );

  const scanLoop = async () => {
    try {
      const positions = monitor.getActivePositions();
      if (positions.size === 0) {
        return;
      }

      log.info(`Scanning ${positions.size} active positions...`);
      const opportunities = await scanner.scanPositions(positions);

      for (const opp of opportunities) {
        log.info("Liquidation opportunity found!", {
          borrower: opp.borrower,
          marketId: opp.marketId,
          healthFactor: opp.healthFactor.toString(),
          debt: ethers.formatEther(opp.debtAmount),
          profit: ethers.formatEther(opp.estimatedProfit),
        });

        // Check profitability
        const profitUsd =
          Number(ethers.formatEther(opp.estimatedProfit)) *
          Number(ethers.formatEther(opp.supplyPrice));

        if (profitUsd < config.minProfitUsd) {
          log.info(
            `Skipping -- profit $${profitUsd.toFixed(2)} < min $${config.minProfitUsd}`
          );
          continue;
        }

        // Execute liquidation
        const success = await executor.executeLiquidation(opp);
        if (success) {
          log.info(`Successfully liquidated ${opp.borrower} on market ${opp.marketId}`);
          // Refresh the position after liquidation
          await monitor.refreshPosition(opp.marketId, opp.borrower);
        }
      }
    } catch (err) {
      log.error("Scan loop error", err);
    }
  };

  // Run immediately, then on interval
  await scanLoop();
  setInterval(scanLoop, config.scanIntervalMs);

  // Keep process alive
  log.info("Bot is running. Press Ctrl+C to stop.");
  process.on("SIGINT", () => {
    log.info("Shutting down...");
    process.exit(0);
  });
}

main().catch((err) => {
  log.error("Fatal error", err);
  process.exit(1);
});
