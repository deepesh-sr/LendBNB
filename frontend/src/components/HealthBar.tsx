"use client";

export default function HealthBar({ healthFactor }: { healthFactor: number }) {
  // Health factor: > 1.5 green, 1.0-1.5 yellow, < 1.0 red
  const getColor = () => {
    if (healthFactor >= 1.5) return "bg-green-500";
    if (healthFactor >= 1.0) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getLabel = () => {
    if (healthFactor >= 2.0) return "Safe";
    if (healthFactor >= 1.5) return "Healthy";
    if (healthFactor >= 1.0) return "At Risk";
    return "Liquidatable";
  };

  // Cap display at 300%
  const width = Math.min(100, (healthFactor / 3) * 100);

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">Health Factor</span>
        <span className={healthFactor < 1.0 ? "text-red-400 font-bold" : "text-gray-300"}>
          {healthFactor === Infinity ? "∞" : healthFactor.toFixed(2)} - {getLabel()}
        </span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className={`${getColor()} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
