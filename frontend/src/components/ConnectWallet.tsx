"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CHAIN_CONFIG } from "@/lib/contracts";

export default function ConnectWallet({
  onConnect,
}: {
  onConnect: (address: string, signer: ethers.Signer) => void;
}) {
  const [address, setAddress] = useState<string>("");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  async function checkConnection() {
    if (typeof window === "undefined" || !window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.listAccounts();
      if (accounts.length > 0) {
        setAddress(accounts[0].address);
        onConnect(accounts[0].address, accounts[0]);
      }
    } catch {}
  }

  async function connect() {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }

    setConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);

      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${CHAIN_CONFIG.chainId.toString(16)}` }],
        });
      } catch {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${CHAIN_CONFIG.chainId.toString(16)}`,
              chainName: CHAIN_CONFIG.name,
              rpcUrls: [CHAIN_CONFIG.rpcUrl],
              blockExplorerUrls: [CHAIN_CONFIG.blockExplorer],
              nativeCurrency: CHAIN_CONFIG.nativeCurrency,
            },
          ],
        });
      }

      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      onConnect(addr, signer);
    } catch (err) {
      console.error("Connection failed:", err);
    } finally {
      setConnecting(false);
    }
  }

  if (address) {
    return (
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
        <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
        <span className="text-gray-700 font-mono text-sm">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
    >
      {connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
