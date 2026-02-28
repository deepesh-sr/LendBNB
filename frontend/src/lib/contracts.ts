import { ethers } from "ethers";
import protocolAbi from "./LendingProtocol.json";

// BNB Chain Testnet — multiple RPCs for fallback on rate limits
const BSC_TESTNET_RPCS = [
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  "https://data-seed-prebsc-2-s1.bnbchain.org:8545",
  "https://data-seed-prebsc-1-s2.bnbchain.org:8545",
  "https://data-seed-prebsc-2-s2.bnbchain.org:8545",
  "https://bsc-testnet-rpc.publicnode.com",
];

export const CHAIN_CONFIG = {
  chainId: 97,
  name: "BNB Smart Chain Testnet",
  rpcUrl: BSC_TESTNET_RPCS[0],
  blockExplorer: "https://testnet.bscscan.com",
  nativeCurrency: {
    name: "tBNB",
    symbol: "tBNB",
    decimals: 18,
  },
};

// Replace after deployment
export const PROTOCOL_ADDRESS = process.env.NEXT_PUBLIC_PROTOCOL_ADDRESS || "0x0000000000000000000000000000000000000000";

let currentRpcIndex = 0;

export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(BSC_TESTNET_RPCS[currentRpcIndex]);
}

// Rotate to next RPC on rate limit, returns a new provider
export function rotateRpc(): ethers.JsonRpcProvider {
  currentRpcIndex = (currentRpcIndex + 1) % BSC_TESTNET_RPCS.length;
  return new ethers.JsonRpcProvider(BSC_TESTNET_RPCS[currentRpcIndex]);
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
    ethereum?: ethers.Eip1193Provider & {
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}
