import React, { useState } from "react";
import { PrecisionBadge, PrecisionType } from "./badge";
import { ChevronDownIcon } from "./icons";

interface BreakdownItem {
  label: string;
  count: number;
}

interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  precision?: PrecisionType;
  icon?: React.ReactNode;
  breakdown?: BreakdownItem[];
  badgeText?: string;
  unavailableReason?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  precision,
  icon,
  breakdown,
  badgeText,
  unavailableReason,
}: MetricCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <div className="flex flex-col justify-between p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
      <div>
        <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
          {icon && <div className="text-zinc-400 dark:text-zinc-500">{icon}</div>}
        </div>

        <div className="flex items-baseline gap-2 mt-1">
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {value}
          </div>
          {precision && <PrecisionBadge precision={precision} />}
          {badgeText && (
            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium tracking-tight bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
              {badgeText}
            </span>
          )}
        </div>

        {unavailableReason ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 italic">
            {unavailableReason}
          </p>
        ) : subtitle ? (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        ) : null}
      </div>

      {breakdown && breakdown.length > 0 && (
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
          <button
            type="button"
            onClick={() => setShowBreakdown((prev) => !prev)}
            className="flex items-center justify-between w-full text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <span>View count breakdown</span>
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showBreakdown ? "rotate-180" : ""
              }`}
            />
          </button>

          {showBreakdown && (
            <div className="mt-2.5 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
              {breakdown.map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span>{item.label}:</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
