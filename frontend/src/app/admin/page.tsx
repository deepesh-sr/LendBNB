"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
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
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center text-black font-bold text-sm">
              ML
            </div>
            <h1 className="text-xl font-bold text-white">
              MetaLend <span className="text-yellow-500">BNB</span>
              <span className="text-gray-400 text-sm font-normal ml-2">
                Admin
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              &larr; Back to App
            </a>
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
            <div className="text-red-500 text-6xl mb-4">&#x26D4;</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Access Denied
            </h2>
            <p className="text-gray-400">
              Connected wallet is not authorized for admin access.
            </p>
            <p className="text-gray-500 text-sm mt-2 font-mono">{address}</p>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">
              Oracle Price Management
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ORACLES.map((oracle) => (
                <div
                  key={oracle.address}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-6"
                >
                  {/* Oracle name and address */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center text-yellow-400 font-bold">
                      {oracle.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-white font-bold">
                        {oracle.name} Oracle
                      </h3>
                      <p className="text-gray-500 text-xs font-mono">
                        {oracle.address.slice(0, 6)}...
                        {oracle.address.slice(-4)}
                      </p>
                    </div>
                  </div>

                  {/* Current price */}
                  <div className="mb-4">
                    <p className="text-gray-400 text-sm">Current Price</p>
                    <p className="text-white text-2xl font-mono font-bold">
                      ${prices[oracle.address] ?? "Loading..."}
                    </p>
                  </div>

                  {/* Set new price */}
                  <div className="border-t border-gray-700 pt-4">
                    <label className="text-gray-400 text-sm block mb-1">
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
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mb-2"
                      placeholder={`e.g. ${oracle.defaultPrice}`}
                    />
                    <button
                      onClick={() => handleSetPrice(oracle.address)}
                      disabled={loading !== null}
                      className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {loading === oracle.address
                        ? "Setting Price..."
                        : "Set Price"}
                    </button>

                    {txStatus[oracle.address] === "success" && (
                      <p className="text-green-400 text-sm mt-2">
                        Price updated successfully
                      </p>
                    )}
                    {txStatus[oracle.address] === "error" && (
                      <p className="text-red-400 text-sm mt-2">
                        Transaction failed
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-800 mt-16 py-6">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500 text-sm">
          MetaLend BNB - Admin Panel | Oracle Price Management
        </div>
      </footer>
    </div>
  );
}
