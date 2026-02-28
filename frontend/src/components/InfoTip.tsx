"use client";

import { useState } from "react";

interface InfoTipProps {
  term: string;
  children?: React.ReactNode;
}

const GLOSSARY: Record<string, string> = {
  "Health Factor":
    "Measures how safe your position is. Above 1.0 = safe. Below 1.0 = liquidatable. Keep it above 1.5 to be safe.",
  "LTV":
    "Loan-to-Value ratio. The max percentage of your collateral's value you can borrow. 80% LTV means $800 max borrow on $1000 collateral.",
  "Collateral Factor":
    "Same as LTV. Determines how much you can borrow against your collateral. Set per market by the protocol.",
  "Collateral":
    "Tokens you lock in the protocol to secure your loan. If your loan goes bad, this gets seized.",
  "Supply APY":
    "Annual Percentage Yield for suppliers. This is the interest you earn by depositing tokens into the lending pool.",
  "Borrow APR":
    "Annual Percentage Rate for borrowers. This is the interest you pay on your borrowed tokens.",
  "cTokens":
    "Receipt tokens you get when you supply. They appreciate over time as interest accrues. Burn them to withdraw your deposit + earned interest.",
  "Utilization":
    "How much of the pool is being borrowed. High utilization = higher interest rates. Optimal is around 80%.",
  "Liquidation":
    "When your Health Factor drops below 1.0, anyone can repay your debt and seize your collateral at a 10% discount. Always monitor your HF.",
  "Liquidation Bonus":
    "The extra collateral (10%) a liquidator receives as incentive. This comes from the borrower's locked collateral.",
  "Total Supply":
    "Total tokens deposited by all lenders in this market's pool.",
  "Total Borrowed":
    "Total tokens borrowed by all borrowers from this market's pool.",
  "Pool Liquidity":
    "Available tokens in the pool (Total Supply - Total Borrowed). You can only borrow up to this amount.",
  "Risk Score":
    "A 0-100 score based on your Health Factor and borrow size. Higher = more dangerous. Keep it low.",
  "Max Liquidatable":
    "The full debt amount that can be liquidated in a single transaction. A liquidator can repay up to 100% of the debt.",
  "Oracle":
    "Price feeds that tell the protocol the current USD price of each token. Uses Chainlink-compatible aggregators.",
  "Reserve Factor":
    "Protocol's cut of the interest (10%). Goes to protocol reserves for sustainability.",
  "Flash Loan":
    "Borrow any amount in a single transaction, use it, and return it + 0.3% fee. No collateral needed. Used for arbitrage and liquidations.",
};

export default function InfoTip({ term, children }: InfoTipProps) {
  const [show, setShow] = useState(false);
  const tooltip = GLOSSARY[term];

  if (!tooltip) return <>{children ?? term}</>;

  return (
    <span className="inline-flex items-center gap-1 relative">
      {children ?? term}
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 text-[10px] font-bold leading-none transition-colors cursor-help shrink-0"
        aria-label={`Info: ${term}`}
      >
        i
      </button>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none">
          <span className="font-semibold text-yellow-400">{term}</span>
          <br />
          {tooltip}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
}
