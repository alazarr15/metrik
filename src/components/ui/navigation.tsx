import React, { useState } from "react";
import {
  LogoIcon,
  LogOutIcon,
  CalendarIcon,
  MenuIcon,
  XIcon,
  ChevronDownIcon,
  RefreshCwIcon,
} from "./icons";
import { SyncStatusType } from "./badge";

export type PlatformType = "telegram" | "youtube" | "facebook";

export interface ChannelItem {
  id: string;
  telegramUsername: string;
  title: string | null;
  timezone: string;
  postsCount: number;
  bootstrapStatus?: string;
  lastSyncedAt?: string | null;
  nextPollAt?: string | null;
  latestSync?: {
    id: string;
    status: SyncStatusType;
    finishedAt: string | null;
    pagesFetched: number;
    postsFetched: number;
  } | null;
}

export type RangePreset = "1d" | "5d" | "7d" | "15d" | "30d" | "60d";

export interface RangeAvailabilityItem {
  isAvailable: boolean;
  reason?: string;
}

interface NavigationProps {
  channels: ChannelItem[];
  selectedChannelId: string;
  onSelectChannel: (id: string) => void;
  selectedRange: RangePreset;
  onSelectRange: (range: RangePreset) => void;
  rangeAvailability?: Partial<Record<RangePreset, RangeAvailabilityItem>>;
  onLogout: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Navigation({
  channels,
  selectedChannelId,
  onSelectChannel,
  selectedRange,
  onSelectRange,
  rangeAvailability,
  onLogout,
  onRefresh,
  isRefreshing,
}: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-[#E5E7EB] bg-white/95 backdrop-blur-md transition-colors shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Brand & Channel Dropdown */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-xl bg-[#2563EB] text-white shadow-xs">
                <LogoIcon className="w-5 h-5" />
              </div>
              <span className="font-extrabold text-lg tracking-tight text-[#111827]">
                Metrik
              </span>
            </div>

            {/* Desktop Channel Dropdown */}
            {channels.length > 0 && (
              <div className="hidden md:flex items-center gap-2.5">
                <div className="h-5 w-px bg-[#E5E7EB]" />
                <div className="relative">
                  <select
                    value={selectedChannelId}
                    onChange={(e) => onSelectChannel(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-semibold text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] cursor-pointer hover:border-[#D1D5DB] focus:outline-hidden focus:ring-2 focus:ring-[#2563EB] transition-all"
                  >
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.title || ch.telegramUsername}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-[#667085]" />
                </div>
              </div>
            )}
          </div>

          {/* Right: Date Preset, Refresh, and Logout */}
          <div className="hidden md:flex items-center gap-3">
            {/* Range Presets (1D, 5D, 7D, 15D, 30D, 60D) */}
            <div className="flex items-center p-1 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA]">
              <span className="flex items-center gap-1 px-1.5 text-[#667085] text-xs">
                <CalendarIcon className="w-3.5 h-3.5" />
              </span>
              {(["1d", "5d", "7d", "15d", "30d", "60d"] as RangePreset[]).map((r) => {
                const isActive = selectedRange === r;
                const avail = rangeAvailability?.[r];
                const isAvailable = avail ? avail.isAvailable : true;
                const reason = avail?.reason;

                return (
                  <button
                    key={r}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => isAvailable && onSelectRange(r)}
                    title={!isAvailable ? reason : undefined}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${
                      isActive
                        ? "bg-white text-[#2563EB] shadow-xs ring-1 ring-[#E5E7EB] cursor-default"
                        : isAvailable
                        ? "text-[#667085] hover:text-[#111827] hover:bg-white/70 cursor-pointer"
                        : "opacity-40 text-[#667085] cursor-not-allowed"
                    }`}
                  >
                    {r.toUpperCase()}
                  </button>
                );
              })}
            </div>

            {/* Refresh Button */}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="p-2 rounded-xl border border-[#E5E7EB] bg-white text-[#667085] hover:bg-[#F7F8FA] hover:text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all cursor-pointer disabled:opacity-50"
                title="Refresh analytics data"
              >
                <RefreshCwIcon className={`w-4 h-4 ${isRefreshing ? "animate-spin text-[#2563EB]" : ""}`} />
              </button>
            )}

            {/* Logout Button */}
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-medium text-[#667085] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all cursor-pointer"
            >
              <LogOutIcon className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="p-2 rounded-xl border border-[#E5E7EB] bg-white text-[#667085] shadow-xs"
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <XIcon className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Panel */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-[#E5E7EB] space-y-4">
            {channels.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-[#667085] mb-1.5">
                  Select Channel
                </label>
                <select
                  value={selectedChannelId}
                  onChange={(e) => {
                    onSelectChannel(e.target.value);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-sm font-medium text-[#111827] shadow-xs"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title || ch.telegramUsername}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#667085] mb-1.5">Date Range</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {(["1d", "5d", "7d", "15d", "30d", "60d"] as RangePreset[]).map((r) => {
                  const isActive = selectedRange === r;
                  const avail = rangeAvailability?.[r];
                  const isAvailable = avail ? avail.isAvailable : true;
                  const reason = avail?.reason;

                  return (
                    <button
                      key={r}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => {
                        if (isAvailable) {
                          onSelectRange(r);
                          setMobileMenuOpen(false);
                        }
                      }}
                      title={!isAvailable ? reason : undefined}
                      className={`py-1.5 rounded-lg text-xs font-medium border text-center transition-all ${
                        isActive
                          ? "bg-[#2563EB] text-white border-transparent shadow-xs cursor-default"
                          : isAvailable
                          ? "border-[#E5E7EB] bg-white text-[#667085] hover:text-[#111827] cursor-pointer"
                          : "border-[#E5E7EB]/60 opacity-40 text-[#667085] cursor-not-allowed"
                      }`}
                    >
                      {r.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-between">
              {onRefresh && (
                <button
                  type="button"
                  onClick={() => {
                    onRefresh();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 text-xs text-[#667085] hover:text-[#111827]"
                >
                  <RefreshCwIcon className="w-4 h-4" />
                  <span>Refresh Data</span>
                </button>
              )}

              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1.5 text-xs text-rose-600 font-medium"
              >
                <LogOutIcon className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
