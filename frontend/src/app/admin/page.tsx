"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { motion } from "framer-motion";
import Link from "next/link";
import ConnectWallet from "@/components/ConnectWallet";
import { getProvider } from "@/lib/contracts";

const ADMIN_ADDRESS = "0xC7cb71af35CE0EFAbE0beB513C4Aa6Edc48fA1Af";

const ORACLES = [
  {
    name: "USDT",
    address: "0xfEc8C9FF15A77C8feFeeA0f8CC4EaF8755c80d2D",
    defaultPrice: "1",
  },
  {
    name: "BNB",
    address: "0x055F8Dd227b2Fe7Bd95Fe6d6B795Dfcaf97e6724",
    defaultPrice: "600",
  },
  {
    name: "BTC",
    address: "0xA396aC4D05844b06fc3728965d8BC71779611F28",
    defaultPrice: "95000",
  },
];

const ORACLE_ABI = [
  "function setPrice(int256 _price) external",
  "function price() public view returns (int256)",
  "function decimals() external view returns (uint8)",
  "function description() public view returns (string)",
  "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
];

export default function AdminPage() {
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [address, setAddress] = useState<string>("");
  const [loading, setLoading] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [newPrices, setNewPrices] = useState<Record<string, string>>({});
  const [txStatus, setTxStatus] = useState<
    Record<string, "success" | "error" | null>
  >({});

  function onConnect(addr: string, s: ethers.Signer) {
    setAddress(addr);
    setSigner(s);
  }

  const loadPrices = useCallback(async () => {
    try {
      const provider = getProvider();
      const priceMap: Record<string, string> = {};

      for (const oracle of ORACLES) {
        const contract = new ethers.Contract(
          oracle.address,
          ORACLE_ABI,
          provider
        );
        const rawPrice: bigint = await contract.price();
        const decimals: number = await contract.decimals();
        const usdPrice = Number(rawPrice) / Math.pow(10, decimals);
        priceMap[oracle.address] = usdPrice.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }

      setPrices(priceMap);
    } catch (err) {
      console.error("Failed to load oracle prices:", err);
    }
  }, []);

  useEffect(() => {
    loadPrices();
  }, [loadPrices]);

  async function handleSetPrice(oracleAddress: string) {
    if (!signer) return;

    const inputValue = newPrices[oracleAddress];
    if (!inputValue || isNaN(Number(inputValue))) return;

    setLoading(oracleAddress);
    setTxStatus((prev) => ({ ...prev, [oracleAddress]: null }));

    try {
      const contract = new ethers.Contract(oracleAddress, ORACLE_ABI, signer);
      const rawPrice = BigInt(Math.round(Number(inputValue) * 1e8));
      await (await contract.setPrice(rawPrice)).wait();

      setTxStatus((prev) => ({ ...prev, [oracleAddress]: "success" }));
      setNewPrices((prev) => ({ ...prev, [oracleAddress]: "" }));
      loadPrices();
    } catch (err) {
      console.error("setPrice failed:", err);
      setTxStatus((prev) => ({ ...prev, [oracleAddress]: "error" }));
      alert("setPrice failed -- check console");
    } finally {
      setLoading(null);
    }
  }

  const isAdmin = address.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-black font-bold text-sm">
              ML
            </div>
            <h1 className="text-lg font-semibold text-gray-900">
              MetaLend
              <span className="text-gray-400 text-sm font-normal ml-2">
                Admin
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/app"
              className="text-gray-500 hover:text-gray-900 text-sm transition-colors"
            >
              &larr; Back to App
            </Link>
            <ConnectWallet onConnect={onConnect} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {!address ? (
          <div className="text-center text-gray-400 py-20">
            <p className="text-lg mb-2">
              Connect your wallet to access the admin panel
            </p>
          </div>
        ) : !isAdmin ? (
          <div className="text-center py-20">
            <div className="text-red-400 text-6xl mb-4">&#x26D4;</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Access Denied
            </h2>
            <p className="text-gray-500">
              Connected wallet is not authorized for admin access.
            </p>
            <p className="text-gray-400 text-sm mt-2 font-mono">{address}</p>
          </div>
        ) : (
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-2xl font-bold text-gray-900 mb-6"
            >
              Oracle Price Management
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ORACLES.map((oracle, i) => (
                <motion.div
                  key={oracle.address}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-900 font-bold">
                      {oracle.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-gray-900 font-bold">
                        {oracle.name} Oracle
                      </h3>
                      <p className="text-gray-400 text-xs font-mono">
                        {oracle.address.slice(0, 6)}...
                        {oracle.address.slice(-4)}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-gray-500 text-sm">Current Price</p>
                    <p className="text-gray-900 text-2xl font-mono font-bold">
                      ${prices[oracle.address] ?? "Loading..."}
                    </p>
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <label className="text-gray-500 text-sm block mb-1">
                      New Price (USD)
                    </label>
                    <input
                      type="text"
                      value={newPrices[oracle.address] ?? ""}
                      onChange={(e) =>
                        setNewPrices((prev) => ({
                          ...prev,
                          [oracle.address]: e.target.value,
                        }))
                      }
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 mb-2 focus:outline-none focus:border-gray-900 transition-colors"
                      placeholder={`e.g. ${oracle.defaultPrice}`}
                    />
                    <button
                      onClick={() => handleSetPrice(oracle.address)}
                      disabled={loading !== null}
                      className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {loading === oracle.address
                        ? "Setting Price..."
                        : "Set Price"}
                    </button>

                    {txStatus[oracle.address] === "success" && (
                      <p className="text-emerald-500 text-sm mt-2">
                        Price updated successfully
                      </p>
                    )}
                    {txStatus[oracle.address] === "error" && (
                      <p className="text-red-500 text-sm mt-2">
                        Transaction failed
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 mt-16 py-6">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-400 text-sm">
          MetaLend BNB - Admin Panel | Oracle Price Management
        </div>
      </footer>
    </div>
  );
}
