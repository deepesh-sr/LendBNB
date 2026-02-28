# MetaLend BNB

**Decentralized lending protocol on BNB Chain with autonomous liquidation bot, real-time analytics dashboard, and flash loan support.**

Built for the BNB Chain Hackathon 2026.

**Live Demo**
> https://drive.google.com/file/d/13e8nHPRonaf6vGzEy54uH2_ohfSIN0sk/view?usp=drivesdk
---

## Problem

DeFi lending on BNB Chain today is fragmented and intimidating:

1. **Capital sits idle** — BNB/BTC holders have no simple way to earn yield or access liquidity without selling
2. **Liquidations are manual** — Most protocols rely on external MEV bots; users get liquidated with no transparency
3. **UX is terrible** — Existing lending dApps overwhelm users with raw numbers, no risk visualization, no portfolio analytics
4. **No real-time alerts** — Users discover they've been liquidated after the fact

## Solution

MetaLend BNB is a **full-stack lending protocol** that solves all four:

| Problem | MetaLend Solution |
|---------|-------------------|
| Idle capital | Supply USDT to earn yield; borrow against BNB/BTC collateral |
| Manual liquidations | Built-in autonomous bot scans every 3s, executes via flash loans |
| Bad UX | Real-time charts, health factor bars, USD conversions, portfolio breakdown |
| No alerts | Liquidation bot with event monitoring + on-chain transparency |

---

## Target Users

| User Type | What They Do | Why MetaLend |
|-----------|-------------|--------------|
| **BNB/BTC Holders** | Hold crypto long-term | Borrow USDT against holdings without selling |
| **Yield Farmers** | Supply stablecoins | Earn utilization-based APY on USDT deposits |
| **Liquidation Bots** | Monitor undercollateralized positions | 10% bonus on seized collateral, flash-loan-assisted |
| **DeFi Developers** | Build on lending primitives | Open-source, flash loan API, composable markets |

---

## User Journey

```mermaid
graph TD
    START["Visit MetaLend Landing Page"] --> CONNECT["Connect MetaMask Wallet<br/>(auto-switches to BSC Testnet)"]

    CONNECT --> CHOOSE{What do you want to do?}

    CHOOSE -->|"Earn Yield"| SUPPLY["Supply USDT to a Market<br/>Receive cTokens"]
    CHOOSE -->|"Get Liquidity"| BORROW["Deposit BNB/BTC as Collateral<br/>Borrow USDT"]
    CHOOSE -->|"Earn Liquidation Rewards"| BOT["Run Liquidation Bot<br/>Monitor unhealthy positions"]

    SUPPLY --> EARN["Earn interest passively<br/>cToken exchange rate grows over time"]
    EARN --> WITHDRAW["Withdraw anytime<br/>Get principal + interest"]

    BORROW --> MONITOR["Monitor Health Factor<br/>in Portfolio Dashboard"]
    MONITOR --> HEALTHY{Health Factor?}
    HEALTHY -->|"Safe (> 1.5)"| HOLD["Hold position<br/>Use borrowed USDT freely"]
    HEALTHY -->|"At Risk (1.0-1.5)"| REPAY["Repay debt to restore health"]
    HEALTHY -->|"Liquidatable (< 1.0)"| LIQUIDATED["Position liquidated<br/>Bot seizes collateral + 10% bonus"]

    HOLD --> REPAY
    REPAY --> COLLATERAL["Withdraw collateral<br/>Position closed"]

    BOT --> SCAN["Scan all positions every 3s"]
    SCAN --> PROFIT["Execute liquidation<br/>Earn ~10% on seized collateral"]

    style START fill:#FFF8E1,stroke:#F0B90B
    style EARN fill:#D1FAE5,stroke:#10B981
    style PROFIT fill:#D1FAE5,stroke:#10B981
    style LIQUIDATED fill:#FEE2E2,stroke:#EF4444
```

---

## System Architecture

