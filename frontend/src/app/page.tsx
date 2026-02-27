"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import ConnectWallet from "@/components/ConnectWallet";
import MarketCard from "@/components/MarketCard";
import HealthBar from "@/components/HealthBar";
import { getProtocolContract, getProvider, PROTOCOL_ADDRESS } from "@/lib/contracts";

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

export default function Home() {
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
  const [tab, setTab] = useState<"markets" | "dashboard" | "liquidations">("markets");

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
          totalSupply: Number(ethers.formatEther(market.totalSupplyDeposits)).toFixed(2),
          totalBorrows: Number(ethers.formatEther(market.totalBorrows)).toFixed(2),
          utilization: (Number(util) / Number(RAY) * 100).toFixed(1),
          supplyAPY: (Number(supplyRate) / Number(RAY) * 100).toFixed(2),
          borrowAPR: (Number(borrowRate) / Number(RAY) * 100).toFixed(2),
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
        if (pos.borrowedAmount > 0n || pos.supplyDeposited > 0n || pos.collateralDeposited > 0n) {
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
            supplyDeposited: Number(ethers.formatEther(pos.supplyDeposited)).toFixed(2),
            collateralDeposited: Number(ethers.formatEther(pos.collateralDeposited)).toFixed(4),
            borrowedAmount: Number(ethers.formatEther(pos.borrowedAmount)).toFixed(2),
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
          debtRepaid: Number(ethers.formatEther(parsed.args.debtRepaid)).toFixed(2),
          collateralSeized: Number(ethers.formatEther(parsed.args.collateralSeized)).toFixed(4),
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
      const collAmount = collateralAmount ? ethers.parseEther(collateralAmount) : 0n;
      const borrAmount = ethers.parseEther(borrowAmount);

      if (collAmount > 0n) {
        const collToken = new ethers.Contract(
          market.collateralToken,
          ["function approve(address,uint256) returns (bool)"],
          signer
        );
        await (await collToken.approve(PROTOCOL_ADDRESS, collAmount)).wait();
      }

      await (await contract.borrow(selectedMarket, collAmount, borrAmount)).wait();
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

  // Risk score calculation (AI-powered heuristic)
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
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center text-black font-bold text-sm">
              ML
            </div>
            <h1 className="text-xl font-bold text-white">MetaLend <span className="text-yellow-500">BNB</span></h1>
          </div>

          <nav className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {(["markets", "dashboard", "liquidations"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === t
                    ? "bg-yellow-500 text-black"
                    : "text-gray-400 hover:text-white"
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
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Markets", value: markets.length.toString() },
            { label: "Total TVL", value: `$${markets.reduce((a, m) => a + parseFloat(m.totalSupply), 0).toLocaleString()}` },
            { label: "Total Borrowed", value: `$${markets.reduce((a, m) => a + parseFloat(m.totalBorrows), 0).toLocaleString()}` },
            { label: "Network", value: "BNB Testnet" },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-400 text-sm">{stat.label}</p>
              <p className="text-white text-xl font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Markets Tab */}
        {tab === "markets" && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Lending Markets</h2>
            {markets.length === 0 ? (
              <div className="text-center text-gray-400 py-20">
                <p className="text-lg mb-2">No markets found</p>
                <p className="text-sm">Deploy contracts and create markets to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {markets.map((m) => (
                  <MarketCard
                    key={m.marketId}
                    {...m}
                    onSelect={(id) => {
                      setSelectedMarket(id);
                      setTab("dashboard");
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dashboard Tab */}
        {tab === "dashboard" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Actions Panel */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Actions</h3>

                {selectedMarket !== null && (
                  <p className="text-yellow-400 text-sm mb-4">Market #{selectedMarket}</p>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Market ID</label>
                    <input
                      type="number"
                      value={selectedMarket ?? ""}
                      onChange={(e) => setSelectedMarket(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                      placeholder="0"
                    />
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-white font-medium mb-2">Supply</h4>
                    <input
                      type="text"
                      value={supplyAmount}
                      onChange={(e) => setSupplyAmount(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mb-2"
                      placeholder="Amount to supply"
                    />
                    <button
                      onClick={handleSupply}
                      disabled={loading}
                      className="w-full bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg disabled:opacity-50"
                    >
                      {loading ? "Processing..." : "Supply"}
                    </button>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-white font-medium mb-2">Borrow</h4>
                    <input
                      type="text"
                      value={collateralAmount}
                      onChange={(e) => setCollateralAmount(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mb-2"
                      placeholder="Collateral amount"
                    />
                    <input
                      type="text"
                      value={borrowAmount}
                      onChange={(e) => setBorrowAmount(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mb-2"
                      placeholder="Borrow amount"
                    />
                    <button
                      onClick={handleBorrow}
                      disabled={loading}
                      className="w-full bg-orange-600 hover:bg-orange-500 text-white py-2 rounded-lg disabled:opacity-50"
                    >
                      {loading ? "Processing..." : "Borrow"}
                    </button>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-white font-medium mb-2">Repay</h4>
                    <input
                      type="text"
                      value={repayAmountInput}
                      onChange={(e) => setRepayAmountInput(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mb-2"
                      placeholder="Repay amount"
                    />
                    <button
                      onClick={handleRepay}
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg disabled:opacity-50"
                    >
                      {loading ? "Processing..." : "Repay"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Positions */}
            <div className="lg:col-span-2">
              <h3 className="text-lg font-bold text-white mb-4">Your Positions</h3>
              {!address ? (
                <div className="text-center text-gray-400 py-12 bg-gray-900 border border-gray-800 rounded-xl">
                  Connect wallet to view positions
                </div>
              ) : positions.length === 0 ? (
                <div className="text-center text-gray-400 py-12 bg-gray-900 border border-gray-800 rounded-xl">
                  No active positions
                </div>
              ) : (
                <div className="space-y-4">
                  {positions.map((pos) => (
                    <div key={pos.marketId} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="text-white font-bold">Market #{pos.marketId}</h4>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            calculateRiskScore(pos) > 30
                              ? "bg-red-900/50 text-red-400"
                              : calculateRiskScore(pos) > 10
                              ? "bg-yellow-900/50 text-yellow-400"
                              : "bg-green-900/50 text-green-400"
                          }`}>
                            Risk: {calculateRiskScore(pos)}/100
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                        <div>
                          <p className="text-gray-400">Supplied</p>
                          <p className="text-green-400 font-mono">{pos.supplyDeposited}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Collateral</p>
                          <p className="text-blue-400 font-mono">{pos.collateralDeposited}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Borrowed</p>
                          <p className="text-orange-400 font-mono">{pos.borrowedAmount}</p>
                        </div>
                      </div>

                      {parseFloat(pos.borrowedAmount) > 0 && (
                        <HealthBar healthFactor={pos.healthFactor} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Liquidations Tab */}
        {tab === "liquidations" && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Liquidation Feed</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-sm">
                    <th className="text-left px-6 py-3">Time</th>
                    <th className="text-left px-6 py-3">Market</th>
                    <th className="text-left px-6 py-3">Borrower</th>
                    <th className="text-left px-6 py-3">Liquidator</th>
                    <th className="text-right px-6 py-3">Debt Repaid</th>
                    <th className="text-right px-6 py-3">Collateral Seized</th>
                  </tr>
                </thead>
                <tbody>
                  {liquidations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-400 py-12">
                        No liquidation events found
                      </td>
                    </tr>
                  ) : (
                    liquidations.map((liq, i) => (
                      <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-6 py-3 text-gray-300 text-sm">
                          {new Date(liq.timestamp * 1000).toLocaleTimeString()}
                        </td>
                        <td className="px-6 py-3 text-yellow-400">#{liq.marketId}</td>
                        <td className="px-6 py-3 text-sm font-mono text-red-400">
                          {liq.borrower.slice(0, 6)}...{liq.borrower.slice(-4)}
                        </td>
                        <td className="px-6 py-3 text-sm font-mono text-green-400">
                          {liq.liquidator.slice(0, 6)}...{liq.liquidator.slice(-4)}
                        </td>
                        <td className="px-6 py-3 text-right text-white font-mono">{liq.debtRepaid}</td>
                        <td className="px-6 py-3 text-right text-blue-400 font-mono">{liq.collateralSeized}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16 py-6">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500 text-sm">
          MetaLend BNB - Decentralized Lending Protocol | Built for BNB Chain Hackathon 2026
        </div>
      </footer>
    </div>
  );
}
