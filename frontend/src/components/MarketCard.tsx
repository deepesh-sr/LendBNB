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
  onSelect: () => void;
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
      onClick={onSelect}
      className="bg-white border border-gray-200 rounded-xl p-6 hover:border-gray-400 cursor-pointer transition-all hover:shadow-lg hover:shadow-gray-100 shadow-sm"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-900 font-bold">
          {collateralToken.charAt(0)}
        </div>
        <div>
          <h3 className="text-gray-900 font-bold">
            {collateralToken}/{supplyToken}
          </h3>
          <p className="text-gray-400 text-xs">Market #{marketId}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Total Supply</p>
          <p className="text-gray-900 font-mono">${totalSupply}</p>
        </div>
        <div>
          <p className="text-gray-500">Total Borrowed</p>
          <p className="text-gray-900 font-mono">${totalBorrows}</p>
        </div>
        <div>
          <p className="text-gray-500">Supply APY</p>
          <p className="text-emerald-500 font-mono font-medium">
            {supplyAPY}%
          </p>
        </div>
        <div>
          <p className="text-gray-500">Borrow APR</p>
          <p className="text-orange-500 font-mono font-medium">{borrowAPR}%</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-400">Utilization</span>
          <span className="text-gray-600">{utilization}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-gray-900 h-1.5 rounded-full"
            style={{ width: `${Math.min(100, parseFloat(utilization))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
