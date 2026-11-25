import React, { useState } from "react";
import { PrecisionBadge } from "../ui/badge";

export interface DailyObservedGrowthData {
  date: string;
  observedGrowth: number | null;
  isExact?: boolean;
  reason?: string;
}

export interface ViewsGrowthCoverageData {
  totalPosts: number;
  eligiblePostsCount: number;
  excludedNoBaseline: number;
  excludedNoSubsequentObservation: number;
  excludedRoundedOrUnavailable: number;
  excludedNegativeDelta: number;
}

interface ObservedGrowthChartProps {
  daily: DailyObservedGrowthData[];
  totalGrowth: number | null;
  isExact: boolean;
  label: string;
  description: string;
  coverage: ViewsGrowthCoverageData;
}

export function ObservedGrowthChart({
  daily,
  totalGrowth,
  isExact,
  label,
  description,
  coverage,
}: ObservedGrowthChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showCoverageDetails, setShowCoverageDetails] = useState(false);

  const validGrowths = daily
    .map((d) => d.observedGrowth)
    .filter((g): g is number => g !== null && g > 0);

  const maxGrowth = validGrowths.length > 0 ? Math.max(...validGrowths, 10) : 10;

  // Chart dimensions
  const height = 220;
  const paddingTop = 16;
  const paddingBottom = 32;
  const paddingLeft = 36;
  const paddingRight = 16;
  const chartHeight = height - paddingTop - paddingBottom;

  const yTicks = [0, Math.ceil(maxGrowth / 2), maxGrowth];

  return (
    <div className="p-6 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="max-w-xl">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{label}</h3>
            {totalGrowth !== null && <PrecisionBadge precision={isExact ? "EXACT" : "ROUNDED"} />}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
            {description}
          </p>
        </div>

        <div className="inline-flex flex-col items-end px-3.5 py-1.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-100/80 dark:border-emerald-900/50">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400">Period Growth</span>
          <span className="text-xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
            {totalGrowth !== null ? `+${totalGrowth.toLocaleString()}` : "Unavailable"}
          </span>
        </div>
      </div>

      {/* Coverage Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 mb-4 rounded-xl bg-zinc-50/80 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 text-xs">
        <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
          <span>
            Eligible posts:{" "}
            <strong className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
              {coverage.eligiblePostsCount}
            </strong>{" "}
            / {coverage.totalPosts}
          </span>
          {coverage.totalPosts - coverage.eligiblePostsCount > 0 && (
            <span className="text-zinc-400">
              ({coverage.totalPosts - coverage.eligiblePostsCount} excluded)
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowCoverageDetails((prev) => !prev)}
          className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer font-medium underline underline-offset-2"
        >
          {showCoverageDetails ? "Hide audit details" : "Coverage breakdown"}
        </button>
      </div>

      {showCoverageDetails && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-100 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 animate-in fade-in-50 duration-150">
          <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
            <div className="text-[10px] uppercase font-semibold text-zinc-400">No baseline</div>
            <div className="font-bold tabular-nums text-sm mt-0.5">{coverage.excludedNoBaseline}</div>
          </div>
          <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
            <div className="text-[10px] uppercase font-semibold text-zinc-400">No subsequent</div>
            <div className="font-bold tabular-nums text-sm mt-0.5">{coverage.excludedNoSubsequentObservation}</div>
          </div>
          <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
            <div className="text-[10px] uppercase font-semibold text-zinc-400">Rounded / Missing</div>
            <div className="font-bold tabular-nums text-sm mt-0.5">{coverage.excludedRoundedOrUnavailable}</div>
          </div>
          <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
            <div className="text-[10px] uppercase font-semibold text-zinc-400">Drop anomaly</div>
            <div className="font-bold tabular-nums text-sm mt-0.5 text-rose-500">{coverage.excludedNegativeDelta}</div>
          </div>
        </div>
      )}

      {/* Chart SVG */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 600 ${height}`}
          className="w-full h-56 select-none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="emerald-bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="emerald-bar-hover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
          {/* Y Axis Grid lines & Labels */}
          {yTicks.map((tick) => {
            const y = paddingTop + chartHeight - (tick / maxGrowth) * chartHeight;
            return (
              <g key={tick}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={600 - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray="3 3"
                  className="text-zinc-100 dark:text-zinc-800"
                />
                <text
                  x={paddingLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-zinc-400 text-[10px]"
                >
                  +{tick}
                </text>
              </g>
            );
          })}

          {/* Daily Elements */}
          {daily.map((item, index) => {
            const slotWidth = (600 - paddingLeft - paddingRight) / daily.length;
            const barWidth = Math.max(Math.min(slotWidth * 0.65, 32), 6);
            const x = paddingLeft + index * slotWidth + (slotWidth - barWidth) / 2;
            const hasGrowth = item.observedGrowth !== null && item.observedGrowth > 0;
            const barHeight = hasGrowth ? (item.observedGrowth! / maxGrowth) * chartHeight : 0;
            const y = paddingTop + chartHeight - barHeight;
            const isHovered = hoveredIndex === index;

            return (
              <g
                key={item.date}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Background hover highlight */}
                <rect
                  x={paddingLeft + index * slotWidth}
                  y={paddingTop}
                  width={slotWidth}
                  height={chartHeight}
                  fill={isHovered ? "currentColor" : "transparent"}
                  className="text-zinc-50 dark:text-zinc-800/40 transition-colors"
                />

                {/* Growth Bar */}
                {hasGrowth ? (
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(barHeight, 2)}
                    rx={3}
                    fill={isHovered ? "url(#emerald-bar-hover)" : "url(#emerald-bar)"}
                    className="transition-all duration-150"
                  />
                ) : (
                  /* Dot / dashed line for baseline or unobserved day */
                  <circle
                    cx={x + barWidth / 2}
                    cy={paddingTop + chartHeight}
                    r={2.5}
                    className={
                      item.reason === "Baseline establishment only"
                        ? "fill-amber-400 dark:fill-amber-500"
                        : "fill-zinc-300 dark:fill-zinc-700"
                    }
                  />
                )}

                {/* X Axis Label */}
                {(daily.length <= 14 || index % Math.ceil(daily.length / 8) === 0) && (
                  <text
                    x={paddingLeft + index * slotWidth + slotWidth / 2}
                    y={height - 10}
                    textAnchor="middle"
                    className="fill-zinc-400 text-[10px]"
                  >
                    {item.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIndex !== null && daily[hoveredIndex] && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs shadow-md pointer-events-none transition-all z-10">
            <div className="font-semibold">{daily[hoveredIndex].date}</div>
            <div className="text-[11px] opacity-90">
              {daily[hoveredIndex].observedGrowth !== null ? (
                <span>+{daily[hoveredIndex].observedGrowth} observed views</span>
              ) : (
                <span className="italic text-zinc-300 dark:text-zinc-600">
                  {daily[hoveredIndex].reason || "No verified delta"}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
