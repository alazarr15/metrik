"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogoIcon,
  LogOutIcon,
  RefreshCwIcon,
  ChevronLeftIcon,
  UsersIcon,
  ActivityIcon,
  ClockIcon,
  EyeIcon,
  TelegramIcon,
  YouTubeIcon,
  FacebookIcon,
  AlertCircleIcon,
} from "@/components/ui/icons";
import { MetricCard } from "@/components/ui/metric-card";

interface VisitEntry {
  id: string;
  role: string;
  event: string;
  platform: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface ActivityPayload {
  summary: {
    totalClientVisits: number;
    clientVisitsToday: number;
    totalAdminVisits: number;
    lastClientVisitAt: string | null;
  };
  visits: VisitEntry[];
}

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ActivityPage() {
  const router = useRouter();
  const [data, setData] = useState<ActivityPayload | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | "client" | "admin">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadActivity = useCallback(
    async (filter: "all" | "client" | "admin") => {
      setErrorMessage(null);
      try {
        const res = await fetch(`/api/activity?role=${filter}&limit=100`);
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (res.status === 403) {
          router.replace("/");
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load client visit activity.");
        }
        const json = (await res.json()) as ActivityPayload;
        setData(json);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Error loading activity.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [router]
  );

  useEffect(() => {
    let ignore = false;
    async function fetchInitial() {
      try {
        const res = await fetch(`/api/activity?role=${roleFilter}&limit=100`);
        if (ignore) return;
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (res.status === 403) {
          router.replace("/");
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load client visit activity.");
        }
        const json = (await res.json()) as ActivityPayload;
        if (!ignore) {
          setData(json);
          setErrorMessage(null);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : "Error loading activity.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }
    fetchInitial();
    return () => {
      ignore = true;
    };
  }, [roleFilter, router]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
    }
  }

  function handleRefresh() {
    setIsRefreshing(true);
    loadActivity(roleFilter);
  }

  function renderPlatformBadge(platform: string | null) {
    if (platform === "telegram") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
          <TelegramIcon className="w-3 h-3" />
          Telegram
        </span>
      );
    }
    if (platform === "youtube") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-600 border border-rose-200">
          <YouTubeIcon className="w-3 h-3" />
          YouTube
        </span>
      );
    }
    if (platform === "facebook") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
          <FacebookIcon className="w-3 h-3" />
          Facebook
        </span>
      );
    }
    return <span className="text-[#667085] text-xs">—</span>;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgba(37,99,235,0.06),transparent)] flex flex-col font-sans text-[#111827]">
      {/* Header */}
      <header className="sticky top-0 z-30 w-full border-b border-[#E5E7EB]/80 bg-white/80 backdrop-blur-xl shadow-[0_1px_3px_rgba(16,24,40,0.03)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-2">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2.5 shrink-0">
                <div className="p-1.5 rounded-xl bg-gradient-to-tr from-[#1D4ED8] to-[#3B82F6] text-white shadow-[0_2px_8px_rgba(37,99,235,0.35)]">
                  <LogoIcon className="w-5 h-5" />
                </div>
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-[#111827]">
                  Metrik
                </span>
              </Link>
              <div className="h-5 w-px bg-[#E5E7EB]" />
              <span className="text-xs sm:text-sm font-semibold text-[#667085]">
                Client Visits
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-semibold text-[#111827] hover:bg-[#F7F8FA] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all"
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Top Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center p-1 rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            {(
              [
                { key: "all", label: "All" },
                { key: "client", label: "Client Only" },
                { key: "admin", label: "Admin Only" },
              ] as const
            ).map((opt) => {
              const isActive = roleFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRoleFilter(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#EFF6FF] text-[#2563EB] ring-1 ring-[#BFDBFE] shadow-xs"
                      : "text-[#667085] hover:text-[#111827]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl border border-[#E5E7EB] bg-white text-[#667085] hover:bg-[#F7F8FA] hover:text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all cursor-pointer disabled:opacity-50"
            title="Refresh visits"
            aria-label="Refresh visits"
          >
            <RefreshCwIcon className={`w-4 h-4 ${isRefreshing ? "animate-spin text-[#2563EB]" : ""}`} />
          </button>
        </div>

        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircleIcon className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Summary KPI Cards */}
        {data && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              title="Client Visits"
              value={data.summary.totalClientVisits}
              icon={<UsersIcon className="w-4 h-4" />}
              variant="emerald"
              animationDelayMs={0}
            />
            <MetricCard
              title="Client Today"
              value={data.summary.clientVisitsToday}
              icon={<EyeIcon className="w-4 h-4" />}
              variant="blue"
              animationDelayMs={70}
            />
            <MetricCard
              title="Last Client"
              value={
                data.summary.lastClientVisitAt
                  ? formatRelativeTime(data.summary.lastClientVisitAt)
                  : "Never"
              }
              icon={<ClockIcon className="w-4 h-4" />}
              variant="violet"
              animationDelayMs={140}
            />
            <MetricCard
              title="Admin Visits"
              value={data.summary.totalAdminVisits}
              icon={<ActivityIcon className="w-4 h-4" />}
              variant="zinc"
              animationDelayMs={210}
            />
          </section>
        )}

        {/* Visits Table */}
        <section className="p-6 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="pb-4 border-b border-[#E5E7EB]">
            <h1 className="text-base font-bold text-[#111827] tracking-tight">
              Recent Dashboard Activity
            </h1>
            <p className="text-xs text-[#667085] mt-0.5">
              Logs every sign-in, dashboard open, and platform view (excludes background refreshes and cron pings).
            </p>
          </div>

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-xs sm:min-w-[600px]">
              <thead>
                <tr className="border-b border-[#E5E7EB] text-[#667085] font-semibold uppercase tracking-wider text-[10px] sm:text-[11px]">
                  <th className="py-3 px-2 sm:px-3">Who</th>
                  <th className="py-3 px-2 sm:px-3">Action</th>
                  <th className="py-3 px-2 sm:px-3">Platform</th>
                  <th className="py-3 px-2 sm:px-3 hidden sm:table-cell">Device</th>
                  <th className="py-3 px-2 sm:px-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]/70">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#667085]">
                      Loading activity...
                    </td>
                  </tr>
                ) : !data || data.visits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#667085] italic">
                      No visits recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.visits.map((v) => (
                    <tr key={v.id} className="even:bg-[#FAFAFA]/60 hover:bg-[#EFF6FF]/40 transition-colors">
                      <td className="py-3 px-2 sm:px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            v.role === "client"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]"
                          }`}
                        >
                          {v.role === "client" ? "Client" : "Admin"}
                        </span>
                      </td>
                      <td className="py-3 px-2 sm:px-3 font-medium text-[#111827] whitespace-nowrap">
                        {v.event === "login" ? "Signed in" : "Viewed"}
                      </td>
                      <td className="py-3 px-2 sm:px-3 whitespace-nowrap">
                        {renderPlatformBadge(v.platform)}
                      </td>
                      <td className="py-3 px-2 sm:px-3 text-[#667085] hidden sm:table-cell whitespace-nowrap">
                        {v.userAgent || "Unknown device"}
                      </td>
                      <td className="py-3 px-2 sm:px-3 text-right text-[#667085] whitespace-nowrap">
                        <div className="font-semibold text-[#111827]">
                          {formatRelativeTime(v.createdAt)}
                        </div>
                        <div className="text-[10px] text-[#667085]">
                          {new Date(v.createdAt).toLocaleString()}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
