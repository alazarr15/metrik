"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation, ChannelItem, RangePreset, PlatformType } from "@/components/ui/navigation";
import { MetricCard } from "@/components/ui/metric-card";
import { DailyPostsChart, DailyPostData } from "@/components/charts/daily-posts-chart";
import { PostsTable } from "@/components/posts/posts-table";
import {
  EyeIcon,
  BarChart3Icon,
  AlertCircleIcon,
  TelegramIcon,
  YouTubeIcon,
  FacebookIcon,
} from "@/components/ui/icons";
import { YouTubeDashboard } from "@/components/platforms/youtube-dashboard";
import { FacebookDashboard } from "@/components/platforms/facebook-dashboard";

interface ChannelOverviewData {
  channel: {
    id: string;
    telegramUsername: string;
    title: string | null;
    timezone: string;
    createdAt: string;
    updatedAt: string;
    bootstrapStatus?: "PENDING" | "RUNNING" | "COMPLETED" | "INCOMPLETE" | "FAILED";
    lastSyncedAt?: string | null;
    nextPollAt?: string | null;
  };
  summary: {
    postsPublishedTotal: number;
    postsDeletedTotal: number;
    reach: {
      status: string;
      value: number | null;
      reason: string;
    };
    oldestPostPublishedAt: string | null;
    newestPostPublishedAt: string | null;
  };
  latestSync: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    pagesFetched: number;
    postsFetched: number;
    errorMessage?: string | null;
  } | null;
  tracking?: {
    status: "ACTIVE" | "STOPPED";
    bootstrapStatus: "PENDING" | "RUNNING" | "COMPLETED" | "INCOMPLETE" | "FAILED";
    isWorkerActive: boolean;
    pollIntervalMinutes: number;
    lastSyncedAt: string | null;
    nextPollAt: string | null;
    workerLastHeartbeatAt: string | null;
  };
  coverage?: {
    channelId: string;
    telegramUsername: string;
    timezone: string;
    asOfDateUtc: string;
    todayLocalDate: string;
    postCoverage: {
      totalPosts: number;
      oldestPostPublishedAt: string | null;
      newestPostPublishedAt: string | null;
      oldestPostLocalDate: string | null;
      newestPostLocalDate: string | null;
      postHistoryDays: number;
    };
    observationCoverage: {
      totalObservations: number;
      oldestObservationAt: string | null;
      newestObservationAt: string | null;
      trackingStartDate: string | null;
      latestObservationDate: string | null;
      observedCalendarDays: string[];
      observedDaysCount: number;
      hasMetricObservations: boolean;
    };
    historicalCoverageDays: number;
    rangeAvailability: Record<
      RangePreset,
      {
        preset: RangePreset;
        days: number;
        isAvailable: boolean;
        reason?: string;
        requiredDays: number;
        localFromDate: string;
        localToDate: string;
      }
    >;
    longestAvailablePreset: RangePreset | null;
  } | null;
}

interface AnalyticsPayload {
  period: {
    from: string;
    to: string;
    timezone: string;
    localFromDate: string;
    localToDate: string;
  };
  postsPublished: {
    total: number;
    daily: DailyPostData[];
  };
  lifetimeViews: {
    totalEstimate: number;
    exactSum: number;
    roundedEstimate: number;
    isExact: boolean;
    breakdown: {
      totalPosts: number;
      exactPostsCount: number;
      roundedPostsCount: number;
      unavailablePostsCount: number;
      missingObservationPostsCount: number;
    };
  };
  periodViews?: {
    totalEstimate: number;
    exactSum: number;
    roundedEstimate: number;
    isExact: boolean;
    breakdown: {
      totalPosts: number;
      exactPostsCount: number;
      roundedPostsCount: number;
      unavailablePostsCount: number;
      missingObservationPostsCount: number;
    };
  };
  observedViewsGrowth?: {
    value: number | null;
    isExact?: boolean;
    label?: string;
    description?: string;
  };
  reach?: {
    status: string;
    value: number | null;
    reason: string;
  };
}