```mermaid
graph TB
    subgraph Users["Users"]
        U1["Lender / Supplier"]
        U2["Borrower"]
        U3["Liquidator"]
        U4["Admin / Deployer"]
    end

    subgraph Frontend["Frontend (Next.js 16 + React 19)"]
        LP["Landing Page<br/>(/)"]
        DB["Dashboard<br/>(/app)"]
        AD["Admin Panel<br/>(/admin)"]
        CW["ConnectWallet"]
        MC["MarketCard"]
        CH["Charts (Recharts)"]
    end

    subgraph Blockchain["BNB Chain (Testnet 97)"]
        subgraph Protocol["LendingProtocol.sol"]
            MK["Markets"]
            PS["Positions"]
            IR["Interest Accrual"]
            LQ["Liquidation Engine"]
            FL["Flash Loans"]
        end
        subgraph Oracles["Chainlink Oracles"]
            O1["USDT Oracle"]
            O2["BNB Oracle"]
            O3["BTC Oracle"]
        end
        subgraph Tokens["Mock ERC20"]
            T1["USDT"]
            T2["WBNB"]
            T3["BTCB"]
        end
    end

    subgraph Bot["Liquidation Bot (TypeScript)"]
        PM["PositionMonitor"]
        HS["HealthScanner"]
        LE["LiquidationExecutor"]
    end

    U1 --> DB
    U2 --> DB
    U3 --> Bot
    U4 --> AD

    DB --> CW
    DB --> MC
    DB --> CH
    CW -->|"ethers.js v6"| Protocol
    AD -->|"setPrice()"| Oracles

    Protocol --> Oracles
    Protocol --> Tokens

    PM -->|"Listen Events"| Protocol
    HS -->|"getHealthFactor()"| Protocol
    LE -->|"liquidate()"| Protocol

    style Frontend fill:#f8f9fa,stroke:#1A1A1A
    style Blockchain fill:#FFF8E1,stroke:#F0B90B
    style Bot fill:#E8F5E9,stroke:#10B981
```

---

## Smart Contract Architecture

```mermaid
graph TD
    subgraph Core["Core Contract"]
        LP["LendingProtocol.sol<br/><i>Ownable, Pausable, ReentrancyGuard</i>"]
    end

    subgraph Libraries["Libraries"]
        WRM["WadRayMath.sol<br/>WAD=1e18, RAY=1e27"]
        OL["OracleLib.sol<br/>Chainlink wrapper"]
        IRM["InterestRateModel.sol<br/>Kinked utilization rates"]
    end

    subgraph Interfaces["Interfaces"]
        IFLR["IFlashLoanReceiver.sol<br/>executeOperation()"]
    end

    subgraph External["External Contracts"]
        FLL["FlashLoanLiquidator.sol<br/>Flash loan + liquidate combo"]
        OZ["OpenZeppelin<br/>Ownable, Pausable,<br/>ReentrancyGuard, ERC20"]
        CL["Chainlink<br/>AggregatorV3Interface"]
    end

    subgraph TestMocks["Test Mocks"]
        ME["MockERC20.sol<br/>Mintable ERC20"]
        MCA["MockChainlinkAggregator.sol<br/>Admin-settable prices"]
    end

    LP -->|"uses"| WRM
    LP -->|"uses"| OL
    LP -->|"uses"| IRM
    LP -->|"inherits"| OZ
    LP -->|"calls"| CL
    FLL -->|"implements"| IFLR
    FLL -->|"calls"| LP
    OL -->|"reads"| CL

    style Core fill:#1A1A1A,stroke:#1A1A1A,color:#fff
    style Libraries fill:#E3F2FD,stroke:#2563EB
    style External fill:#FFF3E0,stroke:#F97316
```

---

## Value Proposition

### For Lenders (Supply Side)
- **Passive yield** on USDT deposits — utilization-based APY (like Aave/Compound)
- **cToken model** — interest accrues automatically, withdraw anytime
- **Reserve factor** — protocol retains 10% of interest for sustainability

