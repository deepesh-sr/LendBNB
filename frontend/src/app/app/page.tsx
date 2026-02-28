"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import ConnectWallet from "@/components/ConnectWallet";
import MarketCard from "@/components/MarketCard";
import HealthBar from "@/components/HealthBar";
import InfoTip from "@/components/InfoTip";
import {
  getProtocolContract,
  getProvider,
  rotateRpc,
  PROTOCOL_ADDRESS,
} from "@/lib/contracts";

interface MarketInfo {
  marketId: number;
  supplyToken: string;
  collateralToken: string;
  supplyTokenAddr: string;
  collateralTokenAddr: string;
  collateralFactor: number; // e.g. 0.75 = 75% LTV
  totalSupply: string;
  totalBorrows: string;
  utilization: string;
  supplyAPY: string;
  borrowAPR: string;
}

const ORACLE_ABI = [
  "function price() public view returns (int256)",
  "function decimals() external view returns (uint8)",
];

interface PositionInfo {
  marketId: number;
  supplyDeposited: string;
  collateralDeposited: string;
  borrowedAmount: string;
  ctokenBalance: string;
  healthFactor: number;
  supplyToken: string;
  collateralToken: string;
  supplyTokenAddr: string;
  collateralTokenAddr: string;
}

interface LiquidatablePosition {
  marketId: number;
  borrower: string;
  supplyToken: string;
  collateralToken: string;
  debt: string;
  collateral: string;
  healthFactor: number;
  maxRepay: string; // full debt (100% close factor)
}

interface MarketBorrower {
  borrower: string;
  debt: string;
  collateral: string;
  healthFactor: number;
}

interface WalletBalance {
  token: string;
  tokenAddr: string;
  balance: string;
}

type Action = "supply" | "borrow" | "repay" | null;

const TOKEN_NAMES: Record<string, string> = {
  "0xaCACff158CF0835363e990Fc8a872e1599BBDDD8": "USDT",
  "0x3aB19925952191bc4d6eCF3bC5D54CfA8Ba1A6Bc": "WBNB",
  "0xdCbc46262A3dCFbD750FF8cd07d41C50e0Ed2020": "BTCB",
};

