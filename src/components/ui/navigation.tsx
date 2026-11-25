import React from "react";
import {
  LogoIcon,
  LogOutIcon,
  CalendarIcon,
  ChevronDownIcon,
  TelegramIcon,
  YouTubeIcon,
  FacebookIcon,
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

export type RangePreset = "1d" | "7d" | "15d" | "30d";

export const ACTIVE_RANGE_PRESETS: RangePreset[] = ["1d", "7d", "15d", "30d"];

export interface RangeAvailabilityItem {
  isAvailable: boolean;
  reason?: string;
}

interface DateRangeFilterProps {
  selectedRange: RangePreset;
  onSelectRange: (range: RangePreset) => void;
  rangeAvailability?: Partial<Record<string, RangeAvailabilityItem>>;
}

export function DateRangeFilter({
  selectedRange,
  onSelectRange,
  rangeAvailability,
}: DateRangeFilterProps) {
  return (
    <div className="inline-flex items-center p-1 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA]">
      <span className="flex items-center px-2 text-[#667085] text-xs">
        <CalendarIcon className="w-3.5 h-3.5" />
      </span>
      {ACTIVE_RANGE_PRESETS.map((r) => {
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
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
  );
}

interface NavigationProps {
  channels: ChannelItem[];
  selectedChannelId: string;
  onSelectChannel: (id: string) => void;
  selectedPlatform?: PlatformType;
  onSelectPlatform?: (platform: PlatformType) => void;
  onLogout: () => void;
}

export function Navigation({
  channels,
  selectedChannelId,
  onSelectChannel,
  selectedPlatform = "telegram",
  onSelectPlatform,
  onLogout,
}: NavigationProps) {
  const platforms: Array<{
    key: PlatformType;
    label: string;
    icon: React.ReactNode;
    activeClass: string;
  }> = [
    {
      key: "telegram",
      label: "Telegram",
      icon: <TelegramIcon className="w-4 h-4 shrink-0" />,
      activeClass: "bg-[#2563EB] text-white border-[#2563EB] shadow-xs",
    },
    {
      key: "youtube",
      label: "YouTube",
      icon: <YouTubeIcon className="w-4 h-4 shrink-0" />,
      activeClass: "bg-rose-600 text-white border-rose-600 shadow-xs",
    },
    {
      key: "facebook",
      label: "Facebook",
      icon: <FacebookIcon className="w-4 h-4 shrink-0" />,
      activeClass: "bg-blue-600 text-white border-blue-600 shadow-xs",
    },
  ];

  return (
    <header className="sticky top-0 z-30 w-full border-b border-[#E5E7EB] bg-white/95 backdrop-blur-md transition-colors shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Left: Brand & Channel Dropdown */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="p-1.5 rounded-xl bg-[#2563EB] text-white shadow-xs">
                <LogoIcon className="w-5 h-5" />
              </div>
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-[#111827] hidden xs:inline sm:inline">
                Metrik
              </span>
            </div>

            {selectedPlatform === "telegram" && channels.length > 0 && (
              <div className="hidden lg:flex items-center gap-3">
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

          {/* Right: Social Platform Switcher (Icons-only on mobile) + Refresh + Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {onSelectPlatform && (
              <nav aria-label="Platform switcher" className="flex items-center gap-1 sm:gap-1.5">
                {platforms.map((p) => {
                  const isActive = selectedPlatform === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => onSelectPlatform(p.key)}
                      aria-label={p.label}
                      title={p.label}
                      className={`flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        isActive
                          ? p.activeClass
                          : "bg-white text-[#667085] border-[#E5E7EB] hover:bg-[#F7F8FA] hover:text-[#111827] hover:border-[#D1D5DB]"
                      }`}
                    >
                      {p.icon}
                      <span className="hidden md:inline">{p.label}</span>
                    </button>
                  );
                })}
              </nav>
            )}

            <div className="h-5 w-px bg-[#E5E7EB] mx-0.5 hidden sm:block" />

            {/* Logout Button (icon-only on mobile, text on desktop) */}
            <button
              type="button"
              onClick={onLogout}
              aria-label="Logout"
              title="Logout"
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-medium text-[#667085] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all cursor-pointer"
            >
              <LogOutIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