### For Borrowers (Demand Side)
- **Access liquidity without selling** — deposit BNB/BTC, borrow USDT
- **Real-time health monitoring** — color-coded health factor bar, USD conversions
- **Partial repayment** — repay any amount, even when protocol is paused

### For Liquidators
- **10% bonus** on seized collateral
- **Flash-loan-assisted** — no upfront capital needed
- **Autonomous bot** — scans every 3s, auto-executes profitable liquidations
- **100% close factor** — can liquidate entire debt in one transaction

### For the Ecosystem
- **Open-source** — fully composable, anyone can build on top
- **Flash loans** — 0.3% fee enables arbitrage, liquidations, refinancing
- **BNB Chain native** — low gas, fast finality, growing DeFi ecosystem

---

## Business / Token Model

### Revenue Streams

```mermaid
graph LR
    subgraph Revenue["Protocol Revenue"]
        R1["Reserve Factor<br/>10% of all interest earned"]
        R2["Flash Loan Fees<br/>0.3% per flash loan"]
        R3["Liquidation Spread<br/>Protocol can capture portion<br/>of liquidation bonus"]
    end

    subgraph Distribution["Revenue Distribution (Future)"]
        D1["Treasury<br/>Protocol development"]
        D2["Stakers<br/>Governance token holders"]
        D3["Insurance Fund<br/>Bad debt coverage"]
    end

    R1 --> Distribution
    R2 --> Distribution
    R3 --> Distribution

    style Revenue fill:#FFF8E1,stroke:#F0B90B
    style Distribution fill:#E8F5E9,stroke:#10B981
```

### Current Model (Hackathon / Testnet)
- **No token** — protocol is permissionless, revenue accrues to `totalReserves`
- Reserve factor: **10%** of interest goes to protocol reserves
- Flash loan fee: **0.3%** (30 bps) per flash loan

### Future Token Model (Post-Hackathon)
| Component | Description |
|-----------|-------------|
| **Governance Token (META)** | Vote on market parameters, collateral factors, fee rates |
| **Staking** | Stake META to earn share of protocol revenue (reserve factor + flash loan fees) |
| **Insurance Fund** | Portion of reserves backstops bad debt from liquidation failures |
| **Liquidity Mining** | Distribute META to suppliers/borrowers to bootstrap TVL |

---

## GTM Strategy

### Phase 1: Hackathon Launch (Now)
- Deploy on BSC Testnet with mock tokens
- 2 markets: WBNB/USDT + BTCB/USDT
- Full dashboard + liquidation bot demo
- Open-source codebase

### Phase 2: Community Bootstrap
- Deploy to BSC Mainnet with real assets (USDT, WBNB, BTCB)
- Integrate real Chainlink price feeds
- Launch liquidity mining program to attract initial TVL
- Partner with BNB Chain ecosystem projects (PancakeSwap, Venus comparisons)

### Phase 3: Growth
- Add more collateral types (ETH, SOL, BNB ecosystem tokens)
- Launch governance token (META)
- Telegram bot for position monitoring + liquidation alerts
- Cross-promote with BNB Chain DeFi aggregators (1inch, OpenOcean)

### Phase 4: Differentiation
- Multi-chain expansion (opBNB L2 for lower gas)
- Isolated lending markets (permissionless market creation)
- Real-world asset (RWA) collateral support
- Institutional API for market makers

### Target Metrics

| Metric | Hackathon | 3 Months | 6 Months |
|--------|-----------|----------|----------|
| Markets | 2 | 5-8 | 15+ |
| TVL | Testnet | $500K | $5M+ |
| Users | Demo | 500+ | 5,000+ |
| Liquidation Bot Uptime | Demo | 99.9% | 99.9% |

---

