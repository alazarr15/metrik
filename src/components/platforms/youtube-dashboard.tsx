import React, { useEffect, useState } from "react";
import { MetricCard } from "../ui/metric-card";
import {
  UsersIcon,
  YouTubeIcon,
  BarChart3Icon,
  PlayIcon,
  ThumbsUpIcon,
  MessageSquareIcon,
  ExternalLinkIcon,
  AlertCircleIcon,
} from "../ui/icons";

interface YouTubeChannelSummary {
  id: string;
  handle: string;
  youtubeChannelId: string;
  title: string;
  subscriberCount: number | null;
  totalViewCount: string | null;
  videoCount: number | null;
  lastSyncedAt: string | null;
}

interface YouTubeDailyPoint {
  date: string;
  count: number;
  views: number;
}

interface YouTubeAnalyticsPayload {
  channel: YouTubeChannelSummary;
  period: {
    localFromDate: string;
    localToDate: string;
  };
  videosPublished: {
    total: number;
    breakdown?: {
      all: number;
      videos: number;
      shorts: number;
    };
    daily: YouTubeDailyPoint[];
  };
  periodTotals: {
    views: number | null;
    likes: number | null;
    comments: number | null;
  };
}

interface YouTubeVideoItem {
  id: string;
  youtubeVideoId: string;
  title: string;
  publishedAt: string;
  duration: string | null;
  isShort: boolean;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

type YouTubeContentType = "videos" | "shorts";

interface YouTubeDashboardProps {
  selectedRange: string;
  refreshTrigger?: number;
}

export function YouTubeDashboard({
  selectedRange,
  refreshTrigger = 0,
}: YouTubeDashboardProps) {
  const [channels, setChannels] = useState<YouTubeChannelSummary[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [contentType, setContentType] = useState<YouTubeContentType>("videos");
  const [analytics, setAnalytics] = useState<YouTubeAnalyticsPayload | null>(null);
  const [videos, setVideos] = useState<YouTubeVideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadChannels() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch("/api/youtube/channels");
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || "Failed to load YouTube channels.");
        }
        const data = await res.json();
        if (!ignore) {
          const list: YouTubeChannelSummary[] = data.channels || [];
          setChannels(list);
          if (list.length > 0 && !selectedChannelId) {
            setSelectedChannelId(list[0].id);
          } else if (list.length === 0) {
            setIsLoading(false);
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : "Error loading YouTube data.");
          setIsLoading(false);
        }
      }
    }

    loadChannels();
    return () => {
      ignore = true;
    };
  }, [refreshTrigger, selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId) return;
    let ignore = false;

    async function loadDetails() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [analyticsRes, videosRes] = await Promise.all([
          fetch(
            `/api/youtube/channels/${encodeURIComponent(selectedChannelId)}/analytics?range=${encodeURIComponent(
              selectedRange
            )}&type=${contentType}`
          ),
          fetch(
            `/api/youtube/channels/${encodeURIComponent(selectedChannelId)}/videos?range=${encodeURIComponent(
              selectedRange
            )}&type=${contentType}&limit=25`
          ),
        ]);

        if (!analyticsRes.ok || !videosRes.ok) {
          throw new Error("Failed to load YouTube analytics.");
        }

        const [analyticsData, videosData] = await Promise.all([
          analyticsRes.json(),
          videosRes.json(),
        ]);

        if (!ignore) {
          setAnalytics(analyticsData);
          setVideos(videosData.videos || []);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : "Error loading YouTube analytics.");
          setIsLoading(false);
        }
      }
    }

    loadDetails();
    return () => {
      ignore = true;
    };
  }, [selectedChannelId, selectedRange, contentType, refreshTrigger]);

  if (errorMessage) {
    return (
      <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
        <AlertCircleIcon className="w-4 h-4 shrink-0" />
        <span>{errorMessage}</span>
      </div>
    );
  }

  if (isLoading && !analytics) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-[#667085]">
        <span className="w-6 h-6 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Loading YouTube analytics...</span>
      </div>
    );
  }

  if (!isLoading && channels.length === 0) {
    return (
      <div className="py-16 text-center rounded-2xl border border-dashed border-[#E5E7EB] bg-white p-8 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="inline-flex p-3 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 mb-3">
          <YouTubeIcon className="w-7 h-7" />
        </div>
        <h2 className="text-base font-bold text-[#111827]">No YouTube Channel Synced Yet</h2>
        <p className="text-xs text-[#667085] mt-1 max-w-md mx-auto">
          Add <code className="font-mono text-[#111827]">YOUTUBE_API_KEY</code> to your environment and run the YouTube sync command.
        </p>
        <div className="mt-4 inline-block font-mono text-xs bg-[#F7F8FA] border border-[#E5E7EB] px-3 py-2 rounded-lg text-[#111827]">
          pnpm sync:youtube MogesMotors 2
        </div>
      </div>
    );
  }

  const dailyData = analytics?.videosPublished.daily || [];
  const maxViews = Math.max(...dailyData.map((d) => d.views), 1);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
            <YouTubeIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
              {analytics?.channel.title || "YouTube Channel"}
            </h1>
            {analytics?.channel.handle && (
              <p className="text-xs text-[#667085]">@{analytics.channel.handle}</p>
            )}
          </div>
        </div>

        {analytics && (
          <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
            {/* Videos / Shorts Filter */}
            <div className="flex items-center p-1 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA]">
              {(
                [
                  { key: "videos", label: "Videos", count: analytics.videosPublished.breakdown?.videos },
                  { key: "shorts", label: "Shorts", count: analytics.videosPublished.breakdown?.shorts },
                ] as const
              ).map((tab) => {
                const isActive = contentType === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setContentType(tab.key)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? "bg-white text-[#2563EB] shadow-xs ring-1 ring-[#E5E7EB]"
                        : "text-[#667085] hover:text-[#111827]"
                    }`}
                  >
                    {tab.label}
                    {tab.count !== undefined ? ` (${tab.count})` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* KPI Grid */}
      {analytics && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            title="Subscribers"
            value={
              analytics.channel.subscriberCount !== null
                ? analytics.channel.subscriberCount.toLocaleString()
                : "—"
            }
            icon={<UsersIcon className="w-4 h-4" />}
            variant="blue"
          />

          <MetricCard
            title={contentType === "shorts" ? "Shorts" : "Videos"}
            value={analytics.videosPublished.total}
            icon={<BarChart3Icon className="w-4 h-4" />}
            variant="blue"
          />

          <MetricCard
            title="Views"
            value={
              analytics.periodTotals.views !== null
                ? analytics.periodTotals.views.toLocaleString()
                : "—"
            }
            icon={<PlayIcon className="w-4 h-4" />}
            variant="blue"
          />

          <MetricCard
            title="Likes"
            value={
              analytics.periodTotals.likes !== null
                ? analytics.periodTotals.likes.toLocaleString()
                : "—"
            }
            icon={<ThumbsUpIcon className="w-4 h-4" />}
            variant="blue"
          />
        </section>
      )}

      {/* Daily Views Chart */}
      {analytics && (
        <section className="p-6 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="text-sm font-bold text-[#111827] tracking-tight">
                Views by Upload Day
              </h3>
              <p className="text-xs text-[#667085] mt-0.5">
                Total views on videos published each day.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]">
              <span className="text-[11px] font-medium">Videos:</span>
              <span className="text-xs font-bold tabular-nums">
                {analytics.videosPublished.total}
              </span>
            </div>
          </div>

          {dailyData.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#667085] italic">
              No daily data for this range.
            </div>
          ) : (
            <div className="h-44 flex items-end gap-1.5 sm:gap-2.5 pt-4 overflow-x-auto">
              {dailyData.map((day) => {
                const heightPct = day.views > 0 ? Math.max((day.views / maxViews) * 100, 8) : 3;
                return (
                  <div
                    key={day.date}
                    className="flex-1 min-w-[20px] flex flex-col items-center gap-2 group"
                  >
                    <div className="w-full relative flex items-end justify-center h-32">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full max-w-[32px] rounded-t-md transition-all duration-200 ${
                          day.views > 0
                            ? "bg-[#2563EB] group-hover:bg-[#3B82F6]"
                            : "bg-[#E5E7EB]"
                        }`}
                        title={`${day.date}: ${day.views.toLocaleString()} views (${day.count} videos)`}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-[#667085] tabular-nums">
                      {day.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Videos Table */}
      <section className="p-6 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="pb-4 border-b border-[#E5E7EB]">
          <h3 className="text-base font-bold text-[#111827] tracking-tight">
            Videos in Period
          </h3>
          <p className="text-xs text-[#667085] mt-0.5">
            Videos published in the selected {selectedRange.toUpperCase()} window.
          </p>
        </div>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-[11px] sm:text-xs sm:min-w-[600px]">
            <thead>
              <tr className="border-b border-[#E5E7EB] text-[#667085] font-semibold uppercase tracking-wider text-[10px] sm:text-[11px]">
                <th className="py-3 px-1.5 sm:px-3">
                  <span className="sm:hidden">Type</span>
                  <span className="hidden sm:inline">Video</span>
                </th>
                <th className="py-3 px-1.5 sm:px-3">Published</th>
                <th className="py-3 px-3 hidden sm:table-cell">Duration</th>
                <th className="py-3 px-1.5 sm:px-3">Views</th>
                <th className="py-3 px-1.5 sm:px-3">Likes</th>
                <th className="py-3 px-1.5 sm:px-3">Comments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]/70">
              {isLoading && videos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#667085]">
                    Loading videos...
                  </td>
                </tr>
              ) : videos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#667085] italic">
                    No videos published in this period.
                  </td>
                </tr>
              ) : (
                videos.map((v) => {
                  const videoUrl = v.isShort
                    ? `https://www.youtube.com/shorts/${v.youtubeVideoId}`
                    : `https://www.youtube.com/watch?v=${v.youtubeVideoId}`;

                  return (
                    <tr key={v.id} className="hover:bg-[#F7F8FA] transition-colors">
                      <td className="py-3 px-1.5 sm:py-3.5 sm:px-3 font-medium text-[#111827] sm:max-w-xs">
                        <div className="flex items-center gap-2 sm:max-w-xs">
                          <a
                            href={videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="sm:hidden inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]"
                            title={v.title}
                          >
                            {v.isShort ? "Short" : "Video"}
                          </a>
                          {v.isShort && (
                            <span className="hidden sm:inline-flex shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]">
                              Short
                            </span>
                          )}
                          <a
                            href={videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hidden sm:inline-flex items-center gap-1.5 text-[#2563EB] hover:underline truncate"
                            title={v.title}
                          >
                            <span className="truncate">{v.title}</span>
                            <ExternalLinkIcon className="w-3 h-3 shrink-0 opacity-70" />
                          </a>
                        </div>
                      </td>
                      <td className="py-3 px-1.5 sm:py-3.5 sm:px-3 text-[#667085] whitespace-nowrap">
                        {new Date(v.publishedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-3 text-[#667085] font-mono hidden sm:table-cell">
                        {v.duration || "—"}
                      </td>
                      <td className="py-3 px-1.5 sm:py-3.5 sm:px-3 font-bold text-[#111827] tabular-nums whitespace-nowrap">
                        {v.viewCount !== null ? v.viewCount.toLocaleString() : "—"}
                      </td>
                      <td className="py-3 px-1.5 sm:py-3.5 sm:px-3 text-[#111827] tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUpIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#667085]" />
                          {v.likeCount !== null ? v.likeCount.toLocaleString() : "—"}
                        </span>
                      </td>
                      <td className="py-3 px-1.5 sm:py-3.5 sm:px-3 text-[#111827] tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <MessageSquareIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#667085]" />
                          {v.commentCount !== null ? v.commentCount.toLocaleString() : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
