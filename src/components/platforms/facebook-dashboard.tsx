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
  PostIcon,
  ReelIcon,
  ClockIcon,
  TrendingUpIcon,
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
  const [sortOrder, setSortOrder] = useState<"latest" | "top">("latest");
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

    async function loadAnalytics() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const analyticsRes = await fetch(
          `/api/facebook/pages/${encodeURIComponent(selectedPageId)}/analytics?range=${encodeURIComponent(
            selectedRange
          )}&type=${contentType}`
        );

        if (!analyticsRes.ok) {
          throw new Error("Failed to load Facebook analytics.");
        }

        const analyticsData = await analyticsRes.json();

        if (!ignore) {
          setAnalytics(analyticsData);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : "Error loading Facebook analytics.");
          setIsLoading(false);
        }
      }
    }

    loadAnalytics();
    return () => {
      ignore = true;
    };
  }, [selectedPageId, selectedRange, contentType, refreshTrigger]);

  useEffect(() => {
    if (!selectedPageId) return;
    let ignore = false;

    async function loadItems() {
      try {
        const itemsRes = await fetch(
          `/api/facebook/pages/${encodeURIComponent(selectedPageId)}/items?range=${encodeURIComponent(
            selectedRange
          )}&type=${contentType}&sort=${sortOrder}&limit=25`
        );
        if (!itemsRes.ok) return;
        const itemsData = await itemsRes.json();
        if (!ignore) {
          setItems(itemsData.items || []);
        }
      } catch {
        // Ignore transient table sort fetch errors
      }
    }

    loadItems();
    return () => {
      ignore = true;
    };
  }, [selectedPageId, selectedRange, contentType, sortOrder, refreshTrigger]);

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
      <div className="space-y-8 animate-fade-up">
        <div className="flex items-center justify-between pb-4 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <div className="skeleton w-10 h-10 rounded-xl" />
            <div className="skeleton h-6 w-44 rounded-lg" />
          </div>
          <div className="skeleton h-9 w-36 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-4 sm:p-5 rounded-2xl border border-[#E5E7EB] bg-white">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <div className="skeleton h-3 w-16 rounded" />
                  <div className="skeleton h-7 w-20 rounded-lg" />
                </div>
                <div className="skeleton w-10 h-10 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
        <div className="p-6 rounded-2xl border border-[#E5E7EB] bg-white">
          <div className="skeleton h-4 w-40 rounded mb-5" />
          <div className="flex items-end gap-2 h-36">
            {[45, 70, 35, 85, 55, 90, 40, 65].map((h, i) => (
              <div key={i} className="skeleton flex-1 rounded-t-md" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && pages.length === 0) {
    return (
      <div className="py-16 text-center rounded-2xl border border-dashed border-[#E5E7EB] bg-white p-8 shadow-[0_1px_2px_rgba(16,24,40,0.04)] animate-fade-up">
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
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2.5 rounded-xl bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE] shrink-0">
            <FacebookIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827] truncate">
                {analytics?.page.name || "Facebook Page"}
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 shadow-xs shrink-0">
                <FacebookIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Facebook</span>
              </span>
            </div>
          </div>
        </div>

        {analytics && (
          <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
            {/* Posts / Reels Filter */}
            <div className="inline-flex items-center gap-1 p-1 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
              {(
                [
                  { key: "posts", label: "Posts", icon: <PostIcon className="w-3.5 h-3.5 shrink-0" /> },
                  { key: "reels", label: "Reels", icon: <ReelIcon className="w-3.5 h-3.5 shrink-0" /> },
                ] as const
              ).map((tab) => {
                const isActive = contentType === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setContentType(tab.key)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.97] cursor-pointer ${
                      isActive
                        ? "bg-[#EFF6FF] text-[#2563EB] ring-1 ring-[#BFDBFE] shadow-xs"
                        : "text-[#667085] hover:text-[#111827] hover:bg-[#F7F8FA]"
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
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
                ? analytics.page.followersCount
                : "—"
            }
            icon={<UsersIcon className="w-4 h-4" />}
            variant="blue"
            animationDelayMs={0}
          />

          <MetricCard
            title={contentType === "reels" ? "Reels" : "Posts"}
            value={analytics.itemsPublished.total}
            icon={<BarChart3Icon className="w-4 h-4" />}
            variant="indigo"
            animationDelayMs={70}
          />

          <MetricCard
            title="Views"
            value={
              analytics.periodTotals.views !== null
                ? analytics.periodTotals.views
                : "—"
            }
            icon={<EyeIcon className="w-4 h-4" />}
            variant="sky"
            animationDelayMs={140}
          />

          <MetricCard
            title="Reactions"
            value={
              analytics.periodTotals.reactions !== null
                ? analytics.periodTotals.reactions
                : "—"
            }
            icon={<ThumbsUpIcon className="w-4 h-4" />}
            variant="emerald"
            animationDelayMs={210}
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
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E5E7EB]">
          <div>
            <h3 className="text-base font-bold text-[#111827] tracking-tight">
              Posts & Reels in Period
            </h3>
            <p className="text-xs text-[#667085] mt-0.5">
              Items published in the selected {selectedRange.toUpperCase()} window.
            </p>
          </div>

          <div className="inline-flex items-center p-1 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA]">
            {(
              [
                { key: "latest", label: "Latest", icon: <ClockIcon className="w-3 h-3 shrink-0" /> },
                { key: "top", label: "Top Views", icon: <TrendingUpIcon className="w-3 h-3 shrink-0" /> },
              ] as const
            ).map((opt) => {
              const isActive = sortOrder === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortOrder(opt.key)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? "bg-white text-[#2563EB] shadow-xs ring-1 ring-[#E5E7EB]"
                      : "text-[#667085] hover:text-[#111827]"
                  }`}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
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
                    <tr key={item.id} className="even:bg-[#FAFAFA]/60 hover:bg-[#EFF6FF]/40 transition-colors">
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