## Data Flow: Supply & Borrow

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant MetaMask
    participant Protocol as LendingProtocol
    participant Token as ERC20 Token
    participant Oracle

    Note over User,Oracle: Supply Flow
    User->>Frontend: Enter amount, click Supply
    Frontend->>MetaMask: approve(protocol, amount)
    MetaMask-->>Token: ERC20.approve()
    Frontend->>MetaMask: supply(marketId, amount)
    MetaMask-->>Protocol: supply()
    Protocol->>Protocol: _accrueInterest()
    Protocol->>Token: transferFrom(user, protocol, amount)
    Protocol->>Protocol: Mint cTokens to user
    Protocol-->>Frontend: Supply event emitted

    Note over User,Oracle: Borrow Flow
    User->>Frontend: Enter collateral + borrow amount
    Frontend->>MetaMask: approve(collateralToken, amount)
    MetaMask-->>Token: ERC20.approve()
    Frontend->>MetaMask: borrow(marketId, collateral, borrowAmt)
    MetaMask-->>Protocol: borrow()
    Protocol->>Protocol: _accrueInterest()
    Protocol->>Token: transferFrom(user, protocol, collateral)
    Protocol->>Oracle: getPrice(supplyOracle, collateralOracle)
    Protocol->>Protocol: Check: borrowValue <= collateralValue x CF
    Protocol->>Token: transfer(protocol, user, borrowAmt)
    Protocol-->>Frontend: Borrow event emitted
```

---

## Data Flow: Liquidation

```mermaid
sequenceDiagram
    actor Bot as Liquidation Bot
    participant Monitor as PositionMonitor
    participant Scanner as HealthScanner
    participant Executor as LiquidationExecutor
    participant Protocol as LendingProtocol
    participant Oracle
    participant Token as ERC20

    Note over Bot,Token: Monitoring Phase (every 3s)
    Monitor->>Protocol: Listen Borrow/Repay/Liquidation events
    Monitor->>Monitor: Build active positions map

    Scanner->>Protocol: getHealthFactor(marketId, user)
    Protocol->>Oracle: getPrice(supply + collateral)
    Protocol-->>Scanner: healthFactor (RAY-scaled)

    alt Health Factor < 1.0
        Scanner->>Scanner: Calculate profit opportunity
        Scanner->>Scanner: maxRepay = debt x closeFactor
        Scanner-->>Executor: LiquidationOpportunity

        Note over Bot,Token: Execution Phase
        Executor->>Executor: Check gas price <= maxGwei
        Executor->>Token: approve(protocol, repayAmount)
        Executor->>Protocol: liquidate(marketId, borrower, repayAmount)
        Protocol->>Token: transferFrom(bot, protocol, repayAmount)
        Protocol->>Protocol: seizedCollateral = repay x price x 1.1
        Protocol->>Token: transfer(protocol, bot, collateral)
        Protocol-->>Executor: Liquidation event
        Executor-->>Bot: Profit = collateral - repayValue
    end
```

---

## Interest Rate Model

```mermaid
graph LR
    subgraph Model["Kinked Interest Rate Model"]
        direction TB
        U["Utilization = Borrows / Supply"]

        subgraph Below["Below Kink (util < 80%)"]
            BR1["BorrowRate = baseRate + util x multiplier"]
        end

        subgraph Above["Above Kink (util >= 80%)"]
            BR2["BorrowRate = baseRate + kink x multiplier<br/>+ (util - kink) x jumpMultiplier"]
        end

        SR["SupplyRate = BorrowRate x util x (1 - reserveFactor)"]
    end

    U --> Below
    U --> Above
    Below --> SR
    Above --> SR

    style Below fill:#E8F5E9,stroke:#10B981
    style Above fill:#FFF3E0,stroke:#F97316
