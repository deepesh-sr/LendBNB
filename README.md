# MetaLend BNB - DeFi Lending Protocol

A decentralized lending protocol on BNB Chain with AI-powered liquidation bots, built for the BNB Chain Hackathon 2026.

## Architecture

MetaLend BNB is a **dual-asset lending protocol** where users can:
- **Supply** assets to earn interest through cToken appreciation
- **Deposit collateral** to borrow different assets
- **Liquidate** undercollateralized positions with a 10% bonus
- **Flash loans** for capital-efficient strategies

### Key Features

- **Utilization-based interest rates**: Kinked model (like Aave/Compound) with configurable base rate, slope, and jump multiplier
- **AI Liquidation Bot**: Autonomous bot that monitors health factors, calculates profitability, and executes flash-loan-assisted liquidations
- **Real-time Dashboard**: Next.js frontend with health factor visualization, risk scoring, and liquidation feed
- **Oracle Integration**: Chainlink-compatible price feeds with staleness validation
- **Security**: ReentrancyGuard, Pausable, Close Factor (50% max), and proper access controls

## Project Structure

```
metalend-bnb/
  contracts/          # Solidity smart contracts (Foundry)
    src/
      LendingProtocol.sol         # Core lending protocol
      FlashLoanLiquidator.sol     # Flash loan liquidation receiver
      libraries/
        WadRayMath.sol            # Fixed-point math (ray = 1e27)
        OracleLib.sol             # Chainlink oracle wrapper
        InterestRateModel.sol     # Utilization-based interest rates
      interfaces/
        IFlashLoanReceiver.sol    # Flash loan callback interface
    test/
      LendingProtocol.t.sol       # 26 comprehensive tests
      mocks/
        MockERC20.sol
        MockChainlinkAggregator.sol
    script/
      Deploy.s.sol                # BNB testnet deployment

  bot/                # TypeScript liquidation bot
    src/
      index.ts                    # Bot entry point
      services/
        PositionMonitor.ts        # Event-driven position tracking
        HealthScanner.ts          # Health factor scanning
        LiquidationExecutor.ts    # TX execution with gas estimation

  frontend/           # Next.js dashboard
    src/
      app/page.tsx                # Main dashboard
      components/
        ConnectWallet.tsx
        MarketCard.tsx
        HealthBar.tsx
```

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.30, Foundry, OpenZeppelin |
| Oracles | Chainlink AggregatorV3 (+ Mock for testnet) |
| Bot | TypeScript, ethers.js v6 |
| Frontend | Next.js 14, Tailwind CSS, ethers.js |
| Network | BNB Chain (testnet / mainnet) |

## Quick Start

### Smart Contracts

```bash
cd contracts
forge install
forge build
forge test -vv  # 26 tests passing
```

### Deploy to BNB Testnet

```bash
# Set up .env with PRIVATE_KEY
forge script script/Deploy.s.sol --rpc-url https://data-seed-prebsc-1-s1.binance.org:8545 --broadcast
```

### Liquidation Bot

```bash
cd bot
npm install
cp .env.example .env  # Fill in addresses
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev  # Opens at localhost:3000
```

## Smart Contract Design

### Ported from Solana MetaLend with improvements:

1. **Interest Model**: Upgraded from flat 2%/1% to utilization-based kinked model
2. **Liquidation Fix**: Proper dual-price conversion (original had a bug using same oracle for both assets)
3. **Close Factor**: 50% max liquidation per transaction
4. **Reserve Factor**: Protocol captures a portion of interest
5. **Partial Collateral Withdrawal**: Allowed with active borrows if health stays above 1.0
6. **Flash Loan Safety**: EVM ReentrancyGuard (vs Solana's unsafe mem::transmute)

### Core Functions

| Function | Description |
|---|---|
| `createMarket()` | Create new lending market with supply/collateral pair |
| `supply()` | Deposit supply tokens, receive cTokens |
| `withdraw()` | Burn cTokens, receive underlying + interest |
| `borrow()` | Deposit collateral, borrow supply tokens |
| `repay()` | Repay borrowed tokens |
| `withdrawCollateral()` | Withdraw collateral (health check enforced) |
| `liquidate()` | Liquidate unhealthy positions with bonus |
| `flashLoan()` | Borrow and repay in single transaction (0.3% fee) |

## Testing

All 26 tests passing:
- Market creation and validation
- Supply/withdraw with cToken exchange rates
- Borrow with collateral factor enforcement
- Repay (partial and full)
- Collateral withdrawal with health checks
- Liquidation with price drops and bonus
- Flash loans with callback verification
- Interest accrual over time
- Pause/unpause (repay + liquidate always work)
- Full lifecycle integration test

## License

MIT
