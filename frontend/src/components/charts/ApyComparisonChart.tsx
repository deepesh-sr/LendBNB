"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface MarketData {
  supplyToken: string;
  collateralToken: string;
  supplyAPY: string;
  borrowAPR: string;
}

interface Props {
  markets: MarketData[];
}

export default function ApyComparisonChart({ markets }: Props) {
  if (markets.length === 0) return null;

  const data = markets.map((m) => ({
    name: `${m.collateralToken}/${m.supplyToken}`,
    "Supply APY": parseFloat(m.supplyAPY),
    "Borrow APR": parseFloat(m.borrowAPR),
  }));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h4 className="text-gray-900 font-bold text-sm mb-1">APY vs APR</h4>
      <p className="text-gray-400 text-xs mb-4">Supply yield vs borrow cost per market</p>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} barGap={4} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#6B7280" }}
            axisLine={{ stroke: "#E5E7EB" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
            unit="%"
          />
          <Tooltip
            formatter={(v) => `${Number(v).toFixed(2)}%`}
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
          <Bar
            dataKey="Supply APY"
            fill="#10B981"
            radius={[6, 6, 0, 0]}
            maxBarSize={60}
          />
          <Bar
            dataKey="Borrow APR"
            fill="#F97316"
            radius={[6, 6, 0, 0]}
            maxBarSize={60}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
