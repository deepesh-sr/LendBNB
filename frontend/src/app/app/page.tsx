"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import ConnectWallet from "@/components/ConnectWallet";
import MarketCard from "@/components/MarketCard";
import HealthBar from "@/components/HealthBar";
import {
  getProtocolContract,
  getProvider,
  PROTOCOL_ADDRESS,
} from "@/lib/contracts";

interface MarketInfo {
  marketId: number;
  supplyToken: string;
  collateralToken: string;
  totalSupply: string;
  totalBorrows: string;
  utilization: string;
  supplyAPY: string;
  borrowAPR: string;
}

interface PositionInfo {
  marketId: number;
  supplyDeposited: string;
  collateralDeposited: string;
  borrowedAmount: string;
  healthFactor: number;
}

interface LiquidationEvent {
  marketId: number;
  borrower: string;
  liquidator: string;
  debtRepaid: string;
  collateralSeized: string;
  timestamp: number;
  txHash: string;
}

type Action = "supply" | "borrow" | "repay" | null;

export default function AppDashboard() {
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [address, setAddress] = useState<string>("");
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [liquidations, setLiquidations] = useState<LiquidationEvent[]>([]);
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

  const RAY = BigInt("1000000000000000000000000000");

  const loadMarkets = useCallback(async () => {
    try {
      const provider = getProvider();
      const contract = getProtocolContract(provider);
      const count = await contract.marketCount();
      const marketList: MarketInfo[] = [];

      for (let i = 0; i < Number(count); i++) {
        const market = await contract.getMarket(i);
        const util = await contract.getUtilization(i);
        const borrowRate = await contract.getBorrowRate(i);
        const supplyRate = await contract.getSupplyRate(i);

        marketList.push({
          marketId: i,
          supplyToken: market.supplyToken.slice(0, 8) + "...",
          collateralToken: market.collateralToken.slice(0, 8) + "...",
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
        if (
          pos.borrowedAmount > 0n ||
          pos.supplyDeposited > 0n ||
          pos.collateralDeposited > 0n
        ) {
          let hf = Infinity;
          if (pos.borrowedAmount > 0n) {
            try {
              const hfRaw = await contract.getHealthFactor(i, address);
              hf = Number(hfRaw) / Number(RAY);
            } catch {
              hf = 0;
            }
          }

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
            healthFactor: hf,
          });
        }
      }
      setPositions(positionList);
    } catch (err) {
      console.error("Failed to load positions:", err);
    }
  }, [address, RAY]);

  const loadLiquidations = useCallback(async () => {
    try {
      const provider = getProvider();
      const contract = getProtocolContract(provider);
      const filter = contract.filters.Liquidation();
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 10000);
      const events = await contract.queryFilter(filter, fromBlock);

      const liqList: LiquidationEvent[] = [];
      for (const event of events.slice(-20)) {
        const parsed = contract.interface.parseLog({
          topics: event.topics as string[],
          data: event.data,
        });
        if (!parsed) continue;

        const block = await event.getBlock();
        liqList.push({
          marketId: Number(parsed.args.marketId),
          borrower: parsed.args.borrower,
          liquidator: parsed.args.liquidator,
          debtRepaid: Number(
            ethers.formatEther(parsed.args.debtRepaid)
          ).toFixed(2),
          collateralSeized: Number(
            ethers.formatEther(parsed.args.collateralSeized)
          ).toFixed(4),
          timestamp: block.timestamp,
          txHash: event.transactionHash,
        });
      }
      setLiquidations(liqList.reverse());
    } catch (err) {
      console.error("Failed to load liquidations:", err);
    }
  }, []);

  useEffect(() => {
    if (PROTOCOL_ADDRESS !== "0x0000000000000000000000000000000000000000") {
      loadMarkets();
    }
  }, [loadMarkets]);

  useEffect(() => {
    if (address) loadPositions();
  }, [address, loadPositions]);

  useEffect(() => {
    if (tab === "liquidations") loadLiquidations();
  }, [tab, loadLiquidations]);

  function onConnect(addr: string, s: ethers.Signer) {
    setAddress(addr);
    setSigner(s);
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

  const currentMarket = markets.find((m) => m.marketId === selectedMarket);
  const currentPosition = positions.find(
    (p) => p.marketId === selectedMarket
  );

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

          <ConnectWallet onConnect={onConnect} />
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
            { label: "Total Markets", value: markets.length.toString() },
            {
              label: "Total TVL",
              value: `$${markets.reduce((a, m) => a + parseFloat(m.totalSupply), 0).toLocaleString()}`,
            },
            {
              label: "Total Borrowed",
              value: `$${markets.reduce((a, m) => a + parseFloat(m.totalBorrows), 0).toLocaleString()}`,
            },
            { label: "Network", value: "BNB Testnet" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
            >
              <p className="text-gray-500 text-sm">{stat.label}</p>
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
                        onSelect={handleSelectMarket}
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
                                #{pos.marketId}
                              </div>
                              <div>
                                <h4 className="text-gray-900 font-bold">
                                  Market #{pos.marketId}
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

                          <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                            <div>
                              <p className="text-gray-500">Supplied</p>
                              <p className="text-emerald-600 font-mono font-medium">
                                {pos.supplyDeposited}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Collateral</p>
                              <p className="text-blue-600 font-mono font-medium">
                                {pos.collateralDeposited}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Borrowed</p>
                              <p className="text-orange-600 font-mono font-medium">
                                {pos.borrowedAmount}
                              </p>
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
                      Market #{selectedMarket}
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
                        <p className="text-gray-500 text-sm">Total Supply</p>
                        <p className="text-gray-900 text-lg font-bold font-mono">
                          ${currentMarket.totalSupply}
                        </p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <p className="text-gray-500 text-sm">Total Borrowed</p>
                        <p className="text-gray-900 text-lg font-bold font-mono">
                          ${currentMarket.totalBorrows}
                        </p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <p className="text-gray-500 text-sm">Supply APY</p>
                        <p className="text-emerald-600 text-lg font-bold font-mono">
                          {currentMarket.supplyAPY}%
                        </p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <p className="text-gray-500 text-sm">Borrow APR</p>
                        <p className="text-orange-600 text-lg font-bold font-mono">
                          {currentMarket.borrowAPR}%
                        </p>
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
                          Risk: {calculateRiskScore(currentPosition)}/100
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
                                  Market #{selectedMarket}
                                </p>
                              </div>
                            </div>

                            <label className="text-gray-500 text-sm block mb-1.5">
                              Amount to Supply
                            </label>
                            <input
                              type="text"
                              value={supplyAmount}
                              onChange={(e) => setSupplyAmount(e.target.value)}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 mb-4 focus:outline-none focus:border-gray-900 transition-colors text-lg font-mono"
                              placeholder="0.00"
                            />

                            {currentMarket && (
                              <p className="text-gray-400 text-xs mb-4">
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
                                  Market #{selectedMarket}
                                </p>
                              </div>
                            </div>

                            <label className="text-gray-500 text-sm block mb-1.5">
                              Collateral Amount
                            </label>
                            <input
                              type="text"
                              value={collateralAmount}
                              onChange={(e) => setCollateralAmount(e.target.value)}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 mb-4 focus:outline-none focus:border-gray-900 transition-colors text-lg font-mono"
                              placeholder="0.00"
                            />

                            <label className="text-gray-500 text-sm block mb-1.5">
                              Borrow Amount
                            </label>
                            <input
                              type="text"
                              value={borrowAmount}
                              onChange={(e) => setBorrowAmount(e.target.value)}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 mb-4 focus:outline-none focus:border-gray-900 transition-colors text-lg font-mono"
                              placeholder="0.00"
                            />

                            {currentMarket && (
                              <p className="text-gray-400 text-xs mb-4">
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
                                  Market #{selectedMarket}
                                </p>
                              </div>
                            </div>

                            {currentPosition && parseFloat(currentPosition.borrowedAmount) > 0 && (
                              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                                <p className="text-gray-500 text-xs">Outstanding Debt</p>
                                <p className="text-gray-900 font-mono font-bold text-lg">
                                  {currentPosition.borrowedAmount}
                                </p>
                              </div>
                            )}

                            <label className="text-gray-500 text-sm block mb-1.5">
                              Repay Amount
                            </label>
                            <input
                              type="text"
                              value={repayAmountInput}
                              onChange={(e) => setRepayAmountInput(e.target.value)}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 mb-4 focus:outline-none focus:border-gray-900 transition-colors text-lg font-mono"
                              placeholder="0.00"
                            />

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
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Liquidation Feed
              </h2>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500 text-sm">
                      <th className="text-left px-6 py-3 font-medium">Time</th>
                      <th className="text-left px-6 py-3 font-medium">
                        Market
                      </th>
                      <th className="text-left px-6 py-3 font-medium">
                        Borrower
                      </th>
                      <th className="text-left px-6 py-3 font-medium">
                        Liquidator
                      </th>
                      <th className="text-right px-6 py-3 font-medium">
                        Debt Repaid
                      </th>
                      <th className="text-right px-6 py-3 font-medium">
                        Collateral Seized
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {liquidations.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="text-center text-gray-400 py-12"
                        >
                          No liquidation events found
                        </td>
                      </tr>
                    ) : (
                      liquidations.map((liq, i) => (
                        <tr
                          key={i}
                          className="border-b border-gray-50 hover:bg-gray-50/50"
                        >
                          <td className="px-6 py-3 text-gray-600 text-sm">
                            {new Date(
                              liq.timestamp * 1000
                            ).toLocaleTimeString()}
                          </td>
                          <td className="px-6 py-3 text-gray-900 font-medium">
                            #{liq.marketId}
                          </td>
                          <td className="px-6 py-3 text-sm font-mono text-red-500">
                            {liq.borrower.slice(0, 6)}...
                            {liq.borrower.slice(-4)}
                          </td>
                          <td className="px-6 py-3 text-sm font-mono text-emerald-500">
                            {liq.liquidator.slice(0, 6)}...
                            {liq.liquidator.slice(-4)}
                          </td>
                          <td className="px-6 py-3 text-right text-gray-900 font-mono">
                            {liq.debtRepaid}
                          </td>
                          <td className="px-6 py-3 text-right text-blue-600 font-mono">
                            {liq.collateralSeized}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
