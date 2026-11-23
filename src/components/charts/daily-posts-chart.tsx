import React, { useState } from "react";

export interface DailyPostData {
  date: string; // YYYY-MM-DD
  count: number;
}

interface DailyPostsChartProps {
  data: DailyPostData[];
  total: number;
}

export function DailyPostsChart({ data, total }: DailyPostsChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl h-64">
        <p className="text-sm text-zinc-500">No publication data available for this period.</p>
      </div>
    );
  }

  const counts = data.map((d) => d.count);
  const maxCount = Math.max(...counts, 4);

  // SVG dimensions
  const height = 220;
  const paddingBottom = 32;
  const paddingTop = 16;
  const paddingLeft = 32;
  const paddingRight = 16;
  const chartHeight = height - paddingTop - paddingBottom;

  // Grid ticks
  const yTicks = [0, Math.ceil(maxCount / 2), maxCount];

  return (
    <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Posts Published by Day
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Non-deleted channel posts aggregated by channel calendar date
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Period Total: </span>
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{total}</span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 600 ${height}`}
          className="w-full h-56 select-none"
          preserveAspectRatio="none"
        >
          {/* Y Axis Grid lines & Labels */}
          {yTicks.map((tick) => {
            const y = paddingTop + chartHeight - (tick / maxCount) * chartHeight;
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
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((item, index) => {
            const slotWidth = (600 - paddingLeft - paddingRight) / data.length;
            const barWidth = Math.max(Math.min(slotWidth * 0.65, 32), 6);
            const x = paddingLeft + index * slotWidth + (slotWidth - barWidth) / 2;
            const barHeight = (item.count / maxCount) * chartHeight;
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

                {/* Actual Bar */}
                {item.count > 0 ? (
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(barHeight, 2)}
                    rx={2}
                    className={`transition-colors ${
                      isHovered
                        ? "fill-blue-500 dark:fill-blue-400"
                        : "fill-blue-600 dark:fill-blue-500"
                    }`}
                  />
                ) : (
                  /* Zero count baseline indicator */
                  <line
                    x1={x}
                    y1={paddingTop + chartHeight}
                    x2={x + barWidth}
                    y2={paddingTop + chartHeight}
                    stroke="currentColor"
                    strokeWidth={2}
                    className="text-zinc-300 dark:text-zinc-700"
                  />
                )}

                {/* X Axis Label */}
                {(data.length <= 14 || index % Math.ceil(data.length / 8) === 0) && (
                  <text
                    x={paddingLeft + index * slotWidth + slotWidth / 2}
                    y={height - 10}
                    textAnchor="middle"
                    className="fill-zinc-400 text-[10px]"
                  >
                    {item.date.slice(5)} {/* MM-DD */}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIndex !== null && data[hoveredIndex] && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs shadow-md pointer-events-none transition-all z-10"
          >
            <div className="font-semibold">{data[hoveredIndex].date}</div>
            <div className="text-[11px] opacity-90">
              {data[hoveredIndex].count} {data[hoveredIndex].count === 1 ? "post" : "posts"} published
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
