import { ethers } from "ethers";
import protocolAbi from "./LendingProtocol.json";

// BNB Chain Testnet
export const CHAIN_CONFIG = {
  chainId: 97,
  name: "BNB Smart Chain Testnet",
  rpcUrl: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  blockExplorer: "https://testnet.bscscan.com",
  nativeCurrency: {
    name: "tBNB",
    symbol: "tBNB",
    decimals: 18,
  },
};

// Replace after deployment
export const PROTOCOL_ADDRESS = process.env.NEXT_PUBLIC_PROTOCOL_ADDRESS || "0x0000000000000000000000000000000000000000";

export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
}

export async function getSignerProvider(): Promise<ethers.BrowserProvider | null> {
  if (typeof window === "undefined" || !window.ethereum) return null;
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  return provider;
}

export function getProtocolContract(signerOrProvider: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(PROTOCOL_ADDRESS, protocolAbi, signerOrProvider);
}

// Type for window.ethereum
declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider;
  }
}
