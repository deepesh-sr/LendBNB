"use client";

interface MarketData {
  supplyToken: string;
  collateralToken: string;
  utilization: string;
}

interface Props {
  markets: MarketData[];
}

const COLORS = ["#1A1A1A", "#2563EB", "#10B981", "#F97316"];

export default function UtilizationGauge({ markets }: Props) {
  if (markets.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h4 className="text-gray-900 font-bold text-sm mb-1">Pool Utilization</h4>
      <p className="text-gray-400 text-xs mb-5">How much of each pool is being borrowed</p>
      <div className="space-y-5">
        {markets.map((m, i) => {
          const util = parseFloat(m.utilization);
          const color = COLORS[i % COLORS.length];
          const statusColor =
            util >= 80 ? "text-red-500" : util >= 50 ? "text-orange-500" : "text-emerald-500";

          return (
            <div key={`${m.collateralToken}-${m.supplyToken}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-gray-700 text-sm font-medium">
                  {m.collateralToken}/{m.supplyToken}
                </span>
                <span className={`font-mono text-sm font-bold ${statusColor}`}>
                  {util.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min(util, 100)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-400 text-xs">0%</span>
                <span className="text-gray-400 text-xs">100%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
