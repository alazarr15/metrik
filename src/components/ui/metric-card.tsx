import React, { useState, useEffect, useRef } from "react";
import { PrecisionBadge, PrecisionType } from "./badge";
import { ChevronDownIcon } from "./icons";

/** Animates a numeric value from 0 up to `end` once, on mount. Non-numeric values render as-is. */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      frame.current = requestAnimationFrame(() => setDisplay(value));
      return () => {
        if (frame.current) cancelAnimationFrame(frame.current);
      };
    }

    const duration = 700;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutExpo for a snappy-but-smooth settle
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(Math.round(eased * value));
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      }
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return <>{display.toLocaleString()}</>;
}

/** Renders a count-up for numeric values, and passes through strings/ReactNodes unchanged. */
function AnimatedValue({ value }: { value: React.ReactNode }) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return <AnimatedNumber value={value} />;
  }
  return <>{value}</>;
}

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
    indigo: "bg-gradient-to-tr from-[#EFF6FF] to-white text-[#2563EB] border border-[#DBEAFE]",
    violet: "bg-gradient-to-tr from-[#F5F3FF] to-white text-[#7C3AED] border border-[#EDE9FE]",
    emerald: "bg-gradient-to-tr from-emerald-50 to-white text-emerald-600 border border-emerald-100",
    rose: "bg-gradient-to-tr from-rose-50 to-white text-rose-600 border border-rose-100",
    blue: "bg-gradient-to-tr from-[#EFF6FF] to-white text-[#2563EB] border border-[#DBEAFE]",
    amber: "bg-gradient-to-tr from-amber-50 to-white text-amber-600 border border-amber-100",
    sky: "bg-gradient-to-tr from-sky-50 to-white text-sky-600 border border-sky-100",
    zinc: "bg-gradient-to-tr from-[#F7F8FA] to-white text-[#667085] border border-[#E5E7EB]",
  }[variant];

  // Accent glow + top bar color per variant (kept subtle)
  const accentStyles = {
    indigo: { glow: "group-hover:shadow-[0_12px_28px_rgba(37,99,235,0.12)]", bar: "from-[#2563EB] to-[#60A5FA]", ring: "group-hover:border-[#BFDBFE]" },
    violet: { glow: "group-hover:shadow-[0_12px_28px_rgba(124,58,237,0.12)]", bar: "from-[#7C3AED] to-[#A78BFA]", ring: "group-hover:border-[#DDD6FE]" },
    emerald: { glow: "group-hover:shadow-[0_12px_28px_rgba(5,150,105,0.12)]", bar: "from-emerald-500 to-emerald-300", ring: "group-hover:border-emerald-200" },
    rose: { glow: "group-hover:shadow-[0_12px_28px_rgba(225,29,72,0.12)]", bar: "from-rose-500 to-rose-300", ring: "group-hover:border-rose-200" },
    blue: { glow: "group-hover:shadow-[0_12px_28px_rgba(37,99,235,0.12)]", bar: "from-[#2563EB] to-[#60A5FA]", ring: "group-hover:border-[#BFDBFE]" },
    amber: { glow: "group-hover:shadow-[0_12px_28px_rgba(217,119,6,0.12)]", bar: "from-amber-500 to-amber-300", ring: "group-hover:border-amber-200" },
    sky: { glow: "group-hover:shadow-[0_12px_28px_rgba(2,132,199,0.12)]", bar: "from-sky-500 to-sky-300", ring: "group-hover:border-sky-200" },
    zinc: { glow: "group-hover:shadow-[0_12px_28px_rgba(16,24,40,0.08)]", bar: "from-[#98A2B3] to-[#D0D5DD]", ring: "group-hover:border-[#D1D5DB]" },
  }[variant];

  const isMinimal = !subtitle && !precision && !badgeText && !breakdown && !unavailableReason;

  if (isMinimal) {
    return (
      <div className={`group relative overflow-hidden flex items-center justify-between gap-3 p-3.5 sm:p-5 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:-translate-y-1 transition-all duration-300 animate-fade-up ${accentStyles.glow} ${accentStyles.ring}`}>
        {/* Top accent bar */}
        <span className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${accentStyles.bar} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-[#667085] truncate">
            {title}
          </span>
          <span className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-[#111827] transition-transform duration-300 group-hover:scale-105 origin-left">
            <AnimatedValue value={value} />
          </span>
        </div>
        {icon && (
          <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 ${iconStyles}`}>
            {icon}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`group relative overflow-hidden flex flex-col justify-between p-3.5 sm:p-5 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:-translate-y-0.5 transition-all duration-300 animate-fade-up ${accentStyles.glow} ${accentStyles.ring}`}>
      {/* Top accent bar */}
      <span className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${accentStyles.bar} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
      <div>
        <div className="flex items-center justify-between gap-1.5 text-[#667085] mb-2 sm:mb-3">
          <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-[#667085] truncate">
            {title}
          </span>
          {icon && (
            <div className={`p-1.5 sm:p-2 rounded-xl shrink-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-transform duration-200 group-hover:scale-105 ${iconStyles}`}>
              {icon}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2 mt-1">
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-[#111827]">
            <AnimatedValue value={value} />
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
