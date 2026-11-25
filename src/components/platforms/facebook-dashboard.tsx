import React, { useEffect, useState } from "react";
import { MetricCard } from "../ui/metric-card";
import {
  FacebookIcon,
  UsersIcon,
  BarChart3Icon,
  EyeIcon,
  ThumbsUpIcon,
  MessageSquareIcon,
  Share2Icon,
  ExternalLinkIcon,
  AlertCircleIcon,
} from "../ui/icons";

interface FacebookPageSummary {
  id: string;
  facebookPageId: string;
  name: string;
  followersCount: number | null;
  fanCount: number | null;
  lastSyncedAt: string | null;
}

interface FacebookDailyPoint {
  date: string;
  count: number;
  engagement: number;
}

interface FacebookAnalyticsPayload {
  page: FacebookPageSummary;
  period: {
    localFromDate: string;
    localToDate: string;
  };
  itemsPublished: {
    total: number;
    breakdown?: {
      all: number;
      posts: number;
      reels: number;
    };
    daily: FacebookDailyPoint[];
  };
  periodTotals: {
    reach: number | null;
    views: number | null;
    reactions: number | null;
    comments: number | null;
    shares: number | null;
  };
}

interface FacebookItemEntry {
  id: string;
  facebookItemId: string;
  itemType: "POST" | "REEL";
  message: string | null;
  permalinkUrl: string | null;
  publishedAt: string;
  viewsCount: number | null;
  reachCount: number | null;
  reactionsCount: number | null;
  commentsCount: number | null;
  sharesCount: number | null;
}

type FacebookContentFilter = "posts" | "reels";

interface FacebookDashboardProps {
  selectedRange: string;
  refreshTrigger?: number;
}

