"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation, ChannelItem, RangePreset } from "@/components/ui/navigation";
import { MetricCard } from "@/components/ui/metric-card";
import { DailyPostsChart, DailyPostData } from "@/components/charts/daily-posts-chart";
import {
  ObservedGrowthChart,
  DailyObservedGrowthData,
  ViewsGrowthCoverageData,
} from "@/components/charts/observed-growth-chart";
import { PostsTable } from "@/components/posts/posts-table";
import {
  EyeIcon,
  BarChart3Icon,
  ClockIcon,
  AlertCircleIcon,
} from "@/components/ui/icons";

interface ChannelOverviewData {
  channel: {
    id: string;
    telegramUsername: string;
    title: string | null;
    timezone: string;
    createdAt: string;
    updatedAt: string;
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
  observedViewsGrowth: {
    value: number | null;
    isExact: boolean;
    label: string;
    description: string;
    coverage: ViewsGrowthCoverageData;
    daily: DailyObservedGrowthData[];
  };
  reach: {
    status: string;
    value: number | null;
    reason: string;
  };
}

export default function DashboardPage() {
  const router = useRouter();

  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [selectedRange, setSelectedRange] = useState<RangePreset>("30d");

  const [channelOverview, setChannelOverview] = useState<ChannelOverviewData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col font-sans">
      <Navigation
        channels={channels}
        selectedChannelId={selectedChannelId}
        onSelectChannel={setSelectedChannelId}
        selectedRange={selectedRange}
        onSelectRange={setSelectedRange}
        onLogout={handleLogout}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Error Banner */}
        {errorMessage && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
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

        {/* No channels configured */}
        {!isLoading && channels.length === 0 && (
          <div className="py-20 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-xs">
            <BarChart3Icon className="w-10 h-10 mx-auto text-zinc-400 mb-3" />
            <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
              No Channels Configured
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
              Run the Telegram channel synchronizer to ingest public channel data into your database:
            </p>
            <div className="mt-4 inline-block font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg text-zinc-800 dark:text-zinc-200">
              pnpm sync:telegram mogesmotor 2
            </div>
          </div>
        )}

        {/* Channel Details Header */}
        {currentChannel && (
          <div className="flex flex-wrap items-baseline justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {currentChannel.title || currentChannel.telegramUsername}
                </h1>
                <span className="text-sm text-zinc-500 dark:text-zinc-400 font-mono">
                  @{currentChannel.telegramUsername}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Timezone: <span className="font-medium text-zinc-700 dark:text-zinc-300">{currentChannel.timezone}</span>
                {channelOverview?.latestSync?.finishedAt && (
                  <span className="ml-3">
                    Last synced:{" "}
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {new Date(channelOverview.latestSync.finishedAt).toLocaleString()}
                    </span>
                  </span>
                )}
              </p>
            </div>

            {analytics && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-2xs">
                Period:{" "}
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {analytics.period.localFromDate}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {analytics.period.localToDate}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Overview Metric Cards Grid */}
        {analytics && channelOverview && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Metric 1: Posts Published */}
            <MetricCard
              title="Posts Published"
              value={analytics.postsPublished.total}
              subtitle={`Total lifetime active: ${channelOverview.summary.postsPublishedTotal}`}
              icon={<BarChart3Icon className="w-4 h-4" />}
              badgeText={`Last ${selectedRange}`}
            />

            {/* Metric 2: Lifetime Views */}
            <MetricCard
              title="Lifetime Views"
              value={analytics.lifetimeViews.totalEstimate.toLocaleString()}
              subtitle={`Exact sum: ${analytics.lifetimeViews.exactSum.toLocaleString()} • Estimated: ${analytics.lifetimeViews.roundedEstimate.toLocaleString()}`}
              precision={analytics.lifetimeViews.isExact ? "EXACT" : "ROUNDED"}
              icon={<EyeIcon className="w-4 h-4" />}
              breakdown={[
                { label: "Total active posts", count: analytics.lifetimeViews.breakdown.totalPosts },
                { label: "Exact counters", count: analytics.lifetimeViews.breakdown.exactPostsCount },
                { label: "Rounded estimates (1.2K+)", count: analytics.lifetimeViews.breakdown.roundedPostsCount },
                { label: "Unavailable counters", count: analytics.lifetimeViews.breakdown.unavailablePostsCount },
                { label: "Missing observations", count: analytics.lifetimeViews.breakdown.missingObservationPostsCount },
              ]}
            />

            {/* Metric 3: Observed Views Growth */}
            <MetricCard
              title="Observed Views Growth"
              value={
                analytics.observedViewsGrowth.value !== null
                  ? `+${analytics.observedViewsGrowth.value.toLocaleString()}`
                  : "Unavailable"
              }
              subtitle="Observed change between observations"
              precision={analytics.observedViewsGrowth.isExact ? "EXACT" : undefined}
              icon={<ClockIcon className="w-4 h-4" />}
              breakdown={[
                { label: "Eligible posts", count: analytics.observedViewsGrowth.coverage.eligiblePostsCount },
                { label: "Excluded (No baseline)", count: analytics.observedViewsGrowth.coverage.excludedNoBaseline },
                { label: "Excluded (No later sync)", count: analytics.observedViewsGrowth.coverage.excludedNoSubsequentObservation },
                { label: "Excluded (Rounded/Unavailable)", count: analytics.observedViewsGrowth.coverage.excludedRoundedOrUnavailable },
                { label: "Excluded (Anomaly decrease)", count: analytics.observedViewsGrowth.coverage.excludedNegativeDelta },
              ]}
            />

            {/* Metric 4: Reach */}
            <MetricCard
              title="Reach"
              value="Unavailable"
              precision="UNAVAILABLE"
              unavailableReason={channelOverview.summary.reach.reason}
            />
          </section>
        )}

        {/* Analytics Charts Section */}
        {analytics && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Posts Published Chart */}
            <DailyPostsChart
              data={analytics.postsPublished.daily}
              total={analytics.postsPublished.total}
            />

            {/* Observed Views Growth Chart */}
            <ObservedGrowthChart
              daily={analytics.observedViewsGrowth.daily}
              totalGrowth={analytics.observedViewsGrowth.value}
              isExact={analytics.observedViewsGrowth.isExact}
              label={analytics.observedViewsGrowth.label}
              description={analytics.observedViewsGrowth.description}
              coverage={analytics.observedViewsGrowth.coverage}
            />
          </section>
        )}

        {/* Channel Posts Table */}
        {currentChannel && (
          <section>
            <PostsTable
              channelId={currentChannel.id}
              telegramUsername={currentChannel.telegramUsername}
            />
          </section>
        )}
      </main>
    </div>
  );
}
