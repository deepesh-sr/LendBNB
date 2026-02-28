"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface MarketData {
  supplyToken: string;
  collateralToken: string;
  supplyTokenAddr: string;
  totalSupply: string;
  totalBorrows: string;
}

interface Props {
  markets: MarketData[];
  tokenPrices: Record<string, number>;
}

const COLORS = ["#1A1A1A", "#2563EB", "#10B981", "#F97316"];

function formatUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export default function MarketDistributionChart({ markets, tokenPrices }: Props) {
  const supplyData = markets.map((m) => ({
    name: `${m.collateralToken}/${m.supplyToken}`,
    value: parseFloat(m.totalSupply) * (tokenPrices[m.supplyTokenAddr] ?? 1),
  }));

  const borrowData = markets.map((m) => ({
    name: `${m.collateralToken}/${m.supplyToken}`,
    value: parseFloat(m.totalBorrows) * (tokenPrices[m.supplyTokenAddr] ?? 1),
  }));

  const hasSupply = supplyData.some((d) => d.value > 0);
  const hasBorrow = borrowData.some((d) => d.value > 0);

  if (!hasSupply && !hasBorrow) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h4 className="text-gray-900 font-bold text-sm mb-1">Supply Distribution</h4>
        <p className="text-gray-400 text-xs mb-4">Total value supplied per market</p>
        {hasSupply ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={supplyData}
                innerRadius={55}
                outerRadius={85}
                dataKey="value"
                paddingAngle={3}
                strokeWidth={0}
              >
                {supplyData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
        ) : (
          <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
            No supply data yet
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h4 className="text-gray-900 font-bold text-sm mb-1">Borrow Distribution</h4>
        <p className="text-gray-400 text-xs mb-4">Total value borrowed per market</p>
        {hasBorrow ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={borrowData}
                innerRadius={55}
                outerRadius={85}
                dataKey="value"
                paddingAngle={3}
                strokeWidth={0}
              >
                {borrowData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
        ) : (
          <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
            No borrow data yet
          </div>
        )}
      </div>
    </div>
  );
}
