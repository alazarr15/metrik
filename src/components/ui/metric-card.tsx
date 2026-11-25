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

    const duration = 1400;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutCubic for a smooth, clearly visible count-up
      const eased = progress === 1 ? 1 : 1 - Math.pow(1 - progress, 3);
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
  animationDelayMs?: number;
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
  animationDelayMs = 0,
}: MetricCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const iconStyles = {
    indigo: "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-[0_4px_12px_rgba(79,70,229,0.28)] ring-2 ring-indigo-100",
    violet: "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_4px_12px_rgba(124,58,237,0.28)] ring-2 ring-violet-100",
    emerald: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_12px_rgba(5,150,105,0.28)] ring-2 ring-emerald-100",
    rose: "bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-[0_4px_12px_rgba(225,29,72,0.28)] ring-2 ring-rose-100",
    blue: "bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white shadow-[0_4px_12px_rgba(37,99,235,0.28)] ring-2 ring-blue-100",
    amber: "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-[0_4px_12px_rgba(217,119,6,0.28)] ring-2 ring-amber-100",
    sky: "bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-[0_4px_12px_rgba(2,132,199,0.28)] ring-2 ring-sky-100",
    zinc: "bg-gradient-to-br from-[#667085] to-[#475467] text-white shadow-[0_4px_12px_rgba(71,84,103,0.2)] ring-2 ring-zinc-100",
  }[variant];

  const accentStyles = {
    indigo: {
      surface: "bg-gradient-to-br from-white via-white to-indigo-50/75 border-indigo-100/90",
      orb: "bg-indigo-400/20",
      glow: "hover:shadow-[0_14px_30px_-8px_rgba(79,70,229,0.22)]",
      bar: "from-indigo-500 via-blue-500 to-indigo-400",
      ring: "hover:border-indigo-300/90",
    },
    violet: {
      surface: "bg-gradient-to-br from-white via-white to-violet-50/75 border-violet-100/90",
      orb: "bg-violet-400/20",
      glow: "hover:shadow-[0_14px_30px_-8px_rgba(124,58,237,0.22)]",
      bar: "from-violet-500 via-purple-500 to-fuchsia-400",
      ring: "hover:border-violet-300/90",
    },
    emerald: {
      surface: "bg-gradient-to-br from-white via-white to-emerald-50/75 border-emerald-100/90",
      orb: "bg-emerald-400/20",
      glow: "hover:shadow-[0_14px_30px_-8px_rgba(5,150,105,0.22)]",
      bar: "from-emerald-500 via-teal-500 to-emerald-400",
      ring: "hover:border-emerald-300/90",
    },
    rose: {
      surface: "bg-gradient-to-br from-white via-white to-rose-50/75 border-rose-100/90",
      orb: "bg-rose-400/20",
      glow: "hover:shadow-[0_14px_30px_-8px_rgba(225,29,72,0.22)]",
      bar: "from-rose-500 via-pink-500 to-rose-400",
      ring: "hover:border-rose-300/90",
    },
    blue: {
      surface: "bg-gradient-to-br from-white via-white to-[#EFF6FF]/90 border-[#DBEAFE]/90",
      orb: "bg-blue-400/20",
      glow: "hover:shadow-[0_14px_30px_-8px_rgba(37,99,235,0.22)]",
      bar: "from-[#2563EB] via-[#3B82F6] to-[#60A5FA]",
      ring: "hover:border-[#93C5FD]",
    },
    amber: {
      surface: "bg-gradient-to-br from-white via-white to-amber-50/75 border-amber-100/90",
      orb: "bg-amber-400/20",
      glow: "hover:shadow-[0_14px_30px_-8px_rgba(217,119,6,0.22)]",
      bar: "from-amber-500 via-orange-500 to-amber-400",
      ring: "hover:border-amber-300/90",
    },
    sky: {
      surface: "bg-gradient-to-br from-white via-white to-sky-50/75 border-sky-100/90",
      orb: "bg-sky-400/20",
      glow: "hover:shadow-[0_14px_30px_-8px_rgba(2,132,199,0.22)]",
      bar: "from-sky-500 via-cyan-500 to-sky-400",
      ring: "hover:border-sky-300/90",
    },
    zinc: {
      surface: "bg-gradient-to-br from-white via-white to-[#F7F8FA] border-[#E5E7EB]",
      orb: "bg-zinc-300/25",
      glow: "hover:shadow-[0_14px_28px_-8px_rgba(16,24,40,0.12)]",
      bar: "from-[#98A2B3] to-[#D0D5DD]",
      ring: "hover:border-[#D1D5DB]",
    },
  }[variant];

  const isMinimal = !subtitle && !precision && !badgeText && !breakdown && !unavailableReason;

  if (isMinimal) {
    return (
      <div
        style={{ animationDelay: `${animationDelayMs}ms` }}
        className={`group relative overflow-hidden flex items-center justify-between gap-3 p-3.5 sm:p-5 rounded-2xl border shadow-[0_2px_6px_rgba(16,24,40,0.04)] hover:-translate-y-1 transition-all duration-300 ease-out animate-fade-up ${accentStyles.surface} ${accentStyles.glow} ${accentStyles.ring}`}
      >
        {/* Top accent bar (visible at rest, brighter on hover) */}
        <span className={`pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accentStyles.bar} opacity-80 group-hover:opacity-100 transition-opacity duration-300`} />
        {/* Soft corner ambient orb */}
        <span className={`pointer-events-none absolute -right-5 -top-5 w-20 h-20 rounded-full blur-2xl ${accentStyles.orb} opacity-60 group-hover:opacity-100 group-hover:scale-125 transition-all duration-500`} />
        {/* Diagonal light sheen on hover */}
        <span className="pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent group-hover:translate-x-[320%] transition-transform duration-700 ease-out" />

        <div className="relative flex flex-col min-w-0">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-[#667085] truncate">
            {title}
          </span>
          <span className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-[#111827] transition-transform duration-300 group-hover:scale-[1.04] origin-left">
            <AnimatedValue value={value} />
          </span>
        </div>
        {icon && (
          <div className={`relative p-2.5 sm:p-3 rounded-xl shrink-0 transition-all duration-300 ease-out group-hover:scale-110 group-hover:-rotate-6 ${iconStyles}`}>
            {icon}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ animationDelay: `${animationDelayMs}ms` }}
      className={`group relative overflow-hidden flex flex-col justify-between p-3.5 sm:p-5 rounded-2xl border shadow-[0_2px_6px_rgba(16,24,40,0.04)] hover:-translate-y-1 transition-all duration-300 ease-out animate-fade-up ${accentStyles.surface} ${accentStyles.glow} ${accentStyles.ring}`}
    >
      {/* Top accent bar */}
      <span className={`pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accentStyles.bar} opacity-80 group-hover:opacity-100 transition-opacity duration-300`} />
      {/* Soft corner ambient orb */}
      <span className={`pointer-events-none absolute -right-5 -top-5 w-20 h-20 rounded-full blur-2xl ${accentStyles.orb} opacity-60 group-hover:opacity-100 group-hover:scale-125 transition-all duration-500`} />
      {/* Diagonal light sheen on hover */}
      <span className="pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent group-hover:translate-x-[320%] transition-transform duration-700 ease-out" />
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