function tokenName(addr: string): string {
  return TOKEN_NAMES[ethers.getAddress(addr)] ?? `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function AppDashboard() {
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [address, setAddress] = useState<string>("");
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [liquidations, setLiquidations] = useState<LiquidatablePosition[]>([]);
  const [liquidatingIdx, setLiquidatingIdx] = useState<number | null>(null);
  const [liquidateAmounts, setLiquidateAmounts] = useState<Record<string, string>>({});
  const [marketBorrowers, setMarketBorrowers] = useState<MarketBorrower[]>([]);
  const [walletBalances, setWalletBalances] = useState<WalletBalance[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<number | null>(null);
  const [selectedAction, setSelectedAction] = useState<Action>(null);
  const [supplyAmount, setSupplyAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmountInput, setRepayAmountInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"markets" | "dashboard" | "liquidations">(
    "markets"
  );
  // Prices keyed by checksummed token address → USD price
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});

  const RAY = BigInt("1000000000000000000000000000");

  const loadMarkets = useCallback(async () => {
    try {
      const provider = getProvider();
      const contract = getProtocolContract(provider);
      const count = await contract.marketCount();
      const marketList: MarketInfo[] = [];
      const priceMap: Record<string, number> = {};

      for (let i = 0; i < Number(count); i++) {
        const market = await contract.getMarket(i);
        const util = await contract.getUtilization(i);
        const borrowRate = await contract.getBorrowRate(i);
        const supplyRate = await contract.getSupplyRate(i);

        // Load oracle prices keyed by token address
        const tokenOraclePairs = [
          { token: market.supplyToken, oracle: market.supplyOracle },
          { token: market.collateralToken, oracle: market.collateralOracle },
        ];
        for (const { token, oracle } of tokenOraclePairs) {
          const key = ethers.getAddress(token);
          if (priceMap[key] !== undefined) continue;
          try {
            const oracleContract = new ethers.Contract(oracle, ORACLE_ABI, provider);
            const rawPrice: bigint = await oracleContract.price();
            const decimals = Number(await oracleContract.decimals());
            priceMap[key] = Number(rawPrice) / Math.pow(10, decimals);
          } catch (err) {
            console.error(`Oracle price failed for ${key}:`, err);
          }
        }

        marketList.push({
          marketId: i,
          supplyToken: tokenName(market.supplyToken),
          collateralToken: tokenName(market.collateralToken),
          supplyTokenAddr: ethers.getAddress(market.supplyToken),
          collateralTokenAddr: ethers.getAddress(market.collateralToken),
          collateralFactor: Number(market.collateralFactor) / 10000,
          totalSupply: Number(
            ethers.formatEther(market.totalSupplyDeposits)
          ).toFixed(2),
          totalBorrows: Number(
            ethers.formatEther(market.totalBorrows)
          ).toFixed(2),
          utilization: ((Number(util) / Number(RAY)) * 100).toFixed(1),
          supplyAPY: ((Number(supplyRate) / Number(RAY)) * 100).toFixed(2),
          borrowAPR: ((Number(borrowRate) / Number(RAY)) * 100).toFixed(2),
        });
      }
      setMarkets(marketList);
      setTokenPrices(priceMap);
    } catch (err) {
      console.error("Failed to load markets:", err);
    }
  }, [RAY]);

  const loadPositions = useCallback(async () => {
    if (!address || PROTOCOL_ADDRESS === "0x0000000000000000000000000000000000000000") return;
    try {
      const provider = getProvider();
      const contract = getProtocolContract(provider);
      const count = await contract.marketCount();
      const positionList: PositionInfo[] = [];

      for (let i = 0; i < Number(count); i++) {
        const pos = await contract.getPosition(i, address);
        // Dust threshold: ignore positions with < 0.01 of everything
        const DUST = ethers.parseEther("0.01");
        const hasSupply = pos.supplyDeposited > DUST;
        const hasCollateral = pos.collateralDeposited > DUST;
        const hasBorrow = pos.borrowedAmount > DUST;
        if (hasSupply || hasCollateral || hasBorrow) {
          let hf = Infinity;
          if (pos.borrowedAmount > 0n) {
            try {
              const hfRaw = await contract.getHealthFactor(i, address);
              hf = Number(hfRaw) / Number(RAY);
            } catch {
              hf = 0;
            }
          }

          const market = await contract.getMarket(i);

          positionList.push({
            marketId: i,
            supplyDeposited: Number(
              ethers.formatEther(pos.supplyDeposited)
            ).toFixed(2),
            collateralDeposited: Number(
              ethers.formatEther(pos.collateralDeposited)
            ).toFixed(4),
            borrowedAmount: Number(
              ethers.formatEther(pos.borrowedAmount)
            ).toFixed(2),
            ctokenBalance: Number(
              ethers.formatEther(pos.ctokenBalance)
            ).toFixed(4),
            healthFactor: hf,
            supplyToken: tokenName(market.supplyToken),
            collateralToken: tokenName(market.collateralToken),
            supplyTokenAddr: ethers.getAddress(market.supplyToken),
            collateralTokenAddr: ethers.getAddress(market.collateralToken),
          });
        }
      }
      setPositions(positionList);
    } catch (err) {
      console.error("Failed to load positions:", err);
    }
  }, [address, RAY]);

  const loadLiquidations = useCallback(async () => {
    if (PROTOCOL_ADDRESS === "0x0000000000000000000000000000000000000000") return;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const provider = attempt === 0 ? getProvider() : rotateRpc();
        const contract = getProtocolContract(provider);
        const marketCount = Number(await contract.marketCount());

        // Scan Borrow events in 5000-block chunks (BSC testnet limit)
        const currentBlock = await provider.getBlockNumber();
        const borrowFilter = contract.filters.Borrow();
        const borrowersByMarket = new Map<number, Set<string>>();
        const CHUNK = 4999;
        const MAX_LOOKBACK = 200000; // ~7 days on BSC

        for (
          let to = currentBlock;
          to > Math.max(0, currentBlock - MAX_LOOKBACK);
          to -= CHUNK + 1
        ) {
          const from = Math.max(0, to - CHUNK);
          try {
            const events = await contract.queryFilter(borrowFilter, from, to);
            for (const event of events) {
              const parsed = contract.interface.parseLog({
                topics: event.topics as string[],
                data: event.data,
              });
              if (!parsed) continue;
              const mId = Number(parsed.args.marketId);
              if (!borrowersByMarket.has(mId)) borrowersByMarket.set(mId, new Set());
              borrowersByMarket.get(mId)!.add(parsed.args.user);
            }
          } catch (chunkErr) {
            const chunkMsg = String(chunkErr);
            if (chunkMsg.includes("rate limit") || chunkMsg.includes("-32005")) {
              // Rotate RPC and retry this chunk
              const retryProvider = rotateRpc();
              const retryContract = getProtocolContract(retryProvider);
              const retryEvents = await retryContract.queryFilter(borrowFilter, from, to);
              for (const event of retryEvents) {
                const parsed = retryContract.interface.parseLog({
                  topics: event.topics as string[],
                  data: event.data,
                });
                if (!parsed) continue;
                const mId = Number(parsed.args.marketId);
                if (!borrowersByMarket.has(mId)) borrowersByMarket.set(mId, new Set());
                borrowersByMarket.get(mId)!.add(parsed.args.user);
              }
            }
          }
        }

        const liqPositions: LiquidatablePosition[] = [];

        for (let mId = 0; mId < marketCount; mId++) {
          const borrowers = borrowersByMarket.get(mId);
          if (!borrowers || borrowers.size === 0) continue;

          const market = await contract.getMarket(mId);
          const supplyTok = tokenName(market.supplyToken);
          const collTok = tokenName(market.collateralToken);

          for (const borrower of borrowers) {
            try {
              const pos = await contract.getPosition(mId, borrower);
              const debt = Number(ethers.formatEther(pos.borrowedAmount));
              if (debt < 0.01) continue; // skip dust positions

              const hfRaw = await contract.getHealthFactor(mId, borrower);
              const hf = Number(hfRaw) / Number(RAY);
              if (hf >= 1.0) continue; // healthy — skip

              const coll = Number(ethers.formatEther(pos.collateralDeposited));
              const maxRepay = debt; // 100% close factor — full debt liquidation

              liqPositions.push({
                marketId: mId,
                borrower,
                supplyToken: supplyTok,
                collateralToken: collTok,
                debt: debt.toFixed(4),
                collateral: coll.toFixed(4),
                healthFactor: hf,
                maxRepay: maxRepay.toFixed(4),
              });
            } catch {
              continue;
            }
          }
        }

        liqPositions.sort((a, b) => a.healthFactor - b.healthFactor);
        setLiquidations(liqPositions);
        return;
      } catch (err) {
        const msg = String(err);
        if (msg.includes("rate limit") || msg.includes("-32005") || msg.includes("block range")) {
          console.warn(`Liquidation scan issue, rotating RPC (attempt ${attempt + 1}/3)`);
          continue;
        }
        console.error("Failed to load liquidatable positions:", err);
        return;
      }
    }
  }, [RAY]);

  // Load all borrowers for the currently selected market
  const loadMarketBorrowers = useCallback(async (marketId: number) => {
    try {
      const provider = getProvider();
      const contract = getProtocolContract(provider);

      // Scan Borrow events in chunks to find all borrowers for this market
      const currentBlock = await provider.getBlockNumber();
      const borrowFilter = contract.filters.Borrow(marketId);
      const CHUNK = 4999;
      const MAX_LOOKBACK = 200000;
      const borrowerSet = new Set<string>();

      for (
        let to = currentBlock;
        to > Math.max(0, currentBlock - MAX_LOOKBACK);
        to -= CHUNK + 1
      ) {
        const from = Math.max(0, to - CHUNK);
        try {
          const events = await contract.queryFilter(borrowFilter, from, to);
          for (const event of events) {
            const parsed = contract.interface.parseLog({
              topics: event.topics as string[],
              data: event.data,
            });
            if (parsed) borrowerSet.add(parsed.args.user);
          }
        } catch {
          // Skip failed chunks
        }
      }

      const borrowerList: MarketBorrower[] = [];
      for (const borrower of borrowerSet) {
        try {
          const pos = await contract.getPosition(marketId, borrower);
          const debt = Number(ethers.formatEther(pos.borrowedAmount));
          if (debt === 0) continue;
          const coll = Number(ethers.formatEther(pos.collateralDeposited));
          let hf = 999;
          try {
            const hfRaw = await contract.getHealthFactor(marketId, borrower);
            hf = Number(hfRaw) / Number(RAY);
          } catch { /* no borrow = infinite HF */ }

          borrowerList.push({
            borrower,
            debt: debt.toFixed(4),
            collateral: coll.toFixed(4),
            healthFactor: hf,
          });
        } catch {
          continue;
        }
      }
      borrowerList.sort((a, b) => a.healthFactor - b.healthFactor);
      setMarketBorrowers(borrowerList);
    } catch (err) {
      console.error("Failed to load market borrowers:", err);
    }
  }, [RAY]);

  // Load wallet balances for all known tokens
  const loadWalletBalances = useCallback(async () => {
    if (!address) return;
    try {
      const provider = getProvider();
      const ERC20_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
      ];
      const tokenAddrs = Object.keys(TOKEN_NAMES);
      const balances: WalletBalance[] = [];

      for (const addr of tokenAddrs) {
        try {
          const token = new ethers.Contract(addr, ERC20_ABI, provider);
          const bal = await token.balanceOf(address);
          const decimals = Number(await token.decimals());
          const formatted = Number(ethers.formatUnits(bal, decimals));
          balances.push({
            token: TOKEN_NAMES[addr],
            tokenAddr: addr,
            balance: formatted.toFixed(4),
          });
        } catch {
          continue;
        }
      }
      setWalletBalances(balances);
    } catch (err) {
      console.error("Failed to load wallet balances:", err);
    }
  }, [address]);

  useEffect(() => {
    if (PROTOCOL_ADDRESS !== "0x0000000000000000000000000000000000000000") {
      loadMarkets();
    }
  }, [loadMarkets]);

  useEffect(() => {
    if (address) {
      loadPositions();
      loadWalletBalances();
    }
  }, [address, loadPositions, loadWalletBalances]);

  useEffect(() => {
    if (tab === "liquidations") loadLiquidations();
  }, [tab, loadLiquidations]);

  useEffect(() => {
    if (selectedMarket !== null) {
      loadMarketBorrowers(selectedMarket);
    } else {
      setMarketBorrowers([]);
    }
  }, [selectedMarket, loadMarketBorrowers]);

  function onConnect(addr: string, s: ethers.Signer) {
    setAddress(addr);
    setSigner(s);
  }

  function onDisconnect() {
    setAddress("");
    setSigner(null);
    setPositions([]);
    setSelectedMarket(null);
    setSelectedAction(null);
    setTab("markets");
  }

  function handleSelectMarket(id: number) {
    setSelectedMarket(id);
    setSelectedAction(null);
    setTab("dashboard");
  }

  function handleBackToMarkets() {
    setSelectedMarket(null);
    setSelectedAction(null);
    setTab("markets");
  }

  async function handleSupply() {
    if (!signer || selectedMarket === null || !supplyAmount) return;
    setLoading(true);
    try {
      const contract = getProtocolContract(signer);
      const market = await contract.getMarket(selectedMarket);
      const token = new ethers.Contract(
        market.supplyToken,
        ["function approve(address,uint256) returns (bool)"],
        signer
      );
      const amount = ethers.parseEther(supplyAmount);
      await (await token.approve(PROTOCOL_ADDRESS, amount)).wait();
      await (await contract.supply(selectedMarket, amount)).wait();
      setSupplyAmount("");
      loadMarkets();
      loadPositions();
    } catch (err) {
      console.error("Supply failed:", err);
      alert("Supply failed -- check console");
    } finally {
      setLoading(false);
    }
  }

  async function handleBorrow() {
    if (!signer || selectedMarket === null || !borrowAmount) return;
    setLoading(true);
    try {
      const contract = getProtocolContract(signer);
      const market = await contract.getMarket(selectedMarket);
      const collAmount = collateralAmount
        ? ethers.parseEther(collateralAmount)
        : 0n;
      const borrAmount = ethers.parseEther(borrowAmount);

      if (collAmount > 0n) {
        const collToken = new ethers.Contract(
          market.collateralToken,
          ["function approve(address,uint256) returns (bool)"],
          signer
        );
        await (
          await collToken.approve(PROTOCOL_ADDRESS, collAmount)
        ).wait();
      }

      await (
        await contract.borrow(selectedMarket, collAmount, borrAmount)
      ).wait();
      setCollateralAmount("");
      setBorrowAmount("");
      loadMarkets();
      loadPositions();
    } catch (err) {
      console.error("Borrow failed:", err);
      alert("Borrow failed -- check console");
    } finally {
      setLoading(false);
    }
  }

  async function handleRepay() {
    if (!signer || selectedMarket === null || !repayAmountInput) return;
    setLoading(true);
    try {
      const contract = getProtocolContract(signer);
      const market = await contract.getMarket(selectedMarket);
      const token = new ethers.Contract(
        market.supplyToken,
        ["function approve(address,uint256) returns (bool)"],
        signer
      );
      const amount = ethers.parseEther(repayAmountInput);
      await (await token.approve(PROTOCOL_ADDRESS, amount)).wait();
      await (await contract.repay(selectedMarket, amount)).wait();
      setRepayAmountInput("");
      loadMarkets();
      loadPositions();
    } catch (err) {
      console.error("Repay failed:", err);
      alert("Repay failed -- check console");
    } finally {
      setLoading(false);
    }
  }

  function getLiquidateKey(pos: LiquidatablePosition): string {
    return `${pos.marketId}-${pos.borrower}`;
  }

  async function handleLiquidate(pos: LiquidatablePosition, index: number) {
    if (!signer) {
      alert("Connect your wallet first");
      return;
    }
    const key = getLiquidateKey(pos);
    const inputAmount = liquidateAmounts[key];
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      alert("Enter a repay amount");
      return;
    }
    // Clamp to max repay
    const amount = Math.min(parseFloat(inputAmount), parseFloat(pos.maxRepay));

    setLiquidatingIdx(index);
    try {
      const contract = getProtocolContract(signer);
      const market = await contract.getMarket(pos.marketId);

      const repayAmount = ethers.parseEther(amount.toString());
      const supplyToken = new ethers.Contract(
        market.supplyToken,
        ["function approve(address,uint256) returns (bool)"],
        signer
      );
      await (await supplyToken.approve(PROTOCOL_ADDRESS, repayAmount)).wait();

      await (
        await contract.liquidate(pos.marketId, pos.borrower, repayAmount)
      ).wait();

      alert("Liquidation successful! You received collateral with bonus.");
      // Clear input
      setLiquidateAmounts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      loadLiquidations();
      loadMarkets();
      if (address) loadPositions();
    } catch (err) {
      console.error("Liquidation failed:", err);
      alert("Liquidation failed -- check console");
    } finally {
      setLiquidatingIdx(null);
    }
  }

  function calculateRiskScore(pos: PositionInfo): number {
    let score = 0;
    if (pos.healthFactor === Infinity) return 0;
    if (pos.healthFactor < 1.0) score += 40;
    else if (pos.healthFactor < 1.1) score += 30;
    else if (pos.healthFactor < 1.5) score += 15;
    const borrowed = parseFloat(pos.borrowedAmount);
    if (borrowed > 10000) score += 15;
    else if (borrowed > 1000) score += 8;
    return Math.min(100, score);
  }

  // Convert token amount to USD string using oracle prices
  function toUsd(amount: string, tokenAddr: string): string | null {
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num === 0) return null;
    const price = tokenPrices[tokenAddr];
    if (price === undefined) return null;
    const usd = num * price;
    return usd.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // Available liquidity in the pool (supply - borrows)
  function availableLiquidity(market: MarketInfo | undefined): number | null {
    if (!market) return null;
    const supply = parseFloat(market.totalSupply);
    const borrows = parseFloat(market.totalBorrows);
    return Math.max(0, supply - borrows);
  }

  // Calculate max borrowable from collateral input (raw number), capped by pool liquidity
  function maxBorrowableRaw(collInput: string, market: MarketInfo | undefined): number | null {
    if (!market || !collInput) return null;
    const collNum = parseFloat(collInput);
    if (isNaN(collNum) || collNum <= 0) return null;
    const collPrice = tokenPrices[market.collateralTokenAddr];
    const supplyPrice = tokenPrices[market.supplyTokenAddr];
    if (collPrice === undefined || supplyPrice === undefined || supplyPrice === 0) return null;
    const collValueUsd = collNum * collPrice;
    const maxUsd = collValueUsd * market.collateralFactor;
    const maxFromCollateral = maxUsd / supplyPrice;
    const poolAvailable = availableLiquidity(market) ?? Infinity;
    return Math.min(maxFromCollateral, poolAvailable);
  }

  // Formatted version for display
  function maxBorrowable(collInput: string, market: MarketInfo | undefined): string | null {
    const raw = maxBorrowableRaw(collInput, market);
    if (raw === null) return null;
    return raw.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const currentMarket = markets.find((m) => m.marketId === selectedMarket);
  const currentPosition = positions.find(
    (p) => p.marketId === selectedMarket
  );

  // Display market ID starting from 1
  function displayId(id: number): number {
    return id + 1;
  }

  const ACTIONS = [
    {
      key: "supply" as const,
      label: "Supply",
      description: "Deposit tokens into the lending pool and earn interest",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      ),
      color: "emerald",
    },
    {
      key: "borrow" as const,
      label: "Borrow",
      description: "Lock collateral and borrow tokens from the pool",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      ),
      color: "blue",
    },
    {
      key: "repay" as const,
      label: "Repay",
      description: "Repay your borrowed tokens to reduce your debt",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "orange",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              ML
            </div>
            <span className="text-lg font-semibold tracking-tight text-gray-900">
              MetaLend
            </span>
          </Link>

          <nav className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(["markets", "dashboard", "liquidations"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  if (t === "markets") {
                    setSelectedMarket(null);
                    setSelectedAction(null);
                  }
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === t
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>

          <ConnectWallet onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Protocol Stats Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="grid grid-cols-4 gap-4 mb-8"
        >
          {[
            { label: "Total Markets", value: markets.length.toString(), tip: null },
            {
              label: "Total Supply",
              value: `$${markets.reduce((a, m) => a + parseFloat(m.totalSupply), 0).toLocaleString()}`,
              tip: "Total Supply",
            },
            {
              label: "Total Borrowed",
              value: `$${markets.reduce((a, m) => a + parseFloat(m.totalBorrows), 0).toLocaleString()}`,
              tip: "Total Borrowed",
            },
            { label: "Network", value: "BNB Testnet", tip: null },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
            >
              <p className="text-gray-500 text-sm">
                {stat.tip ? <InfoTip term={stat.tip}>{stat.label}</InfoTip> : stat.label}
              </p>
              <p className="text-gray-900 text-xl font-bold">{stat.value}</p>
            </div>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {/* Markets Tab */}
          {tab === "markets" && (
            <motion.div
              key="markets"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Lending Markets
              </h2>
              {markets.length === 0 ? (
                <div className="text-center text-gray-400 py-20">
                  <p className="text-lg mb-2">No markets found</p>
                  <p className="text-sm">
                    Deploy contracts and create markets to get started
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {markets.map((m, i) => (
                    <motion.div
                      key={m.marketId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.1 }}
                    >
                      <MarketCard
                        {...m}
                        marketId={displayId(m.marketId)}
                        onSelect={() => handleSelectMarket(m.marketId)}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Dashboard Tab */}
          {tab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {/* No market selected — show portfolio */}
              {selectedMarket === null ? (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    Your Portfolio
                  </h2>

                  {/* Wallet Balances */}
                  {address && walletBalances.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-6"
                    >
                      <h3 className="text-gray-900 font-bold mb-3">Wallet Balances</h3>
                      <div className="grid grid-cols-3 gap-4">
                        {walletBalances.map((wb) => (
                          <div key={wb.tokenAddr} className="bg-gray-50 rounded-lg p-3">
                            <p className="text-gray-500 text-xs">{wb.token}</p>
                            <p className="text-gray-900 font-mono font-bold text-lg">{wb.balance}</p>
                            {tokenPrices[wb.tokenAddr] !== undefined && (
                              <p className="text-gray-400 text-xs font-mono">
                                ≈ ${(parseFloat(wb.balance) * tokenPrices[wb.tokenAddr]).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {!address ? (
                    <div className="text-center text-gray-400 py-20 bg-white border border-gray-200 rounded-xl shadow-sm">
                      <p className="text-lg mb-2">Connect your wallet</p>
                      <p className="text-sm">
                        Connect wallet to view your positions and portfolio
                      </p>
                    </div>
                  ) : positions.length === 0 ? (
                    <div className="text-center text-gray-400 py-20 bg-white border border-gray-200 rounded-xl shadow-sm">
                      <p className="text-lg mb-2">No active positions</p>
                      <p className="text-sm">
                        Go to{" "}
                        <button
                          onClick={() => setTab("markets")}
                          className="text-gray-900 underline hover:no-underline"
                        >
                          Markets
                        </button>{" "}
                        and select a market to get started
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {positions.map((pos, i) => (
                        <motion.div
                          key={pos.marketId}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: i * 0.1 }}
                          onClick={() => handleSelectMarket(pos.marketId)}
                          className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm cursor-pointer hover:border-gray-400 transition-all hover:shadow-md"
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-900 font-bold">
                                {displayId(pos.marketId)}
                              </div>
                              <div>
                                <h4 className="text-gray-900 font-bold">
                                  Market #{displayId(pos.marketId)}
                                  <span className="text-gray-400 font-normal text-sm ml-2">
                                    {pos.collateralToken}/{pos.supplyToken}
                                  </span>
                                </h4>
                                <p className="text-gray-400 text-xs">
                                  Click to manage position
                                </p>
                              </div>
                            </div>
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                                calculateRiskScore(pos) > 30
                                  ? "bg-red-50 text-red-600"
                                  : calculateRiskScore(pos) > 10
                                    ? "bg-yellow-50 text-yellow-700"
                                    : "bg-emerald-50 text-emerald-600"
                              }`}
                            >
                              Risk: {calculateRiskScore(pos)}/100
                            </span>
                          </div>

                          <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                            <div>
                              <p className="text-gray-500"><InfoTip term="Total Supply">Supplied</InfoTip></p>
                              <p className="text-emerald-600 font-mono font-medium">
                                {pos.supplyDeposited} {pos.supplyToken}
                              </p>
                              {toUsd(pos.supplyDeposited, pos.supplyTokenAddr) && (
                                <p className="text-gray-400 text-xs font-mono">≈ ${toUsd(pos.supplyDeposited, pos.supplyTokenAddr)}</p>
                              )}
                            </div>
                            <div>
                              <p className="text-gray-500"><InfoTip term="Collateral" /></p>
                              <p className="text-blue-600 font-mono font-medium">
                                {pos.collateralDeposited} {pos.collateralToken}
                              </p>
                              {toUsd(pos.collateralDeposited, pos.collateralTokenAddr) && (
                                <p className="text-gray-400 text-xs font-mono">≈ ${toUsd(pos.collateralDeposited, pos.collateralTokenAddr)}</p>
                              )}
                            </div>
                            <div>
                              <p className="text-gray-500">Borrowed</p>
                              <p className="text-orange-600 font-mono font-medium">
                                {pos.borrowedAmount} {pos.supplyToken}
                              </p>
                              {toUsd(pos.borrowedAmount, pos.supplyTokenAddr) && (
                                <p className="text-gray-400 text-xs font-mono">≈ ${toUsd(pos.borrowedAmount, pos.supplyTokenAddr)}</p>
                              )}
                            </div>
                            <div>
                              <p className="text-gray-500"><InfoTip term="cTokens" /></p>
                              <p className="text-purple-600 font-mono font-medium">
                                {pos.ctokenBalance}
                              </p>
                              <p className="text-gray-400 text-xs">Receipt tokens</p>
                            </div>
                          </div>

                          {parseFloat(pos.borrowedAmount) > 0 && (
                            <HealthBar healthFactor={pos.healthFactor} />
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Market selected — show market info + action picker */
                <div>
                  {/* Back button + Market header */}
                  <div className="flex items-center gap-4 mb-6">
                    <button
                      onClick={handleBackToMarkets}
                      className="text-gray-400 hover:text-gray-900 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <h2 className="text-2xl font-bold text-gray-900">
                      Market #{displayId(selectedMarket)}
                      {currentMarket && (
                        <span className="text-gray-400 text-lg font-normal ml-3">
                          {currentMarket.collateralToken}/{currentMarket.supplyToken}
                        </span>
                      )}
                    </h2>
                  </div>

                  {/* Market Stats */}
                  {currentMarket && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
                    >
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <p className="text-gray-500 text-sm"><InfoTip term="Total Supply" /></p>
                        <p className="text-gray-900 text-lg font-bold font-mono">
                          ${currentMarket.totalSupply}
                        </p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <p className="text-gray-500 text-sm"><InfoTip term="Total Borrowed" /></p>
                        <p className="text-gray-900 text-lg font-bold font-mono">
                          ${currentMarket.totalBorrows}
                        </p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <p className="text-gray-500 text-sm"><InfoTip term="Supply APY" /></p>
                        <p className="text-emerald-600 text-lg font-bold font-mono">
                          {currentMarket.supplyAPY}%
                        </p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <p className="text-gray-500 text-sm"><InfoTip term="Borrow APR" /></p>
                        <p className="text-orange-600 text-lg font-bold font-mono">
                          {currentMarket.borrowAPR}%
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Active Borrowers in this market */}
                  {marketBorrowers.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                      className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-8"
                    >
                      <h3 className="text-gray-900 font-bold mb-4">
                        Active Loans ({marketBorrowers.length})
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 text-gray-500">
                              <th className="text-left pb-2 font-medium">Borrower</th>
                              <th className="text-right pb-2 font-medium">Debt ({currentMarket?.supplyToken})</th>
                              <th className="text-right pb-2 font-medium">Collateral ({currentMarket?.collateralToken})</th>
                              <th className="text-right pb-2 font-medium">Health Factor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {marketBorrowers.map((b) => (
                              <tr key={b.borrower} className="border-b border-gray-50">
                                <td className="py-2.5 font-mono text-gray-700">
                                  {b.borrower.slice(0, 6)}...{b.borrower.slice(-4)}
                                  {b.borrower.toLowerCase() === address.toLowerCase() && (
                                    <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">You</span>
                                  )}
                                </td>
                                <td className="py-2.5 text-right font-mono text-gray-900">{b.debt}</td>
                                <td className="py-2.5 text-right font-mono text-gray-900">{b.collateral}</td>
                                <td className="py-2.5 text-right">
                                  <span className={`font-mono font-medium ${
                                    b.healthFactor < 1.0 ? "text-red-600" :
                                    b.healthFactor < 1.5 ? "text-orange-500" :
                                    "text-emerald-600"
                                  }`}>
                                    {b.healthFactor >= 100 ? "Safe" : b.healthFactor.toFixed(2)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}

                  {/* Your Position in this market (if any) */}
                  {currentPosition && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                      className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-8"
                    >
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-gray-900 font-bold">
                          Your Position
                        </h3>
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            calculateRiskScore(currentPosition) > 30
                              ? "bg-red-50 text-red-600"
                              : calculateRiskScore(currentPosition) > 10
                                ? "bg-yellow-50 text-yellow-700"
                                : "bg-emerald-50 text-emerald-600"
                          }`}
                        >
                          <InfoTip term="Risk Score">Risk: {calculateRiskScore(currentPosition)}/100</InfoTip>
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                        <div>
                          <p className="text-gray-500">Supplied</p>
                          <p className="text-emerald-600 font-mono font-medium text-lg">
                            {currentPosition.supplyDeposited}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Collateral</p>
                          <p className="text-blue-600 font-mono font-medium text-lg">
                            {currentPosition.collateralDeposited}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Borrowed</p>
                          <p className="text-orange-600 font-mono font-medium text-lg">
                            {currentPosition.borrowedAmount}
                          </p>
                        </div>
                      </div>
                      {parseFloat(currentPosition.borrowedAmount) > 0 && (
                        <HealthBar healthFactor={currentPosition.healthFactor} />
                      )}
                    </motion.div>
                  )}

                  {/* No action selected — show action picker */}
                  {selectedAction === null ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.15 }}
                    >
                      <h3 className="text-lg font-bold text-gray-900 mb-4">
                        What would you like to do?
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {ACTIONS.map((action, i) => (
                          <motion.button
                            key={action.key}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.2 + i * 0.1 }}
                            onClick={() => setSelectedAction(action.key)}
                            className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-left hover:border-gray-400 hover:shadow-md transition-all group"
                          >
                            <div
                              className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${
                                action.color === "emerald"
                                  ? "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100"
                                  : action.color === "blue"
                                    ? "bg-blue-50 text-blue-600 group-hover:bg-blue-100"
                                    : "bg-orange-50 text-orange-600 group-hover:bg-orange-100"
                              }`}
                            >
                              {action.icon}
                            </div>
                            <h4 className="text-gray-900 font-bold text-lg mb-1">
                              {action.label}
                            </h4>
                            <p className="text-gray-500 text-sm">
                              {action.description}
                            </p>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    /* Action selected — show the form */
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="max-w-lg mx-auto"
                    >
                      <button
                        onClick={() => setSelectedAction(null)}
                        className="flex items-center gap-2 text-gray-400 hover:text-gray-900 mb-4 transition-colors text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to actions
                      </button>

                      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        {/* Supply Form */}
                        {selectedAction === "supply" && (
                          <div>
                            <div className="flex items-center gap-3 mb-6">
                              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="text-gray-900 font-bold text-lg">Supply</h3>
                                <p className="text-gray-400 text-sm">
                                  Market #{displayId(selectedMarket)} &middot; {currentMarket?.supplyToken}
                                </p>
                              </div>
                            </div>

                            <label className="text-gray-500 text-sm block mb-1.5">
                              Amount ({currentMarket?.supplyToken})
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                value={supplyAmount}
                                onChange={(e) => setSupplyAmount(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:border-gray-900 transition-colors text-lg font-mono pr-32"
                                placeholder="0.00"
                              />
                              {currentMarket && toUsd(supplyAmount, currentMarket.supplyTokenAddr) && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">
                                  ≈ ${toUsd(supplyAmount, currentMarket.supplyTokenAddr)}
                                </span>
                              )}
                            </div>

                            {currentMarket && (
                              <p className="text-gray-400 text-xs mt-2 mb-4">
                                Current APY: <span className="text-emerald-600 font-medium">{currentMarket.supplyAPY}%</span>
                              </p>
                            )}

                            <button
                              onClick={handleSupply}
                              disabled={loading || !address}
                              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg disabled:opacity-50 font-semibold transition-colors text-base"
                            >
                              {loading ? "Processing..." : !address ? "Connect Wallet" : "Supply"}
                            </button>
                          </div>
                        )}

                        {/* Borrow Form */}
                        {selectedAction === "borrow" && (
                          <div>
                            <div className="flex items-center gap-3 mb-6">
                              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="text-gray-900 font-bold text-lg">Borrow</h3>
                                <p className="text-gray-400 text-sm">
                                  Market #{displayId(selectedMarket)} &middot; {currentMarket?.collateralToken}/{currentMarket?.supplyToken}
                                </p>
                              </div>
                            </div>

                            <label className="text-gray-500 text-sm block mb-1.5">
                              Collateral ({currentMarket?.collateralToken})
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                value={collateralAmount}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCollateralAmount(val);
                                  // Clamp borrow amount if it exceeds new max
                                  const max = maxBorrowableRaw(val, currentMarket);
                                  const currentBorrow = parseFloat(borrowAmount);
                                  if (max !== null && !isNaN(currentBorrow) && currentBorrow > max) {
                                    setBorrowAmount(max.toFixed(2));
                                  }
                                }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:border-gray-900 transition-colors text-lg font-mono pr-36"
                                placeholder="0.00"
                              />
                              {currentMarket && toUsd(collateralAmount, currentMarket.collateralTokenAddr) && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">
                                  ≈ ${toUsd(collateralAmount, currentMarket.collateralTokenAddr)}
                                </span>
                              )}
                            </div>

                            {/* Max borrowable + pool liquidity info */}
                            {maxBorrowable(collateralAmount, currentMarket) ? (
                              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-3 mb-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-blue-600 text-xs font-medium">
                                    Max you can borrow
                                  </span>
                                  <span className="text-blue-700 text-sm font-mono font-bold">
                                    {maxBorrowable(collateralAmount, currentMarket)} {currentMarket?.supplyToken}
                                  </span>
                                </div>
                                <p className="text-blue-400 text-xs mt-1">
                                  <InfoTip term="LTV">LTV</InfoTip>: {currentMarket ? (currentMarket.collateralFactor * 100).toFixed(0) : 0}% &middot;{" "}
                                  {currentMarket?.collateralToken} price: ${tokenPrices[currentMarket?.collateralTokenAddr ?? ""]?.toLocaleString() ?? "—"}
                                </p>
                                {(() => {
                                  if (!currentMarket) return null;
                                  const pool = availableLiquidity(currentMarket);
                                  if (pool === null) return null;
                                  // Check if pool is the binding constraint (collateral would allow more)
                                  const collNum = parseFloat(collateralAmount);
                                  const collPrice = tokenPrices[currentMarket.collateralTokenAddr];
                                  const supplyPrice = tokenPrices[currentMarket.supplyTokenAddr];
                                  if (isNaN(collNum) || !collPrice || !supplyPrice || supplyPrice === 0) return null;
                                  const maxFromCollateral = (collNum * collPrice * currentMarket.collateralFactor) / supplyPrice;
                                  if (maxFromCollateral > pool) {
                                    return (
                                      <p className="text-orange-500 text-xs mt-1 font-medium">
                                        Limited by pool liquidity ({pool.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currentMarket.supplyToken} available)
                                      </p>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            ) : currentMarket ? (
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-3 mb-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-500 text-xs font-medium">
                                    <InfoTip term="Pool Liquidity">Pool liquidity</InfoTip>
                                  </span>
                                  <span className="text-gray-700 text-sm font-mono font-bold">
                                    {availableLiquidity(currentMarket)?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"} {currentMarket.supplyToken}
                                  </span>
                                </div>
                                <p className="text-gray-400 text-xs mt-1">
                                  LTV: {(currentMarket.collateralFactor * 100).toFixed(0)}% &middot; Enter collateral amount above
                                </p>
                              </div>
                            ) : <div className="mb-4" />}

                            <label className="text-gray-500 text-sm block mb-1.5">
                              Borrow Amount ({currentMarket?.supplyToken})
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                value={borrowAmount}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const max = maxBorrowableRaw(collateralAmount, currentMarket);
                                  const num = parseFloat(val);
                                  if (max !== null && !isNaN(num) && num > max) {
                                    setBorrowAmount(max.toFixed(2));
                                  } else {
                                    setBorrowAmount(val);
                                  }
                                }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:border-gray-900 transition-colors text-lg font-mono pr-32"
                                placeholder="0.00"
                              />
                              {currentMarket && toUsd(borrowAmount, currentMarket.supplyTokenAddr) && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">
                                  ≈ ${toUsd(borrowAmount, currentMarket.supplyTokenAddr)}
                                </span>
                              )}
                            </div>

                            {currentMarket && (
                              <p className="text-gray-400 text-xs mt-2 mb-4">
                                Current APR: <span className="text-orange-600 font-medium">{currentMarket.borrowAPR}%</span>
                              </p>
                            )}

                            <button
                              onClick={handleBorrow}
                              disabled={loading || !address}
                              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-lg disabled:opacity-50 font-semibold transition-colors text-base"
                            >
                              {loading ? "Processing..." : !address ? "Connect Wallet" : "Borrow"}
                            </button>
                          </div>
                        )}

                        {/* Repay Form */}
                        {selectedAction === "repay" && (
                          <div>
                            <div className="flex items-center gap-3 mb-6">
                              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="text-gray-900 font-bold text-lg">Repay</h3>
                                <p className="text-gray-400 text-sm">
                                  Market #{displayId(selectedMarket)} &middot; {currentMarket?.supplyToken}
                                </p>
                              </div>
                            </div>

                            {currentPosition && parseFloat(currentPosition.borrowedAmount) > 0 && (
                              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-gray-500 text-xs">Outstanding Debt</p>
                                    <p className="text-gray-900 font-mono font-bold text-lg">
                                      {currentPosition.borrowedAmount} {currentMarket?.supplyToken}
                                    </p>
                                  </div>
                                  {currentMarket && toUsd(currentPosition.borrowedAmount, currentMarket.supplyTokenAddr) && (
                                    <p className="text-gray-500 text-sm font-mono">
                                      ≈ ${toUsd(currentPosition.borrowedAmount, currentMarket.supplyTokenAddr)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            <label className="text-gray-500 text-sm block mb-1.5">
                              Repay Amount ({currentMarket?.supplyToken})
                            </label>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  value={repayAmountInput}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const num = parseFloat(val);
                                    const maxDebt = parseFloat(currentPosition?.borrowedAmount ?? "0");
                                    if (!isNaN(num) && maxDebt > 0 && num > maxDebt) {
                                      setRepayAmountInput(maxDebt.toString());
                                    } else {
                                      setRepayAmountInput(val);
                                    }
                                  }}
                                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:border-gray-900 transition-colors text-lg font-mono pr-32"
                                  placeholder="0.00"
                                />
                                {currentMarket && toUsd(repayAmountInput, currentMarket.supplyTokenAddr) && (
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">
                                    ≈ ${toUsd(repayAmountInput, currentMarket.supplyTokenAddr)}
                                  </span>
                                )}
                              </div>
                              {currentPosition && parseFloat(currentPosition.borrowedAmount) > 0 && (
                                <button
                                  onClick={() => setRepayAmountInput(currentPosition.borrowedAmount)}
                                  className="bg-orange-50 text-orange-600 hover:bg-orange-100 font-semibold px-3 py-3 rounded-lg text-xs transition-colors whitespace-nowrap"
                                >
                                  Max
                                </button>
                              )}
                            </div>

                            <div className="mb-4" />

                            <button
                              onClick={handleRepay}
                              disabled={loading || !address}
                              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-lg disabled:opacity-50 font-semibold transition-colors text-base"
                            >
                              {loading ? "Processing..." : !address ? "Connect Wallet" : "Repay"}
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Liquidations Tab */}
          {tab === "liquidations" && (
            <motion.div
              key="liquidations"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  <InfoTip term="Liquidation">Liquidatable Positions</InfoTip>
                </h2>
                <button
                  onClick={loadLiquidations}
                  className="text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Refresh
                </button>
              </div>

              {liquidations.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
                  <div className="text-4xl mb-3">&#x2714;</div>
                  <p className="text-gray-500 text-lg font-medium">All positions are healthy</p>
                  <p className="text-gray-400 text-sm mt-1">No underwater positions found. Check back later.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {liquidations.map((pos, i) => (
                    <motion.div
                      key={`${pos.marketId}-${pos.borrower}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-white border border-red-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
                    >
                      {/* Position info */}
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                            <InfoTip term="Health Factor">HF {pos.healthFactor.toFixed(3)}</InfoTip>
                          </span>
                          <span className="text-gray-900 font-semibold">
                            Market #{displayId(pos.marketId)}
                          </span>
                          <span className="text-gray-400 text-sm">
                            {pos.supplyToken} / {pos.collateralToken}
                          </span>
                          {pos.borrower.toLowerCase() === address.toLowerCase() && (
                            <span className="bg-blue-50 text-blue-600 text-xs font-medium px-2 py-0.5 rounded-full">
                              Your Position
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-gray-400 text-xs">Borrower</p>
                            <p className="font-mono text-gray-700">
                              {pos.borrower.slice(0, 6)}...{pos.borrower.slice(-4)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs">Total Debt</p>
                            <p className="font-mono text-gray-900 font-medium">
                              {pos.debt} {pos.supplyToken}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs"><InfoTip term="Collateral" /></p>
                            <p className="font-mono text-gray-900 font-medium">
                              {pos.collateral} {pos.collateralToken}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs"><InfoTip term="Max Liquidatable" /></p>
                            <p className="font-mono text-gray-900 font-medium">
                              {pos.maxRepay} {pos.supplyToken}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Liquidation input + button */}
                      <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-red-100">
                        <div className="flex-1">
                          <label className="text-gray-500 text-xs block mb-1">
                            Repay Amount ({pos.supplyToken})
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={liquidateAmounts[getLiquidateKey(pos)] ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const num = parseFloat(val);
                                const max = parseFloat(pos.maxRepay);
                                if (!isNaN(num) && num > max) {
                                  setLiquidateAmounts((prev) => ({ ...prev, [getLiquidateKey(pos)]: max.toString() }));
                                } else {
                                  setLiquidateAmounts((prev) => ({ ...prev, [getLiquidateKey(pos)]: val }));
                                }
                              }}
                              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-900 transition-colors font-mono text-sm"
                              placeholder="0.00"
                            />
                            <button
                              onClick={() =>
                                setLiquidateAmounts((prev) => ({ ...prev, [getLiquidateKey(pos)]: pos.maxRepay }))
                              }
                              className="bg-red-50 text-red-600 hover:bg-red-100 font-semibold px-3 py-2 rounded-lg text-xs transition-colors whitespace-nowrap"
                            >
                              Max
                            </button>
                          </div>
                        </div>
                        <div className="flex items-end">
                          <button
                            onClick={() => handleLiquidate(pos, i)}
                            disabled={!address || liquidatingIdx === i || !liquidateAmounts[getLiquidateKey(pos)]}
                            className="bg-red-500 hover:bg-red-600 text-white font-semibold px-6 py-2.5 rounded-lg disabled:opacity-50 transition-colors text-sm whitespace-nowrap"
                          >
                            {liquidatingIdx === i
                              ? "Liquidating..."
                              : !address
                                ? "Connect Wallet"
                                : "Liquidate"}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-gray-200 mt-16 py-6">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-400 text-sm">
          MetaLend BNB - Decentralized Lending Protocol | Built for BNB Chain
          Hackathon 2026
        </div>
      </footer>
    </div>
  );
}