```

### Default Market Parameters

| Parameter | WBNB/USDT | BTCB/USDT |
|-----------|-----------|-----------|
| Collateral Factor | 80% | 75% |
| Liquidation Threshold | 85% | 80% |
| Liquidation Bonus | 10% | 10% |
| Base Rate | 2% | 2% |
| Multiplier | 10% | 10% |
| Jump Multiplier | 300% | 300% |
| Kink | 80% | 80% |
| Reserve Factor | 10% | 10% |

---

## Health Factor & Liquidation Logic

```mermaid
graph TD
    HF["Health Factor Calculation"]

    HF --> FORMULA["HF = (collateral x collateralPrice x liquidationThreshold)<br/>/ (debt x supplyPrice)"]

    FORMULA --> CHECK{HF value?}

    CHECK -->|"HF >= 2.0"| SAFE["Safe<br/>No liquidation risk"]
    CHECK -->|"1.5 <= HF < 2.0"| HEALTHY["Healthy<br/>Low risk"]
    CHECK -->|"1.0 <= HF < 1.5"| ATRISK["At Risk<br/>Monitor closely"]
    CHECK -->|"HF < 1.0"| LIQUIDATABLE["Liquidatable<br/>Can be liquidated"]

    LIQUIDATABLE --> SEIZE["Collateral Seized =<br/>(repayAmount x supplyPrice / collateralPrice)<br/>x liquidationBonus (110%)"]

    SEIZE --> PROFIT["Liquidator Profit =<br/>collateralSeized value - repayAmount value<br/>(~10% bonus)"]

    style SAFE fill:#D1FAE5,stroke:#10B981
    style HEALTHY fill:#D1FAE5,stroke:#10B981
    style ATRISK fill:#FEF3C7,stroke:#F59E0B
    style LIQUIDATABLE fill:#FEE2E2,stroke:#EF4444
```

---

## Setup & Run Instructions

### Prerequisites
- **Node.js** >= 18
- **Foundry** ([install](https://book.getfoundry.sh/getting-started/installation))
- **MetaMask** browser extension

### 1. Smart Contracts
```bash
cd contracts
forge install
forge build
forge test -vv  # 26 tests passing
```

### 2. Deploy to BNB Testnet
```bash
cd contracts
echo "PRIVATE_KEY=your_private_key_here" > .env
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast
```

### 3. Frontend
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_PROTOCOL_ADDRESS=0x672c625114F3C59C6B9869F73a08afb311A66605" > .env.local
npm run dev    # http://localhost:3000
npm run build  # Production build
```

### 4. Liquidation Bot
```bash
cd bot
npm install
cp .env.example .env
# Fill in: RPC_URL, PRIVATE_KEY, LENDING_PROTOCOL_ADDRESS
npm run dev
```

---

## Frontend Architecture

```mermaid
graph TD
    subgraph Pages["App Router (Next.js 16)"]
        LP["/ Landing Page<br/>Hero + Video + CTA"]
        APP["/app Dashboard<br/>Markets | Dashboard | Liquidations"]
        ADMIN["/admin Oracle Panel<br/>Deployer-only price mgmt"]
    end

    subgraph Components["Shared Components"]
        CW["ConnectWallet<br/>MetaMask integration"]
        MC["MarketCard<br/>Market overview tile"]
        HB["HealthBar<br/>Color-coded HF bar"]
        IT["InfoTip<br/>Hover tooltips"]
    end

    subgraph Charts["Charts (Recharts)"]
        MDC["MarketDistributionChart<br/>Supply/Borrow donuts"]
        ACC["ApyComparisonChart<br/>APY vs APR bars"]
        PBC["PortfolioBreakdownChart<br/>Portfolio donut + net worth"]
        UG["UtilizationGauge<br/>Pool utilization bars"]
    end

    subgraph Lib["Contract Layer"]
        CT["contracts.ts<br/>5 RPC rotation<br/>Provider + Signer"]
        ABI["LendingProtocol.json<br/>Contract ABI"]
    end

    APP --> CW
    APP --> MC
    APP --> HB
    APP --> IT
    APP --> MDC
    APP --> ACC
    APP --> PBC
    APP --> UG
    APP --> CT
    CT --> ABI
    ADMIN --> CT

    style Pages fill:#f8f9fa,stroke:#1A1A1A
    style Charts fill:#EDE7F6,stroke:#7C3AED
```

