"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CHAIN_CONFIG } from "@/lib/contracts";

export default function ConnectWallet({
  onConnect,
  onDisconnect,
}: {
  onConnect: (address: string, signer: ethers.Signer) => void;
  onDisconnect?: () => void;
}) {
  const [address, setAddress] = useState<string>("");
  const [connecting, setConnecting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  // Listen for account changes in MetaMask
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = async (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) {
        setAddress("");
        onDisconnect?.();
      } else {
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const signer = await provider.getSigner();
        const addr = await signer.getAddress();
        setAddress(addr);
        onConnect(addr, signer);
      }
    };

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, [onConnect, onDisconnect]);

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

  async function switchWallet() {
    setShowMenu(false);
    if (!window.ethereum) return;
    try {
      // Request MetaMask to show account picker
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      onConnect(addr, signer);
    } catch (err) {
      console.error("Switch wallet failed:", err);
    }
  }

  function disconnect() {
    setShowMenu(false);
    setAddress("");
    onDisconnect?.();
  }

  if (address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 hover:border-gray-400 transition-colors"
        >
          <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
          <span className="text-gray-700 font-mono text-sm">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showMenu && (
          <>
            {/* Backdrop to close menu */}
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
              <button
                onClick={switchWallet}
                className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Switch Wallet
              </button>
              <button
                onClick={disconnect}
                className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 border-t border-gray-100"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Disconnect
              </button>
            </div>
          </>
        )}
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
