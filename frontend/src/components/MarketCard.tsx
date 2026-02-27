"use client";

interface MarketCardProps {
  marketId: number;
  supplyToken: string;
  collateralToken: string;
  totalSupply: string;
  totalBorrows: string;
  utilization: string;
  supplyAPY: string;
  borrowAPR: string;
  onSelect: (marketId: number) => void;
}

export default function MarketCard({
  marketId,
  supplyToken,
  collateralToken,
  totalSupply,
  totalBorrows,
  utilization,
  supplyAPY,
  borrowAPR,
  onSelect,
}: MarketCardProps) {
  return (
    <div
      onClick={() => onSelect(marketId)}
      className="bg-gray-800 border border-gray-700 rounded-xl p-6 hover:border-yellow-500/50 cursor-pointer transition-all hover:shadow-lg hover:shadow-yellow-500/10"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center text-yellow-400 font-bold">
          {collateralToken.charAt(0)}
        </div>
        <div>
          <h3 className="text-white font-bold">{collateralToken}/{supplyToken}</h3>
          <p className="text-gray-400 text-xs">Market #{marketId}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-400">Total Supply</p>
          <p className="text-white font-mono">${totalSupply}</p>
        </div>
        <div>
          <p className="text-gray-400">Total Borrowed</p>
          <p className="text-white font-mono">${totalBorrows}</p>
        </div>
        <div>
          <p className="text-gray-400">Supply APY</p>
          <p className="text-green-400 font-mono">{supplyAPY}%</p>
        </div>
        <div>
          <p className="text-gray-400">Borrow APR</p>
          <p className="text-orange-400 font-mono">{borrowAPR}%</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-400">Utilization</span>
          <span className="text-gray-300">{utilization}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-1.5">
          <div
            className="bg-yellow-500 h-1.5 rounded-full"
            style={{ width: `${Math.min(100, parseFloat(utilization))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
