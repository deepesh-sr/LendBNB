# MetaLend BNB - Frontend

Decentralized lending protocol frontend built on BNB Chain. Supply assets, borrow against collateral, and earn yield.

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Next.js | 16.1.6 | App Router framework |
| React | 19 | UI library |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 4 | Styling (utility-first) |
| Framer Motion | 12 | Animations |
| ethers.js | 6 | Blockchain interaction |
| Inter | Google Font | Typography |

## Setup

```bash
cd frontend
npm install
```

Create `.env.local`:
```
NEXT_PUBLIC_PROTOCOL_ADDRESS=0xe55817a1a76E10b84BA1A603c4a3bFfF5500DcC3
```

```bash
npm run dev     # http://localhost:3000
npm run build   # Production build
npm run lint    # ESLint
```

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Landing page (/)
│   ├── app/page.tsx          # Dashboard (/app)
│   ├── admin/page.tsx        # Admin panel (/admin)
│   ├── layout.tsx            # Root layout (Inter font, metadata)
│   └── globals.css           # CSS variables, Tailwind import
├── components/
│   ├── ConnectWallet.tsx     # MetaMask connect/disconnect/switch
│   ├── MarketCard.tsx        # Market overview card
│   └── HealthBar.tsx         # Position health factor bar
└── lib/
    ├── contracts.ts          # Chain config, provider, contract helpers
    └── LendingProtocol.json  # Protocol ABI
```

## Pages

### `/` — Landing Page
Hero section with video, headline with BNB-yellow gradient accent, "Launch App" CTA.

### `/app` — Dashboard
Three top-level tabs: **Markets**, **Dashboard**, **Liquidations**.

**Markets tab**: Grid of MarketCard components showing each lending market (token pair, TVL, APY/APR, utilization bar).

**Dashboard tab**:
- No market selected → **Portfolio view** (all user positions across markets, clickable)
- Market selected → **Market detail** with stats + **action picker** (Supply / Borrow / Repay)
- Action selected → **Single action form** with:
  - Token name labels (e.g. "Collateral (WBNB)")
  - Live USD conversion inside input (right-aligned, e.g. `≈ $600.00`)
  - Max borrowable calculation in Borrow form (blue info box)
  - Back navigation at each level

**Liquidations tab**: Table of recent liquidation events from on-chain logs.

### `/admin` — Oracle Price Management
Restricted to deployer wallet (`0xC7cb71af35CE0EFAbE0beB513C4Aa6Edc48fA1Af`). UI to call `setPrice()` on mock oracle contracts via MetaMask.

## Design System

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#FFFFFF` | Page background |
| `--foreground` | `#1A1A1A` | Primary text |
| `--accent` | `#F0B90B` | BNB yellow (gradient accent only) |
| `gray-50` | — | Card backgrounds, input backgrounds |
| `gray-200` | — | Borders |
| `gray-500` | — | Secondary text |
| `gray-900` | — | Primary buttons, active tabs, headings |
| `emerald-500` | — | Supply actions, positive values |
| `blue-600` | — | Collateral values, borrow info |
| `orange-500/600` | — | Borrow APR, debt values |
| `red-500` | — | Errors, liquidatable state |

### Typography
- **Font**: Inter (loaded via `next/font/google`)
- **Headings**: `font-bold text-gray-900`
- **Mono values**: `font-mono` for all numeric/financial data
- **Labels**: `text-gray-500 text-sm`

### Component Patterns
- **Cards**: `bg-white border border-gray-200 rounded-xl p-6 shadow-sm`
- **Inputs**: `bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 focus:border-gray-900`
- **Primary buttons**: `bg-gray-900 hover:bg-gray-800 text-white rounded-lg`
- **Supply button**: `bg-emerald-500 hover:bg-emerald-600 text-white`
- **Tab active**: `bg-gray-900 text-white rounded-md`
- **Tab inactive**: `text-gray-500 hover:text-gray-900`
- **Hover cards**: `hover:border-gray-400 hover:shadow-md transition-all`

### Animations (Framer Motion)
- Page entrance: `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}`
- Card stagger: `delay: index * 0.1`
- Tab switch: `AnimatePresence mode="wait"` with exit animations
- Landing page: scroll-triggered `whileInView` reveals

## Components Reference

