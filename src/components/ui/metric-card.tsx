import React, { useState } from "react";
import { PrecisionBadge, PrecisionType } from "./badge";
import { ChevronDownIcon } from "./icons";

interface BreakdownItem {
  label: string;
  count: number;
}

export type MetricVariant = "indigo" | "violet" | "emerald" | "zinc" | "rose" | "blue" | "amber" | "sky";

interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  precision?: PrecisionType;
  icon?: React.ReactNode;
  breakdown?: BreakdownItem[];
  badgeText?: string;
  unavailableReason?: string;
  variant?: MetricVariant;
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
  variant = "zinc",
}: MetricCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const iconStyles = {
    indigo: "bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]",
    violet: "bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]",
    emerald: "bg-emerald-50 text-emerald-600 border border-emerald-100",
    rose: "bg-rose-50 text-rose-600 border border-rose-100",
    blue: "bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]",
    amber: "bg-amber-50 text-amber-600 border border-amber-100",
    sky: "bg-sky-50 text-sky-600 border border-sky-100",
    zinc: "bg-[#F7F8FA] text-[#667085] border border-[#E5E7EB]",
  }[variant];

  const isMinimal = !subtitle && !precision && !badgeText && !breakdown && !unavailableReason;

  if (isMinimal) {
    return (
      <div className="group relative flex items-center justify-between gap-3 p-3.5 sm:p-5 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:shadow-[0_8px_20px_rgba(37,99,235,0.08)] hover:border-[#BFDBFE] transition-all duration-300 hover:-translate-y-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-[#111827] transition-transform duration-300 group-hover:scale-105 origin-left">
            {value}
          </span>
          <span className="text-xs sm:text-sm font-semibold text-[#667085] truncate">
            {title}
          </span>
        </div>
        {icon && (
          <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 ${iconStyles}`}>
            {icon}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="group relative flex flex-col justify-between p-3.5 sm:p-5 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:shadow-[0_4px_12px_rgba(16,24,40,0.06)] hover:border-[#D1D5DB] transition-all duration-200 hover:-translate-y-0.5">
      <div>
        <div className="flex items-center justify-between gap-1.5 text-[#667085] mb-2 sm:mb-3">
          <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-[#667085] truncate">
            {title}
          </span>
          {icon && (
            <div className={`p-1.5 sm:p-2 rounded-xl shrink-0 transition-transform duration-200 group-hover:scale-105 ${iconStyles}`}>
              {icon}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2 mt-1">
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-[#111827]">
            {value}
          </div>
          {precision && <PrecisionBadge precision={precision} />}
          {badgeText && (
            <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold tracking-tight bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]">
              {badgeText}
            </span>
          )}
        </div>

        {unavailableReason ? (
          <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-[#667085] line-clamp-2">
            {unavailableReason}
          </p>
        ) : subtitle ? (
          <p className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs text-[#667085] line-clamp-2 font-medium">
            {subtitle}
          </p>
        ) : null}
      </div>

      {breakdown && breakdown.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[#E5E7EB]">
          <button
            type="button"
            onClick={() => setShowBreakdown((prev) => !prev)}
            className="flex items-center justify-between w-full text-xs text-[#667085] hover:text-[#111827] transition-colors cursor-pointer group/btn"
          >
            <span className="font-medium group-hover/btn:underline">View count breakdown</span>
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showBreakdown ? "rotate-180" : ""
              }`}
            />
          </button>

          {showBreakdown && (
            <div className="mt-2.5 space-y-1.5 text-xs text-[#667085] bg-[#F7F8FA] p-3 rounded-xl border border-[#E5E7EB] animate-in fade-in-50 duration-150">
              {breakdown.map((item) => (
                <div key={item.label} className="flex justify-between items-center py-0.5">
                  <span className="text-[#667085]">{item.label}:</span>
                  <span className="font-semibold tabular-nums text-[#111827]">
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
