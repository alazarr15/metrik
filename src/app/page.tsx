"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Navigation,
  DateRangeFilter,
  ChannelItem,
  RangePreset,
  PlatformType,
} from "@/components/ui/navigation";
import { MetricCard } from "@/components/ui/metric-card";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { DailyPostsChart, DailyPostData } from "@/components/charts/daily-posts-chart";
import { PostsTable } from "@/components/posts/posts-table";
import { EyeIcon, BarChart3Icon, AlertCircleIcon, RefreshCwIcon, TelegramIcon } from "@/components/ui/icons";
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
  const [userRole, setUserRole] = useState<"admin" | "client" | null>(null);
  const lastLoggedPlatformRef = useRef<PlatformType | null>(null);

  // Restore last selected platform on mount (URL ?platform= takes precedence over localStorage)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("platform");
      const fromStorage = window.localStorage.getItem("metrik_platform");
      const candidate = fromUrl || fromStorage;
      if (candidate === "telegram" || candidate === "youtube" || candidate === "facebook") {
        queueMicrotask(() => setSelectedPlatform(candidate));
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  function handleSelectPlatform(platform: PlatformType) {
    setSelectedPlatform(platform);
    try {
      window.localStorage.setItem("metrik_platform", platform);
      const url = new URL(window.location.href);
      url.searchParams.set("platform", platform);
      window.history.replaceState({}, "", url.toString());
    } catch {
      // Ignore storage/history errors
    }
  }

  const [channelOverview, setChannelOverview] = useState<ChannelOverviewData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch session role on mount
  useEffect(() => {
    let ignore = false;
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore && data?.authenticated) {
          setUserRole(data.role === "client" ? "client" : "admin");
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  // Log dashboard open and platform switches (ignores 30s background auto-refresh)
  useEffect(() => {
    if (!userRole) return;
    if (lastLoggedPlatformRef.current === selectedPlatform) return;
    lastLoggedPlatformRef.current = selectedPlatform;

    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "view", platform: selectedPlatform }),
    }).catch(() => {});
  }, [userRole, selectedPlatform]);

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

  // Apply Telegram-only range fallback only when viewing Telegram,
  // so YouTube/Facebook 15D & 30D selections are never overwritten.
  useEffect(() => {
    if (selectedPlatform !== "telegram") return;
    const coverage = channelOverview?.coverage;
    if (!coverage?.rangeAvailability || !coverage.longestAvailablePreset) return;

    const currentAvail = coverage.rangeAvailability[selectedRange]?.isAvailable;
    if (!currentAvail && coverage.longestAvailablePreset !== selectedRange) {
      queueMicrotask(() => setSelectedRange(coverage.longestAvailablePreset!));
    }
  }, [selectedPlatform, channelOverview, selectedRange]);

  // Periodic background auto-refresh every 30 seconds
  useEffect(() => {
    if (!selectedChannelId) return;

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
  }, [selectedChannelId, selectedRange, router]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Force a full navigation so all client state and router cache are cleared on logout.
      window.location.replace("/login");
    }
  }

  function handleRefresh() {
    setIsRefreshing(true);
    setRefreshTick((prev) => prev + 1);
    if (selectedPlatform !== "telegram") {
      setTimeout(() => setIsRefreshing(false), 400);
      return;
    }
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

  if (isLoading && !analytics && !errorMessage) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgba(37,99,235,0.06),transparent)] flex flex-col font-sans text-[#111827]">
      <Navigation
        channels={channels}
        selectedChannelId={selectedChannelId}
        onSelectChannel={setSelectedChannelId}
        selectedPlatform={selectedPlatform}
        onSelectPlatform={handleSelectPlatform}
        userRole={userRole}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
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

        {/* Day Filter Bar (1D, 7D, 15D, 30D) & Refresh */}
        <div className="flex items-center justify-between gap-3">
          <DateRangeFilter
            selectedRange={selectedRange}
            onSelectRange={setSelectedRange}
            rangeAvailability={
              selectedPlatform === "telegram"
                ? channelOverview?.coverage?.rangeAvailability
                : undefined
            }
          />

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`p-2 rounded-xl border bg-white/90 backdrop-blur-sm transition-all duration-200 cursor-pointer disabled:opacity-60 shrink-0 ${
              isRefreshing
                ? "border-[#BFDBFE] text-[#2563EB] shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
                : "border-[#E5E7EB] text-[#667085] hover:bg-[#F7F8FA] hover:text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
            }`}
            title="Refresh analytics data"
            aria-label="Refresh analytics data"
          >
            <RefreshCwIcon className={`w-4 h-4 transition-transform ${isRefreshing ? "animate-spin text-[#2563EB]" : ""}`} />
          </button>
        </div>

        {/* TELEGRAM PLATFORM VIEW */}
        <div className={selectedPlatform === "telegram" ? "block space-y-8" : "hidden"}>
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
              <div className="pb-4 border-b border-[#E5E7EB] animate-fade-up">
                <div className="flex items-center justify-between gap-3">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827] truncate">
                    {currentChannel.title || currentChannel.telegramUsername}
                  </h1>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] shadow-xs shrink-0">
                    <TelegramIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>Telegram</span>
                  </span>
                </div>
              </div>
            )}

            {/* Overview Metric Cards Grid: Dynamic Posts and Views */}
            {analytics && (
              <section className="grid grid-cols-2 gap-3 sm:gap-4">
                <MetricCard
                  title="Posts"
                  value={analytics.postsPublished.total}
                  icon={<BarChart3Icon className="w-4 h-4" />}
                  variant="blue"
                  animationDelayMs={0}
                />

                <MetricCard
                  title="Views"
                  value={(analytics.periodViews || analytics.lifetimeViews).totalEstimate}
                  icon={<EyeIcon className="w-4 h-4" />}
                  variant="violet"
                  animationDelayMs={70}
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
            {currentChannel && analytics && (
              <section className="w-full">
                <PostsTable
                  channelId={currentChannel.id}
                  telegramUsername={currentChannel.telegramUsername}
                />
              </section>
            )}
        </div>

        {/* YOUTUBE PLATFORM VIEW */}
        <div className={selectedPlatform === "youtube" ? "block" : "hidden"}>
          <YouTubeDashboard selectedRange={selectedRange} refreshTrigger={refreshTick} />
        </div>

        {/* FACEBOOK PLATFORM VIEW */}
        <div className={selectedPlatform === "facebook" ? "block" : "hidden"}>
          <FacebookDashboard selectedRange={selectedRange} refreshTrigger={refreshTick} />
        </div>
      </main>
    </div>
  );
}
