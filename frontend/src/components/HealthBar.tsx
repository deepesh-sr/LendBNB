"use client";

export default function HealthBar({
  healthFactor,
}: {
  healthFactor: number;
}) {
  const getColor = () => {
    if (healthFactor >= 1.5) return "bg-emerald-400";
    if (healthFactor >= 1.0) return "bg-yellow-400";
    return "bg-red-400";
  };

  const getLabel = () => {
    if (healthFactor >= 2.0) return "Safe";
    if (healthFactor >= 1.5) return "Healthy";
    if (healthFactor >= 1.0) return "At Risk";
    return "Liquidatable";
  };

  const width = Math.min(100, (healthFactor / 3) * 100);

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">Health Factor</span>
        <span
          className={
            healthFactor < 1.0
              ? "text-red-500 font-bold"
              : "text-gray-600"
          }
        >
          {healthFactor === Infinity ? "\u221E" : healthFactor.toFixed(2)} -{" "}
          {getLabel()}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className={`${getColor()} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