---

## Liquidation Bot Architecture

```mermaid
graph TD
    subgraph Entry["index.ts - Main Loop"]
        BOOT["Bootstrap<br/>Load 50k blocks of<br/>historical Borrow events"]
        LISTEN["Start Real-Time<br/>Event Listeners"]
        SCAN["Scan Loop<br/>(every 3s)"]
    end

    subgraph Services["Services"]
        PM["PositionMonitor<br/>---<br/>bootstrap(fromBlock)<br/>startListening()<br/>refreshPosition()<br/>getActivePositions()"]

        HS["HealthScanner<br/>---<br/>scanPositions()<br/>checkPosition()<br/>getOraclePrice()<br/>estimateProfit()"]

        LE["LiquidationExecutor<br/>---<br/>executeLiquidation()<br/>executeFlashLoan()<br/>checkGasPrice()"]
    end

    subgraph Events["On-Chain Events"]
        E1["Borrow - add position"]
        E2["Repay - update position"]
        E3["Liquidation - remove position"]
        E4["CollateralDeposited/Withdrawn"]
    end

    BOOT --> PM
    LISTEN --> PM
    SCAN --> HS
    HS -->|"HF < 1.0 + profitable"| LE
    LE -->|"TX result"| PM

    PM --> E1
    PM --> E2
    PM --> E3
    PM --> E4

    style Entry fill:#E8F5E9,stroke:#10B981
    style Services fill:#f8f9fa,stroke:#1A1A1A
```

---

## Deployment Pipeline

```mermaid
graph LR
    subgraph Deploy["Deploy.s.sol"]
        D1["1. Deploy MockERC20s<br/>USDT, WBNB, BTCB"]
        D2["2. Deploy Mock Oracles<br/>USDT=$1, BNB=$600, BTC=$95K"]
        D3["3. Deploy LendingProtocol"]
        D4["4. Create Market 0<br/>WBNB/USDT (CF=80%)"]
        D5["5. Create Market 1<br/>BTCB/USDT (CF=75%)"]
        D6["6. Mint initial tokens<br/>to deployer"]
    end

    D1 --> D2 --> D3 --> D4 --> D5 --> D6

    subgraph Config["Frontend Config"]
        F1["Set PROTOCOL_ADDRESS<br/>in .env.local"]
        F2["Update TOKEN_NAMES<br/>mapping in page.tsx"]
        F3["Update oracle addresses<br/>in admin/page.tsx"]
    end

    D6 --> F1 --> F2 --> F3

    style Deploy fill:#FFF8E1,stroke:#F0B90B
    style Config fill:#f8f9fa,stroke:#1A1A1A
```

---

## Deployed Contracts (BSC Testnet)

| Contract | Address |
|----------|---------|
| LendingProtocol | `0x672c625114F3C59C6B9869F73a08afb311A66605` |
| USDT (Mock) | `0xaCACff158CF0835363e990Fc8a872e1599BBDDD8` |
| WBNB (Mock) | `0x3aB19925952191bc4d6eCF3bC5D54CfA8Ba1A6Bc` |
| BTCB (Mock) | `0xdCbc46262A3dCFbD750FF8cd07d41C50e0Ed2020` |
| USDT Oracle | `0xFc015236bEBceec6DF200A9512a3b3548967A274` |
| BNB Oracle | `0x8F3F65415bd7AEDB1DFB704E12FeD5b31D3c38ce` |
| BTC Oracle | `0x030adD56f70B6903BD3bCE647a1f57314CfFCE20` |

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Smart Contracts | Solidity, Foundry, OpenZeppelin | 0.8.30 |
| Oracles | Chainlink AggregatorV3 (Mock on testnet) | -- |
| Bot | TypeScript, ethers.js | v6 |
| Frontend | Next.js, React, TypeScript | 16.1.6 / 19 / 5 |
| Styling | Tailwind CSS v4, Framer Motion | v4 / 12 |
| Charts | Recharts | 2 |
| Wallet | MetaMask (browser extension) | -- |
| Network | BNB Smart Chain Testnet | Chain 97 |

