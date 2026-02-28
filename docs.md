# MetaLend BNB — Documentation

## What is MetaLend?

MetaLend BNB is a **decentralized lending protocol** on BNB Chain. It lets users lend crypto to earn interest, and borrow crypto by locking collateral. Think of it as a decentralized bank — no KYC, no middleman, fully on-chain.

It is a port and improvement of the original Solana-based MetaLend, rebuilt with Solidity smart contracts for the **BNB Chain Hackathon 2026**.

---

## What Are We Building?

A full-stack DeFi lending protocol with:

1. **Smart Contracts** — Core lending logic (supply, borrow, repay, liquidate, flash loans)
2. **Frontend** — Landing page + trading dashboard + admin panel
3. **AI Liquidation Bots** — Automated monitoring and liquidation of unhealthy positions
4. **Oracle Integration** — Chainlink-compatible price feeds for asset pricing

---

## The Complete Flow

### 1. Market Creation (Admin)

The protocol owner creates **lending markets**. Each market is a pair:
- **Supply Token** — what lenders deposit and borrowers receive (e.g., USDT)
- **Collateral Token** — what borrowers lock to secure their loan (e.g., WBNB)

Each market has parameters:

| Parameter | Example | Meaning |
|-----------|---------|---------|
| Collateral Factor | 8000 (80%) | Max borrow = 80% of collateral value |
| Liquidation Threshold | 8500 (85%) | Position becomes liquidatable below this |
| Liquidation Bonus | 11000 (10% bonus) | Extra collateral liquidators receive |
| Base Rate | 2% APY | Minimum borrow cost |
| Kink | 80% | Optimal utilization target |
| Reserve Factor | 1000 (10%) | Protocol's cut of interest |

**Current Markets:**
- **Market 1**: WBNB/USDT (deposit BNB as collateral, borrow USDT)
- **Market 2**: BTCB/USDT (deposit BTC as collateral, borrow USDT)

---

### 2. Supplying (Lenders)

**What:** Lenders deposit supply tokens (e.g., USDT) into the pool.

**How it works:**
1. User calls `supply(marketId, amount)`
2. Protocol transfers USDT from user to the pool
3. User receives **cTokens** (receipt tokens) representing their share
4. As interest accrues, each cToken is worth more underlying USDT

**cToken Exchange Rate:**
```
exchangeRate = totalSupplyDeposits / totalCtokenSupply
```

**Example:**
- Alice supplies 10,000 USDT at 1:1 exchange rate → gets 10,000 cTokens
- After a year (with interest), exchange rate becomes 1.08:1
- Alice's 10,000 cTokens are now worth 10,800 USDT
- She earned 800 USDT in interest (8% APY)

**Withdrawal:** User burns cTokens to get back underlying + earned interest.

---

### 3. Borrowing

**What:** Borrowers lock collateral (e.g., WBNB) and borrow supply tokens (e.g., USDT).

**How it works:**
1. User calls `borrow(marketId, collateralAmount, borrowAmount)`
2. Protocol transfers collateral from user and locks it
3. Protocol transfers borrowed USDT to user
4. User's max borrow is capped by the **Collateral Factor**

**Max Borrow Calculation:**
```
maxBorrowValue = collateralAmount * collateralPrice * collateralFactor / 10000
```

**Example:**
- Bob deposits 1 WBNB (worth $600) as collateral
- Collateral Factor = 80%
- Max borrow = 1 × $600 × 0.80 = **$480 USDT**
- Bob borrows 400 USDT (within limit)

**Additional constraint:** Borrow cannot exceed available pool liquidity (total supply - total borrows).

---

### 4. Interest Rates

Interest is dynamic and based on **utilization** (how much of the pool is borrowed):

```
utilization = totalBorrows / totalSupply
```

**Below Kink (80%):**
```
borrowRate = baseRate + (utilization × multiplier)
= 2% + (utilization × 10%)
```

**Above Kink (80%):**
```
borrowRate = baseRate + (kink × multiplier) + ((utilization - kink) × jumpMultiplier)
= 10% + ((utilization - 80%) × 300%)
```

**Rate Curve Example:**

| Utilization | Borrow Rate | Supply Rate (approx) |
|------------|-------------|---------------------|
| 0% | 2.0% | 0.0% |
| 20% | 4.0% | 0.7% |
| 40% | 6.0% | 2.2% |
| 60% | 8.0% | 4.3% |
| 80% (kink) | 10.0% | 7.2% |
| 85% | 25.0% | 19.1% |
| 90% | 40.0% | 32.4% |
| 95% | 55.0% | 47.0% |
| 100% | 70.0% | 63.0% |

The steep jump above 80% incentivizes borrowers to repay and suppliers to deposit — keeping the pool liquid.

**Supply Rate formula:**
```
supplyRate = borrowRate × utilization × (1 - reserveFactor)
```

Suppliers earn a portion of the interest borrowers pay. The remaining 10% (reserveFactor) goes to protocol reserves.

**Interest Accrual:** Interest compounds every time someone interacts with the market (supply, borrow, repay, liquidate). The `cumulativeBorrowIndex` tracks how much each borrower owes over time.

