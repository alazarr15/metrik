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
import { SyncStatusBadge, SyncStatusType } from "./badge";

export interface ChannelItem {
  id: string;
  telegramUsername: string;
  title: string | null;
  timezone: string;
  postsCount: number;
  latestSync?: {
    id: string;
    status: SyncStatusType;
    finishedAt: string | null;
    pagesFetched: number;
    postsFetched: number;
  } | null;
}

export type RangePreset = "7d" | "30d" | "90d";

interface NavigationProps {
  channels: ChannelItem[];
  selectedChannelId: string;
  onSelectChannel: (id: string) => void;
  selectedRange: RangePreset;
  onSelectRange: (range: RangePreset) => void;
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
  onLogout,
  onRefresh,
  isRefreshing,
}: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) || channels[0];

  return (
    <header className="sticky top-0 z-30 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Brand & Channel Selector */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
                <LogoIcon className="w-5 h-5" />
              </div>
              <span className="font-bold text-lg tracking-tight text-zinc-900 dark:text-zinc-100">
                Metrik
              </span>
            </div>

            {/* Desktop Channel Dropdown */}
            {channels.length > 0 && (
              <div className="hidden md:flex items-center gap-2">
                <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800" />
                <div className="relative">
                  <select
                    value={selectedChannelId}
                    onChange={(e) => onSelectChannel(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.title || ch.telegramUsername} (@{ch.telegramUsername})
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-zinc-400" />
                </div>

                {selectedChannel?.latestSync && (
                  <SyncStatusBadge status={selectedChannel.latestSync.status} />
                )}
              </div>
            )}
          </div>

          {/* Right: Date Preset, Refresh, and Logout */}
          <div className="hidden md:flex items-center gap-3">
            {/* Range Presets (7d, 30d, 90d) */}
            <div className="flex items-center p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/80">
              <span className="flex items-center gap-1 px-2 text-zinc-400 text-xs">
                <CalendarIcon className="w-3.5 h-3.5" />
              </span>
              {(["7d", "30d", "90d"] as RangePreset[]).map((r) => {
                const isActive = selectedRange === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onSelectRange(r)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
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
                className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh analytics data"
              >
                <RefreshCwIcon className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            )}

            {/* Logout Button */}
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 transition-colors cursor-pointer"
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
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <XIcon className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Panel */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
            {channels.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Select Channel
                </label>
                <select
                  value={selectedChannelId}
                  onChange={(e) => {
                    onSelectChannel(e.target.value);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-sm font-medium text-zinc-900 dark:text-zinc-100"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title || ch.telegramUsername} (@{ch.telegramUsername})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Date Range</label>
              <div className="grid grid-cols-3 gap-2">
                {(["7d", "30d", "90d"] as RangePreset[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      onSelectRange(r);
                      setMobileMenuOpen(false);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-medium border text-center transition-colors ${
                      selectedRange === r
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              {onRefresh && (
                <button
                  type="button"
                  onClick={() => {
                    onRefresh();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
                >
                  <RefreshCwIcon className="w-4 h-4" />
                  <span>Refresh Data</span>
                </button>
              )}

              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400"
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