export default function DashboardPage() {
  const router = useRouter();

  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [selectedRange, setSelectedRange] = useState<RangePreset>("7d");
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>("telegram");

  const [channelOverview, setChannelOverview] = useState<ChannelOverviewData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // Initial fetch for channels
  useEffect(() => {
    let ignore = false;
    async function loadChannels() {
      try {
        const res = await fetch("/api/channels");
        if (ignore) return;
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || "Failed to load channel list.");
        }
        const data = await res.json();
        if (ignore) return;
        const channelList: ChannelItem[] = data.channels || [];
        setChannels(channelList);

        if (channelList.length > 0) {
          setSelectedChannelId((prev) => prev || channelList[0].id);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : "Error connecting to API");
        }
      }
    }

    loadChannels();
    return () => {
      ignore = true;
    };
  }, [router]);

  // Fetch channel details & period analytics when selected channel or range changes
  useEffect(() => {
    if (!selectedChannelId) return;

    let ignore = false;
    async function loadData() {
      try {
        const [overviewRes, analyticsRes] = await Promise.all([
          fetch(`/api/channels/${encodeURIComponent(selectedChannelId)}`),
          fetch(
            `/api/channels/${encodeURIComponent(selectedChannelId)}/analytics?range=${selectedRange}`
          ),
        ]);

        if (ignore) return;

        if (overviewRes.status === 401 || analyticsRes.status === 401) {
          router.replace("/login");
          return;
        }

        if (!overviewRes.ok) {
          const err = await overviewRes.json().catch(() => ({}));
          throw new Error(err.error?.message || "Failed to load channel overview.");
        }
        if (!analyticsRes.ok) {
          const err = await analyticsRes.json().catch(() => ({}));
          throw new Error(err.error?.message || "Failed to load channel analytics.");
        }

        const overviewData = await overviewRes.json();
        const analyticsData = await analyticsRes.json();

        if (!ignore) {
          setChannelOverview(overviewData);
          setAnalytics(analyticsData);
          setIsLoading(false);
          setIsRefreshing(false);

          // Graceful fallback: If current selectedRange is unavailable, select the longest available valid range
          if (overviewData.coverage?.rangeAvailability) {
            const currentAvail = overviewData.coverage.rangeAvailability[selectedRange]?.isAvailable;
            if (!currentAvail && overviewData.coverage.longestAvailablePreset) {
              const fallback = overviewData.coverage.longestAvailablePreset;
              if (fallback !== selectedRange) {
                setSelectedRange(fallback);
              }
            }
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(
            err instanceof Error ? err.message : "Error fetching analytics data."
          );
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, [selectedChannelId, selectedRange, router]);

  // Periodic background auto-refresh every 30 seconds
  useEffect(() => {
    if (!selectedChannelId || !autoRefreshEnabled) return;

    const intervalId = setInterval(async () => {
      try {
        const [overviewRes, analyticsRes] = await Promise.all([
          fetch(`/api/channels/${encodeURIComponent(selectedChannelId)}`),
          fetch(
            `/api/channels/${encodeURIComponent(selectedChannelId)}/analytics?range=${selectedRange}`
          ),
        ]);

        if (overviewRes.status === 401 || analyticsRes.status === 401) {
          router.replace("/login");
          return;
        }

        if (overviewRes.ok && analyticsRes.ok) {
          const overviewData = await overviewRes.json();
          const analyticsData = await analyticsRes.json();
          setChannelOverview(overviewData);
          setAnalytics(analyticsData);
        }
      } catch {
        // Silently ignore background polling errors to avoid interrupting user
      }
    }, 30_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [selectedChannelId, selectedRange, autoRefreshEnabled, router]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
    }
  }

  function handleRefresh() {
    setIsRefreshing(true);
    // Trigger reload by re-fetching
    if (selectedChannelId) {
      setIsLoading(true);
      Promise.all([
        fetch(`/api/channels/${encodeURIComponent(selectedChannelId)}`).then((r) => r.json()),
        fetch(
          `/api/channels/${encodeURIComponent(selectedChannelId)}/analytics?range=${selectedRange}`
        ).then((r) => r.json()),
      ])
        .then(([ov, an]) => {
          setChannelOverview(ov);
          setAnalytics(an);
        })
        .catch(() => {})
        .finally(() => {
          setIsLoading(false);
          setIsRefreshing(false);
        });
    }
  }

  const currentChannel = channels.find((c) => c.id === selectedChannelId) || channels[0];

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-[#111827]">
      <Navigation
        channels={channels}
        selectedChannelId={selectedChannelId}
        onSelectChannel={setSelectedChannelId}
        selectedRange={selectedRange}
        onSelectRange={setSelectedRange}
        rangeAvailability={channelOverview?.coverage?.rangeAvailability}
        onLogout={handleLogout}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Error Banner */}
        {errorMessage && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircleIcon className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="underline font-semibold hover:opacity-80 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Platform Selector Tabs */}
        <div className="grid grid-cols-3 sm:flex items-center gap-2 pb-2">
          <button
            type="button"
            onClick={() => setSelectedPlatform("telegram")}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              selectedPlatform === "telegram"
                ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs"
                : "bg-white text-[#667085] border-[#E5E7EB] hover:bg-[#F7F8FA] hover:text-[#111827] hover:border-[#D1D5DB] shadow-2xs"
            }`}
          >
            <TelegramIcon className="w-4 h-4" />
            <span>Telegram</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPlatform("youtube")}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              selectedPlatform === "youtube"
                ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                : "bg-white text-[#667085] border-[#E5E7EB] hover:bg-[#F7F8FA] hover:text-[#111827] hover:border-[#D1D5DB] shadow-2xs"
            }`}
          >
            <YouTubeIcon className="w-4 h-4" />
            <span>YouTube</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPlatform("facebook")}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              selectedPlatform === "facebook"
                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                : "bg-white text-[#667085] border-[#E5E7EB] hover:bg-[#F7F8FA] hover:text-[#111827] hover:border-[#D1D5DB] shadow-2xs"
            }`}
          >
            <FacebookIcon className="w-4 h-4" />
            <span>Facebook</span>
          </button>
        </div>

        {/* TELEGRAM PLATFORM VIEW */}
        {selectedPlatform === "telegram" && (
          <div className="space-y-8">
            {/* No channels configured */}
            {!isLoading && channels.length === 0 && (
              <div className="py-20 text-center rounded-2xl border border-dashed border-[#E5E7EB] bg-white p-8 shadow-xs">
                <BarChart3Icon className="w-10 h-10 mx-auto text-[#667085] mb-3" />
                <h2 className="text-base font-semibold text-[#111827]">
                  No Channels Configured
                </h2>
                <p className="text-xs text-[#667085] mt-1 max-w-md mx-auto">
                  Run the Telegram channel synchronizer to ingest public channel data into your database:
                </p>
                <div className="mt-4 inline-block font-mono text-xs bg-[#F7F8FA] border border-[#E5E7EB] px-3 py-2 rounded-lg text-[#111827]">
                  pnpm sync:telegram mogesmotor 2
                </div>
              </div>
            )}

            {/* Clean Channel Details Header */}
            {currentChannel && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E7EB]">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
                    {currentChannel.title || currentChannel.telegramUsername}
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAutoRefreshEnabled((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                      autoRefreshEnabled
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-2xs hover:bg-emerald-100/70"
                        : "bg-[#F7F8FA] text-[#667085] border-[#E5E7EB] hover:bg-zinc-100"
                    }`}
                    title="Toggle 30-second background polling auto-refresh"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        autoRefreshEnabled ? "bg-emerald-500 animate-pulse" : "bg-[#667085]"
                      }`}
                    />
                    Auto-refresh: {autoRefreshEnabled ? "30s" : "off"}
                  </button>

                  {analytics && (
                    <div className="text-xs text-[#667085] bg-[#F7F8FA] px-3.5 py-1.5 rounded-full border border-[#E5E7EB] font-medium tabular-nums">
                      {analytics.period.localFromDate} – {analytics.period.localToDate}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Overview Metric Cards Grid: Dynamic Posts Published and Views */}
            {analytics && (
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Metric 1: Posts Published (dynamically changes with range) */}
                <MetricCard
                  title="Posts Published"
                  value={analytics.postsPublished.total}
                  subtitle={`Published in selected ${selectedRange.toUpperCase()} period.`}
                  icon={<BarChart3Icon className="w-4 h-4" />}
                  badgeText={`Last ${selectedRange.toUpperCase()}`}
                  variant="blue"
                />

                {/* Metric 2: Views (dynamically changes with range) */}
                <MetricCard
                  title="Views"
                  value={(analytics.periodViews || analytics.lifetimeViews).totalEstimate.toLocaleString()}
                  subtitle={`Views on posts published in this ${selectedRange.toUpperCase()} period.`}
                  precision={(analytics.periodViews || analytics.lifetimeViews).isExact ? "EXACT" : "ROUNDED"}
                  icon={<EyeIcon className="w-4 h-4" />}
                  variant="blue"
                  breakdown={[
                    { label: "Posts in period", count: (analytics.periodViews || analytics.lifetimeViews).breakdown.totalPosts },
                    { label: "Exact counters", count: (analytics.periodViews || analytics.lifetimeViews).breakdown.exactPostsCount },
                    { label: "Rounded estimates (1.2K+)", count: (analytics.periodViews || analytics.lifetimeViews).breakdown.roundedPostsCount },
                    { label: "Unavailable counters", count: (analytics.periodViews || analytics.lifetimeViews).breakdown.unavailablePostsCount },
                    { label: "Missing observations", count: (analytics.periodViews || analytics.lifetimeViews).breakdown.missingObservationPostsCount },
                  ]}
                />
              </section>
            )}

            {/* Daily Posts Published Chart */}
            {analytics && (
              <section className="w-full">
                <DailyPostsChart
                  data={analytics.postsPublished.daily}
                  total={analytics.postsPublished.total}
                />
              </section>
            )}

            {/* Channel Posts Table */}
            {currentChannel && (
              <section className="w-full">
                <PostsTable
                  channelId={currentChannel.id}
                  telegramUsername={currentChannel.telegramUsername}
                />
              </section>
            )}
          </div>
        )}

        {/* YOUTUBE PLATFORM VIEW */}
        {selectedPlatform === "youtube" && (
          <YouTubeDashboard
            period={analytics?.period}
            selectedRange={selectedRange}
          />
        )}

        {/* FACEBOOK PLATFORM VIEW */}
        {selectedPlatform === "facebook" && (
          <FacebookDashboard
            period={analytics?.period}
            selectedRange={selectedRange}
          />
        )}
      </main>
    </div>
  );
}