---

### 5. Health Factor

The **Health Factor (HF)** measures how safe a borrower's position is:

```
HF = (collateralValue × liquidationThreshold) / borrowValue
```

| Health Factor | Status |
|--------------|--------|
| > 1.5 | Safe |
| 1.0 - 1.5 | At risk (should add collateral or repay) |
| < 1.0 | Liquidatable (anyone can liquidate) |

**What makes HF drop?**
- Collateral price drops (BNB goes down)
- Debt grows from interest accrual
- Borrower doesn't repay

**Example:**
- Bob has 1 BNB ($600), borrowed 400 USDT
- HF = (600 × 0.85) / 400 = **1.275** (healthy)
- BNB drops to $400:
- HF = (400 × 0.85) / 400 = **0.85** (liquidatable!)

---

### 6. Liquidation

**What:** When a borrower's Health Factor drops below 1.0, anyone can liquidate their position.

**How it works:**
1. Liquidator identifies an underwater position (HF < 1.0)
2. Liquidator repays **up to 50%** of the borrower's debt (MAX_CLOSE_FACTOR)
3. In return, liquidator receives the borrower's collateral at a **10% discount** (liquidation bonus)
4. The collateral comes directly from the borrower's locked collateral

**Collateral Seizure Formula:**
```
repayValueInCollateral = repayAmount × supplyPrice / collateralPrice
collateralSeized = repayValueInCollateral × liquidationBonus / 10000
```

**Full Example:**
1. Bob deposited 1 WBNB ($600) and borrowed 400 USDT
2. BNB price drops to $400 → HF = 0.85 (liquidatable)
3. Liquidator repays 200 USDT (50% of 400 USDT debt)
4. Collateral seized:
   - repayValueInCollateral = 200 × 1 / 400 = 0.5 WBNB
   - With 10% bonus: 0.5 × 11000 / 10000 = **0.55 WBNB**
5. Liquidator pays 200 USDT, receives 0.55 WBNB (worth $220) → **$20 profit**
6. Bob's remaining: 0.45 WBNB collateral, 200 USDT debt

**Who pays the 10% bonus?** The borrower — it comes from their locked collateral. The protocol doesn't pay anything.

**Can the borrower liquidate themselves?** Technically yes, but it's pointless. They'd lose 10% of their collateral for no reason. Better to just repay directly.

**Key protections:**
- Max 50% of debt per liquidation (prevents total wipeout in one tx)
- Collateral seized is capped at available collateral
- Only works when HF < 1.0

---

### 7. Flash Loans

**What:** Borrow any amount from the pool within a single transaction, as long as you return it + 0.3% fee.

**Fee:** 0.3% (30 basis points)

**Use cases:**
- Arbitrage between DEXs
- Self-liquidation (borrow to repay own debt)
- Collateral swaps
- Liquidation bots (borrow → liquidate → sell collateral → repay)

**Flow:**
1. Borrower calls `flashLoan(marketId, amount, receiver, data)`
2. Protocol sends `amount` to receiver
3. Receiver's `executeOperation()` callback runs (do anything here)
4. Protocol checks `balance >= originalBalance + fee`
5. Fee goes to suppliers (added to pool)

**Flash Loan Liquidation Bot:**
The `FlashLoanLiquidator.sol` contract demonstrates this:
1. Bot detects underwater position
2. Borrows USDT via flash loan
3. Uses USDT to liquidate the position
4. Receives collateral (e.g., WBNB) at 10% discount
5. Swaps collateral for USDT on a DEX
6. Repays flash loan + 0.3% fee
7. Keeps the profit

---

### 8. Repayment

**What:** Borrower repays their debt to reduce borrowed amount.

**How:**
1. User calls `repay(marketId, amount)`
2. Protocol transfers supply tokens from user
3. Debt is reduced by repay amount
4. If full debt repaid, user can withdraw all collateral

**Important:** Debt grows over time due to interest. The actual debt = `borrowedAmount × (currentBorrowIndex / userBorrowIndex)`.

---

### 9. Collateral Withdrawal

**What:** Borrower withdraws some or all of their locked collateral.

**Rules:**
- If no active borrows → withdraw freely
- If active borrows → must maintain HF > 1.0 after withdrawal
- Cannot withdraw if it would make position liquidatable

---

## Architecture

### Smart Contracts

```
LendingProtocol.sol (Core)
├── supply() / withdraw()          — Lender operations
├── borrow() / repay()             — Borrower operations
├── withdrawCollateral()           — Collateral management
├── liquidate()                    — Liquidation
├── flashLoan()                    — Flash loans
├── createMarket()                 — Admin: create markets
├── pauseProtocol()                — Admin: emergency pause
└── View functions                 — getMarket, getPosition, getHealthFactor, etc.

Libraries:
├── OracleLib.sol                  — Chainlink price feed wrapper (staleness checks)
├── InterestRateModel.sol          — Utilization-based rate calculation
└── WadRayMath.sol                 — Fixed-point math (18 & 27 decimal precision)

Supporting:
├── FlashLoanLiquidator.sol        — Reference liquidation bot
└── IFlashLoanReceiver.sol         — Flash loan callback interface

Mocks (testnet):
├── MockERC20.sol                  — Mintable ERC20 tokens
└── MockChainlinkAggregator.sol    — Admin-controlled price feeds
```