---

## Project Structure

```
metalend-bnb/
├── contracts/                    # Foundry (Solidity 0.8.30)
│   ├── src/
│   │   ├── LendingProtocol.sol              # Core protocol (623 lines)
│   │   ├── FlashLoanLiquidator.sol          # Flash loan liquidation receiver
│   │   ├── libraries/
│   │   │   ├── WadRayMath.sol               # Fixed-point math (WAD=1e18, RAY=1e27)
│   │   │   ├── OracleLib.sol                # Chainlink oracle + staleness check
│   │   │   └── InterestRateModel.sol        # Kinked utilization-based rates
│   │   └── interfaces/
│   │       └── IFlashLoanReceiver.sol       # Flash loan callback
│   ├── test/
│   │   ├── LendingProtocol.t.sol            # 26 tests
│   │   └── mocks/
│   │       ├── MockERC20.sol                # Mintable test token
│   │       └── MockChainlinkAggregator.sol  # Admin-settable price feed
│   ├── script/
│   │   └── Deploy.s.sol                     # Testnet deployment (2 markets)
│   └── foundry.toml                         # Solc 0.8.30, via_ir enabled
│
├── frontend/                     # Next.js 16.1.6 + React 19
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                     # Landing page
│   │   │   ├── app/page.tsx                 # Dashboard (Markets/Portfolio/Liquidations)
│   │   │   ├── admin/page.tsx               # Oracle price management
│   │   │   ├── layout.tsx                   # Root layout (Inter font)
│   │   │   └── globals.css                  # Tailwind v4 imports
│   │   ├── components/
│   │   │   ├── ConnectWallet.tsx             # MetaMask connect/switch/disconnect
│   │   │   ├── MarketCard.tsx               # Market overview card
│   │   │   ├── HealthBar.tsx                # Health factor visualization
│   │   │   ├── InfoTip.tsx                  # Hover tooltips
│   │   │   └── charts/
│   │   │       ├── MarketDistributionChart.tsx  # Supply/borrow donut charts
│   │   │       ├── ApyComparisonChart.tsx       # APY vs APR bar chart
│   │   │       ├── PortfolioBreakdownChart.tsx  # Portfolio allocation donut
│   │   │       └── UtilizationGauge.tsx         # Pool utilization bars
│   │   └── lib/
│   │       ├── contracts.ts                 # 5 RPC rotation, provider helpers
│   │       └── LendingProtocol.json         # Contract ABI
│   └── package.json
│
├── bot/                          # TypeScript liquidation bot
│   ├── src/
│   │   ├── index.ts                         # Entry point + main scan loop
│   │   ├── config.ts                        # Env vars + constants
│   │   ├── services/
│   │   │   ├── PositionMonitor.ts           # Event-driven position tracking
│   │   │   ├── HealthScanner.ts             # HF scanning + profit estimation
│   │   │   └── LiquidationExecutor.ts       # TX execution + gas management
│   │   ├── types/index.ts                   # TypeScript interfaces
│   │   └── utils/logger.ts                  # Logging
│   ├── abi/LendingProtocol.json             # Contract ABI
│   └── package.json
│
├── README.md                     # This file
└── docs.md                       # Detailed documentation
```

---

## Core Smart Contract Functions

