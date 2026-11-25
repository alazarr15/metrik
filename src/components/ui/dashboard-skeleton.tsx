import React from "react";

/**
 * Full-dashboard loading skeleton.
 * Mirrors the real layout (nav bar, filter row, header, KPI cards, chart, table)
 * so the first paint feels like the app is already there — just filling in.
 */
export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-[#111827]">
      {/* Top bar skeleton */}
      <div className="sticky top-0 z-30 w-full border-b border-[#E5E7EB] bg-white/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="skeleton w-9 h-9 rounded-xl" />
              <div className="skeleton h-5 w-20 rounded-md hidden sm:block" />
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <div className="skeleton h-8 w-8 rounded-xl" />
              <div className="skeleton h-8 w-8 rounded-xl" />
              <div className="skeleton h-8 w-8 rounded-xl" />
              <div className="skeleton h-8 w-16 rounded-xl hidden sm:block" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Filter row skeleton */}
        <div className="flex items-center justify-between gap-3">
          <div className="skeleton h-9 w-52 rounded-xl" />
          <div className="skeleton h-9 w-9 rounded-xl" />
        </div>

        {/* Channel header skeleton */}
        <div className="pb-4 border-b border-[#E5E7EB]">
          <div className="skeleton h-7 w-48 rounded-lg" />
        </div>

        {/* KPI cards skeleton */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="relative overflow-hidden p-3.5 sm:p-5 rounded-2xl border border-[#E5E7EB] bg-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-2 min-w-0 flex-1">
                <div className="skeleton h-3 w-16 rounded" />
                <div className="skeleton h-8 w-24 rounded-lg" />
              </div>
              <div className="skeleton p-2.5 rounded-xl w-11 h-11 shrink-0" />
            </div>
          </div>
          <div className="relative overflow-hidden p-3.5 sm:p-5 rounded-2xl border border-[#E5E7EB] bg-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-2 min-w-0 flex-1">
                <div className="skeleton h-3 w-16 rounded" />
                <div className="skeleton h-8 w-24 rounded-lg" />
              </div>
              <div className="skeleton p-2.5 rounded-xl w-11 h-11 shrink-0" />
            </div>
          </div>
        </div>

        {/* Chart card skeleton */}
        <div className="p-6 rounded-2xl border border-[#E5E7EB] bg-white">
          <div className="flex items-center justify-between mb-5">
            <div className="flex flex-col gap-2">
              <div className="skeleton h-4 w-40 rounded" />
              <div className="skeleton h-3 w-56 rounded" />
            </div>
            <div className="skeleton h-7 w-16 rounded-full" />
          </div>
          <div className="flex items-end gap-2 h-44">
            {[40, 65, 30, 80, 50, 90, 45, 70, 35, 60, 85, 40].map((h, i) => (
              <div
                key={i}
                className="skeleton flex-1 rounded-t-md"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* Table card skeleton */}
        <div className="p-6 rounded-2xl border border-[#E5E7EB] bg-white">
          <div className="flex items-center justify-between pb-4 border-b border-[#E5E7EB]">
            <div className="flex flex-col gap-2">
              <div className="skeleton h-4 w-48 rounded" />
              <div className="skeleton h-3 w-64 rounded" />
            </div>
            <div className="skeleton h-4 w-32 rounded" />
          </div>
          <div className="mt-2 divide-y divide-[#E5E7EB]/70">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 py-3.5">
                <div className="skeleton h-3.5 w-12 rounded hidden sm:block" />
                <div className="skeleton h-3.5 w-20 rounded" />
                <div className="skeleton h-3.5 flex-1 rounded" />
                <div className="skeleton h-3.5 w-14 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}