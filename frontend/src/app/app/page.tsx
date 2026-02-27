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

export default function AppDashboard() {
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [address, setAddress] = useState<string>("");
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [liquidations, setLiquidations] = useState<LiquidationEvent[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<number | null>(null);
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
    if (!address) return;
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#F0B90B] rounded-lg flex items-center justify-center text-black font-bold text-sm">
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
                onClick={() => setTab(t)}
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
                        onSelect={(id) => {
                          setSelectedMarket(id);
                          setTab("dashboard");
                        }}
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
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Actions Panel */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    Actions
                  </h3>

                  {selectedMarket !== null && (
                    <p className="text-gray-900 text-sm font-medium mb-4">
                      Market #{selectedMarket}
                    </p>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="text-gray-500 text-sm block mb-1">
                        Market ID
                      </label>
                      <input
                        type="number"
                        value={selectedMarket ?? ""}
                        onChange={(e) =>
                          setSelectedMarket(Number(e.target.value))
                        }
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-900 transition-colors"
                        placeholder="0"
                      />
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                      <h4 className="text-gray-900 font-medium mb-2">
                        Supply
                      </h4>
                      <input
                        type="text"
                        value={supplyAmount}
                        onChange={(e) => setSupplyAmount(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 mb-2 focus:outline-none focus:border-gray-900 transition-colors"
                        placeholder="Amount to supply"
                      />
                      <button
                        onClick={handleSupply}
                        disabled={loading}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-lg disabled:opacity-50 font-medium transition-colors"
                      >
                        {loading ? "Processing..." : "Supply"}
                      </button>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                      <h4 className="text-gray-900 font-medium mb-2">
                        Borrow
                      </h4>
                      <input
                        type="text"
                        value={collateralAmount}
                        onChange={(e) => setCollateralAmount(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 mb-2 focus:outline-none focus:border-gray-900 transition-colors"
                        placeholder="Collateral amount"
                      />
                      <input
                        type="text"
                        value={borrowAmount}
                        onChange={(e) => setBorrowAmount(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 mb-2 focus:outline-none focus:border-gray-900 transition-colors"
                        placeholder="Borrow amount"
                      />
                      <button
                        onClick={handleBorrow}
                        disabled={loading}
                        className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg disabled:opacity-50 font-medium transition-colors"
                      >
                        {loading ? "Processing..." : "Borrow"}
                      </button>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                      <h4 className="text-gray-900 font-medium mb-2">Repay</h4>
                      <input
                        type="text"
                        value={repayAmountInput}
                        onChange={(e) => setRepayAmountInput(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 mb-2 focus:outline-none focus:border-gray-900 transition-colors"
                        placeholder="Repay amount"
                      />
                      <button
                        onClick={handleRepay}
                        disabled={loading}
                        className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg disabled:opacity-50 font-medium transition-colors"
                      >
                        {loading ? "Processing..." : "Repay"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Positions */}
              <div className="lg:col-span-2">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  Your Positions
                </h3>
                {!address ? (
                  <div className="text-center text-gray-400 py-12 bg-white border border-gray-200 rounded-xl shadow-sm">
                    Connect wallet to view positions
                  </div>
                ) : positions.length === 0 ? (
                  <div className="text-center text-gray-400 py-12 bg-white border border-gray-200 rounded-xl shadow-sm">
                    No active positions
                  </div>
                ) : (
                  <div className="space-y-4">
                    {positions.map((pos, i) => (
                      <motion.div
                        key={pos.marketId}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.1 }}
                        className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="text-gray-900 font-bold">
                            Market #{pos.marketId}
                          </h4>
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
