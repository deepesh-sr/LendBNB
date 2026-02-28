"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface PositionData {
  supplyDeposited: string;
  collateralDeposited: string;
  borrowedAmount: string;
  supplyTokenAddr: string;
  collateralTokenAddr: string;
}

interface Props {
  positions: PositionData[];
  tokenPrices: Record<string, number>;
}

const SEGMENTS = [
  { key: "Supplied", color: "#10B981" },
  { key: "Collateral", color: "#2563EB" },
  { key: "Borrowed", color: "#F97316" },
];

function formatUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

export default function PortfolioBreakdownChart({ positions, tokenPrices }: Props) {
  let totalSupplied = 0;
  let totalCollateral = 0;
  let totalBorrowed = 0;

  for (const pos of positions) {
    const supplyPrice = tokenPrices[pos.supplyTokenAddr] ?? 0;
    const collPrice = tokenPrices[pos.collateralTokenAddr] ?? 0;
    totalSupplied += parseFloat(pos.supplyDeposited) * supplyPrice;
    totalCollateral += parseFloat(pos.collateralDeposited) * collPrice;
    totalBorrowed += parseFloat(pos.borrowedAmount) * supplyPrice;
  }

  const data = [
    { name: "Supplied", value: totalSupplied, color: SEGMENTS[0].color },
    { name: "Collateral", value: totalCollateral, color: SEGMENTS[1].color },
    { name: "Borrowed", value: totalBorrowed, color: SEGMENTS[2].color },
  ].filter((d) => d.value > 0);

  if (data.length === 0) return null;

  const netWorth = totalSupplied + totalCollateral - totalBorrowed;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h4 className="text-gray-900 font-bold text-sm mb-1">Portfolio Breakdown</h4>
      <p className="text-gray-400 text-xs mb-4">Your positions by value (USD)</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            innerRadius={55}
            outerRadius={80}
            dataKey="value"
            paddingAngle={3}
            strokeWidth={0}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => formatUsd(Number(v))}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
              fontSize: "12px",
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "12px", color: "#6B7280" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="text-center mt-2 pt-3 border-t border-gray-100">
        <p className="text-gray-500 text-xs">Net Worth</p>
        <p className={`font-mono font-bold text-lg ${netWorth >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {formatUsd(Math.abs(netWorth))}
        </p>
      </div>
    </div>
  );
}