| Function | Description | Access |
|----------|-------------|--------|
| `createMarket()` | Create lending market with token pair + params | Owner only |
| `supply(marketId, amount)` | Deposit supply tokens, receive cTokens | whenNotPaused |
| `withdraw(marketId, ctokens)` | Burn cTokens, receive underlying + interest | whenNotPaused |
| `borrow(marketId, collateral, amount)` | Lock collateral, borrow supply tokens | whenNotPaused |
| `repay(marketId, amount)` | Repay borrowed tokens | Always (even paused) |
| `withdrawCollateral(marketId, amount)` | Withdraw collateral (health check) | whenNotPaused |
| `liquidate(marketId, borrower, amount)` | Liquidate unhealthy position (HF < 1.0) | Always (even paused) |
| `flashLoan(marketId, amount, receiver, data)` | Borrow + repay in one tx (0.3% fee) | whenNotPaused |

---

## Protocol Constants

| Constant | Value | Description |
|----------|-------|-------------|
| RAY | 1e27 | High-precision scaling factor |
| WAD | 1e18 | Standard ERC20 precision |
| BASIS_POINTS | 10,000 | 100% = 10000 basis points |
| MAX_CLOSE_FACTOR | 10,000 | 100% of debt can be liquidated |
| FLASH_LOAN_FEE | 30 bps | 0.3% flash loan fee |
| SECONDS_PER_YEAR | 31,557,600 | 365.25 days |

---

## Improvements Over Original Solana MetaLend

1. **Interest Model**: Flat 2%/1% -> utilization-based kinked model (like Aave/Compound)
2. **Liquidation Fix**: Proper dual-price conversion (original used same oracle for both assets)
3. **Close Factor**: 50% -> 100% (full debt can be liquidated per tx)
4. **Reserve Factor**: Protocol captures 10% of interest
5. **Partial Collateral Withdrawal**: Allowed if health factor stays > 1.0
6. **Flash Loan Safety**: EVM ReentrancyGuard (vs Solana's unsafe `mem::transmute`)
7. **Oracle Integration**: Chainlink with staleness validation (1hr max)

---

## Testing

All 26 tests passing (`forge test -vv`):

| Category | Tests |
|----------|-------|
| Market Creation | 3 (valid + 2 revert cases) |
| Supply/Withdraw | 5 (single/multi user, exchange rate) |
| Borrow/Repay | 5 (collateral validation, max borrow, health) |
| Liquidation | 5 (price drops, bonus, close factor) |
| Collateral Withdrawal | 3 (health checks, partial) |
| Flash Loans | 3 (basic, fees, repayment) |
| Interest Accrual | 2 (time-based, cToken rate changes) |

---

## Roadmap

```mermaid
gantt
    title MetaLend BNB Roadmap
    dateFormat YYYY-MM
    axisFormat %b %Y

    section Phase 1 - Hackathon
    Core Protocol Development       :done, p1a, 2026-02, 2026-02
    Dashboard + Charts              :done, p1b, 2026-02, 2026-02
    Liquidation Bot                 :done, p1c, 2026-02, 2026-02
    Testnet Deployment              :done, p1d, 2026-02, 2026-03

    section Phase 2 - Launch
    Mainnet Deployment              :p2a, 2026-03, 2026-04
    Real Chainlink Oracles          :p2b, 2026-03, 2026-04
    Liquidity Mining Program        :p2c, 2026-04, 2026-05
    Telegram Alert Bot              :p2d, 2026-04, 2026-05

    section Phase 3 - Growth
    Governance Token (META)         :p3a, 2026-05, 2026-07
    5+ New Collateral Types         :p3b, 2026-05, 2026-07
    Mobile-Optimized UI             :p3c, 2026-06, 2026-07
    DeFi Aggregator Integrations    :p3d, 2026-06, 2026-08

    section Phase 4 - Scale
    opBNB L2 Deployment             :p4a, 2026-08, 2026-10
    Isolated Lending Markets        :p4b, 2026-08, 2026-10
    RWA Collateral Support          :p4c, 2026-09, 2026-11
    Institutional API               :p4d, 2026-10, 2026-12
```

---

## License

MIT