### Frontend

```
frontend/src/
├── app/
│   ├── page.tsx                   — Landing page (hero, features, CTA)
│   ├── app/page.tsx               — Main dashboard
│   │   ├── Markets tab            — Browse lending markets
│   │   ├── Dashboard tab          — Your positions, wallet balances, cTokens
│   │   └── Liquidations tab       — Liquidatable positions + execute liquidation
│   └── admin/page.tsx             — Oracle price management (testnet)
├── components/
│   ├── ConnectWallet.tsx           — MetaMask connection
│   ├── MarketCard.tsx              — Market display card
│   └── HealthBar.tsx               — Visual health factor indicator
└── lib/
    ├── contracts.ts                — Provider, contract helpers, RPC rotation
    └── LendingProtocol.json        — Contract ABI
```

---

## Deployed Contracts (BSC Testnet - Chain ID: 97)

| Contract | Address |
|----------|---------|
| LendingProtocol | `0xe55817a1a76E10b84BA1A603c4a3bFfF5500DcC3` |
| USDT (Mock) | `0x22E53B5B6ceF35caa91b45e1648458e87b2A728e` |
| WBNB (Mock) | `0x3d6255fCB138d27B6b221dA2Db0d2b31216c9CAa` |
| BTCB (Mock) | `0x159d36419c9bA0AD345f5556298708c70f2F8a51` |

---

## Key Improvements Over Original MetaLend (Solana)

| Aspect | Solana MetaLend | MetaLend BNB |
|--------|-----------------|--------------|
| Interest Model | Flat 2% borrow / 1% supply | Dynamic utilization-based with kink |
| Liquidation Math | Same oracle bug (no price conversion) | Proper dual-price conversion |
| Close Factor | No limit (100% liquidation) | 50% max per transaction |
| Reserve Factor | Not implemented | 10% to protocol reserves |
| Collateral Withdrawal | Requires zero borrows | Allowed with health check |
| Flash Loans | Not available | 0.3% fee flash loans |
| Security | Unsafe mem::transmute | ReentrancyGuard + SafeERC20 |
| cTokens | Not implemented | Exchange-rate based receipt tokens |

---

## Scaling & Precision

The protocol uses two precision levels:

| Scale | Value | Used For |
|-------|-------|----------|
| **Basis Points** | 10,000 = 100% | collateralFactor, liquidationThreshold, liquidationBonus, reserveFactor, MAX_CLOSE_FACTOR |
| **RAY** | 1e27 = 1.0 | Interest rates, utilization, health factor, borrow index |
| **WAD** | 1e18 = 1.0 | Token amounts, oracle prices (normalized) |
| **SCALING_FACTOR** | 1e18 | cToken exchange rate |

---

## Security Features

1. **ReentrancyGuard** — All state-changing functions protected against reentrancy
2. **Pausable** — Admin can pause supply/borrow in emergencies (repay + liquidate always work)
3. **Access Control** — Only owner can create markets
4. **Oracle Staleness** — Prices must be < 1 hour old
5. **SafeERC20** — Safe token transfers with proper error handling
6. **Close Factor** — Limits liquidation to 50% per transaction
7. **Health Checks** — Collateral withdrawal enforces minimum health factor
8. **Input Validation** — Market creation parameters validated (CF < LT < 100%, etc.)

---

## Key Formulas Reference

| Calculation | Formula |
|-------------|---------|
| Exchange Rate | `totalSupply * 1e18 / totalCtokenSupply` |
| cTokens Minted | `amount * 1e18 / exchangeRate` |
| Max Borrow | `collateral * price * collateralFactor / 10000` |
| Health Factor | `(collateral * price * liquidationThreshold / 10000) / (debt * supplyPrice) * 1e27` |
| Borrow Rate (< kink) | `baseRate + utilization * multiplier` |
| Borrow Rate (> kink) | `baseRate + kink * multiplier + (util - kink) * jumpMultiplier` |
| Supply Rate | `borrowRate * utilization * (1 - reserveFactor/10000)` |
| Collateral Seized | `repayAmount * supplyPrice / collateralPrice * liquidationBonus / 10000` |
| Flash Loan Fee | `amount * 30 / 10000` (0.3%) |
| Interest Accrued | `totalBorrows * borrowRate * timeElapsed / secondsPerYear` |

---

## Test Coverage

26 tests covering:
- Market creation (valid + invalid params)
- Supply + withdrawal (single + multiple users)
- Borrow with collateral enforcement
- Repayment (partial + full)
- Collateral withdrawal (with/without borrows, health enforcement)
- Liquidation (successful, healthy position rejection, close factor enforcement)
- Flash loans
- Interest accrual + reserves
- Pause mechanism (blocks supply, allows repay + liquidate)
- Full lifecycle integration test
