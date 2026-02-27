import dotenv from "dotenv";
import { BotConfig } from "./types";

dotenv.config();

export function loadConfig(): BotConfig {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const protocolAddress = process.env.LENDING_PROTOCOL_ADDRESS;
  const flashLoanLiquidatorAddress = process.env.FLASH_LOAN_LIQUIDATOR_ADDRESS;

  if (!rpcUrl || !privateKey || !protocolAddress) {
    throw new Error(
      "Missing required env vars: RPC_URL, PRIVATE_KEY, LENDING_PROTOCOL_ADDRESS"
    );
  }

  return {
    rpcUrl,
    privateKey,
    protocolAddress,
    flashLoanLiquidatorAddress: flashLoanLiquidatorAddress || "",
    scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || "3000"),
    minProfitUsd: parseFloat(process.env.MIN_PROFIT_USD || "1.0"),
    maxGasPriceGwei: parseFloat(process.env.MAX_GAS_PRICE_GWEI || "10"),
  };
}
