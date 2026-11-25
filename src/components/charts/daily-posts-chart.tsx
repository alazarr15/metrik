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
      <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-[#E5E7EB] bg-white rounded-2xl h-64">
        <p className="text-sm text-[#667085]">No publication data available for this period.</p>
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
    <div className="p-6 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div>
          <h3 className="text-sm font-bold text-[#111827] tracking-tight">
            Posts Published by Day
          </h3>
          <p className="text-xs text-[#667085] mt-0.5 line-clamp-1">
            Daily non-deleted posts in channel timezone.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]">
          <span className="text-[11px] font-medium text-[#2563EB]/80">Total:</span>
          <span className="text-xs font-bold tabular-nums">{total}</span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 600 ${height}`}
          className="w-full h-56 select-none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="cobalt-bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#1D4ED8" />
            </linearGradient>
            <linearGradient id="cobalt-bar-hover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>

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
                  className="text-[#E5E7EB]"
                />
                <text
                  x={paddingLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-[#667085] text-[10px]"
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
                  className="text-[#F7F8FA] transition-colors"
                />

                {/* Actual Bar */}
                {item.count > 0 ? (
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(barHeight, 2)}
                    rx={3}
                    fill={isHovered ? "url(#cobalt-bar-hover)" : "url(#cobalt-bar)"}
                    className="transition-all duration-150 animate-grow-bar"
                    style={{ transformOrigin: `${x + barWidth / 2}px ${paddingTop + chartHeight}px` }}
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
                    className="text-[#E5E7EB]"
                  />
                )}

                {/* X Axis Label */}
                {(data.length <= 14 || index % Math.ceil(data.length / 8) === 0) && (
                  <text
                    x={paddingLeft + index * slotWidth + slotWidth / 2}
                    y={height - 10}
                    textAnchor="middle"
                    className="fill-[#667085] text-[10px]"
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
            className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-[#111827] text-white text-xs shadow-lg pointer-events-none transition-all z-10 animate-pop"
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