### `ConnectWallet`
```tsx
<ConnectWallet
  onConnect={(address: string, signer: ethers.Signer) => void}
  onDisconnect?: () => void
/>
```
- Auto-connects if MetaMask already authorized
- Switches to BSC Testnet (chain 97) automatically
- Connected state: dropdown with "Switch Wallet" and "Disconnect"
- Listens for MetaMask `accountsChanged` events

### `MarketCard`
```tsx
<MarketCard
  marketId={1}                  // Display ID (starts from 1)
  supplyToken="USDT"
  collateralToken="WBNB"
  totalSupply="1000.00"
  totalBorrows="500.00"
  utilization="50.0"
  supplyAPY="3.50"
  borrowAPR="2.00"
  onSelect={() => void}
/>
```

### `HealthBar`
```tsx
<HealthBar healthFactor={1.85} />
```
- `>= 2.0`: Safe (emerald)
- `>= 1.5`: Healthy (emerald)
- `>= 1.0`: At Risk (yellow)
- `< 1.0`: Liquidatable (red)

## Smart Contract Integration

### Chain Config
- **Network**: BNB Smart Chain Testnet (chain ID 97)
- **RPC**: `https://data-seed-prebsc-1-s1.bnbchain.org:8545`
- **Explorer**: `https://testnet.bscscan.com`

### Deployed Contracts (Testnet)
| Contract | Address |
|----------|---------|
| LendingProtocol | `0xe55817a1a76E10b84BA1A603c4a3bFfF5500DcC3` |
| USDT (Mock) | `0x22E53B5B6ceF35caa91b45e1648458e87b2A728e` |
| WBNB (Mock) | `0x3d6255fCB138d27B6b221dA2Db0d2b31216c9CAa` |
| BTCB (Mock) | `0x159d36419c9bA0AD345f5556298708c70f2F8a51` |
| USDT Oracle | `0xfEc8C9FF15A77C8feFeeA0f8CC4EaF8755c80d2D` |
| BNB Oracle | `0x055F8Dd227b2Fe7Bd95Fe6d6B795Dfcaf97e6724` |
| BTC Oracle | `0xA396aC4D05844b06fc3728965d8BC71779611F28` |

### Key Contract Calls
```
getMarket(marketId)       → Market struct (tokens, oracles, rates, collateralFactor)
getPosition(marketId, user) → Position struct (supplied, collateral, borrowed)
getHealthFactor(marketId, user) → RAY-scaled health factor
supply(marketId, amount)  → Requires ERC20 approve first
borrow(marketId, collateralAmount, borrowAmount) → Requires collateral approve
repay(marketId, amount)   → Requires supply token approve
```

### Transaction Pattern
All write operations follow: **approve → execute → wait**
```ts
await (await token.approve(PROTOCOL_ADDRESS, amount)).wait();
await (await contract.supply(marketId, amount)).wait();
```

### Oracle Price Reading
```ts
const oracle = new ethers.Contract(oracleAddr, ORACLE_ABI, provider);
const rawPrice = await oracle.price();           // int256
const decimals = Number(await oracle.decimals()); // uint8 (returns BigInt!)
const usdPrice = Number(rawPrice) / Math.pow(10, decimals);
```
> ethers v6 returns BigInt for all integer types. Always wrap with `Number()` before arithmetic.

### Max Borrow Calculation
```
maxBorrowableUSDT = (collateralAmount × collateralPriceUSD × collateralFactor) / supplyPriceUSD
```
- `collateralFactor` is RAY-scaled (1e27) in contract, stored as decimal (e.g. 0.75) in frontend

## Markets

| Market # | Pair | Collateral | Supply | Description |
|----------|------|------------|--------|-------------|
| 1 | WBNB/USDT | WBNB | USDT | Deposit USDT, borrow with BNB collateral |
| 2 | BTCB/USDT | BTCB | USDT | Deposit USDT, borrow with BTC collateral |

## User Flows

### Supply Flow
1. Markets → Select market → Dashboard
2. Pick "Supply" action
3. Enter USDT amount (see USD equivalent)
4. Click Supply → MetaMask approve → MetaMask supply tx

### Borrow Flow
1. Markets → Select market → Dashboard
2. Pick "Borrow" action
3. Enter collateral amount (see USD value + max borrowable)
4. Enter borrow amount
5. Click Borrow → MetaMask approve collateral → MetaMask borrow tx

### Repay Flow
1. Dashboard → Select position → Pick "Repay"
2. See outstanding debt with USD value
3. Enter repay amount
4. Click Repay → MetaMask approve → MetaMask repay tx