export function FacebookDashboard({
  selectedRange,
  refreshTrigger = 0,
}: FacebookDashboardProps) {
  const [pages, setPages] = useState<FacebookPageSummary[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [contentType, setContentType] = useState<FacebookContentFilter>("posts");
  const [analytics, setAnalytics] = useState<FacebookAnalyticsPayload | null>(null);
  const [items, setItems] = useState<FacebookItemEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadPages() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch("/api/facebook/pages");
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || "Failed to load Facebook pages.");
        }
        const data = await res.json();
        if (!ignore) {
          const list: FacebookPageSummary[] = data.pages || [];
          setPages(list);
          if (list.length > 0 && !selectedPageId) {
            setSelectedPageId(list[0].id);
          } else if (list.length === 0) {
            setIsLoading(false);
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : "Error loading Facebook data.");
          setIsLoading(false);
        }
      }
    }

    loadPages();
    return () => {
      ignore = true;
    };
  }, [refreshTrigger, selectedPageId]);

  useEffect(() => {
    if (!selectedPageId) return;
    let ignore = false;

    async function loadDetails() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [analyticsRes, itemsRes] = await Promise.all([
          fetch(
            `/api/facebook/pages/${encodeURIComponent(selectedPageId)}/analytics?range=${encodeURIComponent(
              selectedRange
            )}&type=${contentType}`
          ),
          fetch(
            `/api/facebook/pages/${encodeURIComponent(selectedPageId)}/items?range=${encodeURIComponent(
              selectedRange
            )}&type=${contentType}&limit=25`
          ),
        ]);

        if (!analyticsRes.ok || !itemsRes.ok) {
          throw new Error("Failed to load Facebook analytics.");
        }

        const [analyticsData, itemsData] = await Promise.all([
          analyticsRes.json(),
          itemsRes.json(),
        ]);

        if (!ignore) {
          setAnalytics(analyticsData);
          setItems(itemsData.items || []);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : "Error loading Facebook analytics.");
          setIsLoading(false);
        }
      }
    }

    loadDetails();
    return () => {
      ignore = true;
    };
  }, [selectedPageId, selectedRange, contentType, refreshTrigger]);

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
        <span className="text-xs font-medium">Loading Facebook analytics...</span>
      </div>
    );
  }

  if (!isLoading && pages.length === 0) {
    return (
      <div className="py-16 text-center rounded-2xl border border-dashed border-[#E5E7EB] bg-white p-8 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="inline-flex p-3 rounded-2xl bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE] mb-3">
          <FacebookIcon className="w-7 h-7" />
        </div>
        <h2 className="text-base font-bold text-[#111827]">No Facebook Page Synced Yet</h2>
        <p className="text-xs text-[#667085] mt-1 max-w-md mx-auto">
          Ensure <code className="font-mono text-[#111827]">FACEBOOK_PAGE_ID</code> and{" "}
          <code className="font-mono text-[#111827]">FACEBOOK_ACCESS_TOKEN</code> are set, then run:
        </p>
        <div className="mt-4 inline-block font-mono text-xs bg-[#F7F8FA] border border-[#E5E7EB] px-3 py-2 rounded-lg text-[#111827]">
          pnpm sync:facebook
        </div>
      </div>
    );
  }

  const dailyData = analytics?.itemsPublished.daily || [];
  const maxEngagement = Math.max(...dailyData.map((d) => d.engagement), 1);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE] shrink-0">
            <FacebookIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
              {analytics?.page.name || "Facebook Page"}
            </h1>
          </div>
        </div>

        {analytics && (
          <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
            {/* Posts / Reels Filter */}
            <div className="flex items-center p-1 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA]">
              {(
                [
                  { key: "posts", label: "Posts", count: analytics.itemsPublished.breakdown?.posts },
                  { key: "reels", label: "Reels", count: analytics.itemsPublished.breakdown?.reels },
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
            title="Followers"
            value={
              analytics.page.followersCount !== null
                ? analytics.page.followersCount.toLocaleString()
                : "Unavailable"
            }
            subtitle="Current Facebook Page followers."
            icon={<UsersIcon className="w-4 h-4" />}
            variant="blue"
          />

          <MetricCard
            title={contentType === "reels" ? "Reels Published" : "Posts Published"}
            value={analytics.itemsPublished.total}
            subtitle={`Published in selected ${selectedRange.toUpperCase()} period.`}
            icon={<BarChart3Icon className="w-4 h-4" />}
            badgeText={`Last ${selectedRange.toUpperCase()}`}
            variant="blue"
          />

          <MetricCard
            title={contentType === "reels" ? "Reel Views" : "Views"}
            value={
              analytics.periodTotals.views !== null
                ? analytics.periodTotals.views.toLocaleString()
                : "Unavailable"
            }
            subtitle={
              contentType === "reels"
                ? `Plays on Reels in ${selectedRange.toUpperCase()}.`
                : `Views on items published in ${selectedRange.toUpperCase()}.`
            }
            icon={<EyeIcon className="w-4 h-4" />}
            variant="blue"
          />

          <MetricCard
            title="Reactions"
            value={
              analytics.periodTotals.reactions !== null
                ? analytics.periodTotals.reactions.toLocaleString()
                : "Unavailable"
            }
            subtitle={`Reactions in selected ${selectedRange.toUpperCase()} period.`}
            icon={<ThumbsUpIcon className="w-4 h-4" />}
            variant="blue"
          />
        </section>
      )}

      {/* Daily Engagement Chart */}
      {analytics && (
        <section className="p-6 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="text-sm font-bold text-[#111827] tracking-tight">
                Engagement by Publish Day
              </h3>
              <p className="text-xs text-[#667085] mt-0.5">
                Reactions, comments, and shares on items published each day.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]">
              <span className="text-[11px] font-medium">Items:</span>
              <span className="text-xs font-bold tabular-nums">
                {analytics.itemsPublished.total}
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
                const heightPct =
                  day.engagement > 0 ? Math.max((day.engagement / maxEngagement) * 100, 8) : 3;
                return (
                  <div
                    key={day.date}
                    className="flex-1 min-w-[20px] flex flex-col items-center gap-2 group"
                  >
                    <div className="w-full relative flex items-end justify-center h-32">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full max-w-[32px] rounded-t-md transition-all duration-200 ${
                          day.engagement > 0
                            ? "bg-[#2563EB] group-hover:bg-[#3B82F6]"
                            : "bg-[#E5E7EB]"
                        }`}
                        title={`${day.date}: ${day.engagement.toLocaleString()} engagements (${day.count} published)`}
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

      {/* Items Table */}
      <section className="p-6 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="pb-4 border-b border-[#E5E7EB]">
          <h3 className="text-base font-bold text-[#111827] tracking-tight">
            Posts & Reels in Period
          </h3>
          <p className="text-xs text-[#667085] mt-0.5">
            Items published in the selected {selectedRange.toUpperCase()} window.
          </p>
        </div>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-[11px] sm:text-xs sm:min-w-[640px]">
            <thead>
              <tr className="border-b border-[#E5E7EB] text-[#667085] font-semibold uppercase tracking-wider text-[10px] sm:text-[11px]">
                <th className="py-3 px-1.5 sm:px-3">Type</th>
                <th className="py-3 px-3 hidden sm:table-cell">Content</th>
                <th className="py-3 px-1.5 sm:px-3">Published</th>
                <th className="py-3 px-1.5 sm:px-3">Views</th>
                <th className="py-3 px-1.5 sm:px-3">Reactions</th>
                <th className="py-3 px-3 hidden sm:table-cell">Comments</th>
                <th className="py-3 px-3 hidden sm:table-cell">Shares</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]/70">
              {isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#667085]">
                    Loading Facebook items...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#667085] italic">
                    No posts or reels published in this period.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const primaryViews = item.viewsCount ?? item.reachCount;
                  const typeBadge = (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                        item.itemType === "REEL"
                          ? "bg-[#EFF6FF] text-[#2563EB] border-[#DBEAFE]"
                          : "bg-[#F7F8FA] text-[#667085] border-[#E5E7EB]"
                      }`}
                    >
                      {item.itemType === "REEL" ? "Reel" : "Post"}
                    </span>
                  );

                  return (
                    <tr key={item.id} className="hover:bg-[#F7F8FA] transition-colors">
                      <td className="py-3 px-1.5 sm:py-3.5 sm:px-3 whitespace-nowrap">
                        {item.permalinkUrl ? (
                          <a
                            href={item.permalinkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block sm:pointer-events-none"
                            title={item.message || "Open on Facebook"}
                          >
                            {typeBadge}
                          </a>
                        ) : (
                          typeBadge
                        )}
                      </td>
                      <td className="py-3.5 px-3 font-medium text-[#111827] max-w-xs hidden sm:table-cell">
                        {item.permalinkUrl ? (
                          <a
                            href={item.permalinkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[#2563EB] hover:underline truncate max-w-xs"
                            title={item.message || "Open on Facebook"}
                          >
                            <span className="truncate">
                              {item.message || "Media post"}
                            </span>
                            <ExternalLinkIcon className="w-3 h-3 shrink-0 opacity-70" />
                          </a>
                        ) : (
                          <span className="truncate block max-w-xs">
                            {item.message || "Media post"}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-1.5 sm:py-3.5 sm:px-3 text-[#667085] whitespace-nowrap">
                        {new Date(item.publishedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-1.5 sm:py-3.5 sm:px-3 font-bold text-[#111827] tabular-nums whitespace-nowrap">
                        {primaryViews !== null
                          ? primaryViews.toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-3 px-1.5 sm:py-3.5 sm:px-3 text-[#111827] tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUpIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#667085]" />
                          {item.reactionsCount !== null
                            ? item.reactionsCount.toLocaleString()
                            : "—"}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-[#111827] tabular-nums hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1">
                          <MessageSquareIcon className="w-3.5 h-3.5 text-[#667085]" />
                          {item.commentsCount !== null
                            ? item.commentsCount.toLocaleString()
                            : "—"}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-[#111827] tabular-nums hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1">
                          <Share2Icon className="w-3.5 h-3.5 text-[#667085]" />
                          {item.sharesCount !== null
                            ? item.sharesCount.toLocaleString()
                            : "—"}
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
