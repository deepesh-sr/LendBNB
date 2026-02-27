export interface MarketData {
  marketId: number;
  supplyToken: string;
  collateralToken: string;
  totalSupplyDeposits: bigint;
  totalBorrows: bigint;
  totalCollateralDeposits: bigint;
  collateralFactor: bigint;
  liquidationThreshold: bigint;
  liquidationBonus: bigint;
  supplyOracle: string;
  collateralOracle: string;
  isActive: boolean;
  cumulativeBorrowIndex: bigint;
}

export interface UserPosition {
  user: string;
  marketId: number;
  supplyDeposited: bigint;
  collateralDeposited: bigint;
  borrowedAmount: bigint;
  ctokenBalance: bigint;
  borrowIndex: bigint;
}

export interface LiquidationOpportunity {
  marketId: number;
  borrower: string;
  healthFactor: bigint;
  debtAmount: bigint;
  collateralAmount: bigint;
  maxRepayAmount: bigint;
  estimatedProfit: bigint;
  collateralPrice: bigint;
  supplyPrice: bigint;
}

export interface BotConfig {
  rpcUrl: string;
  privateKey: string;
  protocolAddress: string;
  flashLoanLiquidatorAddress: string;
  scanIntervalMs: number;
  minProfitUsd: number;
  maxGasPriceGwei: number;
}
