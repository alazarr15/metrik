import React from "react";
import { MetricCard } from "../ui/metric-card";
import { UsersIcon, YouTubeIcon, ClockIcon, BarChart3Icon, PlayIcon, ThumbsUpIcon, MessageSquareIcon } from "../ui/icons";

interface YouTubeDashboardProps {
  period?: { localFromDate: string; localToDate: string };
  selectedRange: string;
}

export function YouTubeDashboard({ period, selectedRange }: YouTubeDashboardProps) {
  const sampleDailyViews = [
    { date: "11-18", views: 2840 },
    { date: "11-19", views: 3410 },
    { date: "11-20", views: 4120 },
    { date: "11-21", views: 2950 },
    { date: "11-22", views: 4890 },
    { date: "11-23", views: 5120 },
    { date: "11-24", views: 3270 },
  ];

  const maxViews = Math.max(...sampleDailyViews.map((d) => d.views), 1);

  const sampleVideos = [
    {
      id: "yt-1",
      title: "Toyota Land Cruiser 300 Review & Test Drive",
      publishedAt: "2026-11-22",
      views: 48200,
      likes: 1420,
      comments: 184,
      duration: "14:28",
    },
    {
      id: "yt-2",
      title: "Top 5 Luxury SUVs in 2026: Features & Pricing",
      publishedAt: "2026-11-20",
      views: 32150,
      likes: 980,
      comments: 92,
      duration: "18:05",
    },
    {
      id: "yt-3",
      title: "Engine Maintenance Tips for Diesel Trucks",
      publishedAt: "2026-11-18",
      views: 19400,
      likes: 610,
      comments: 45,
      duration: "09:42",
    },
    {
      id: "yt-4",
      title: "Electric vs Hybrid in Daily Commutes",
      publishedAt: "2026-11-15",
      views: 26800,
      likes: 850,
      comments: 112,
      duration: "12:15",
    },
    {
      id: "yt-5",
      title: "Full Workshop Tour: Behind the Scenes",
      publishedAt: "2026-11-12",
      views: 16050,
      likes: 490,
      comments: 38,
      duration: "11:50",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
            <YouTubeIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              YouTube Analytics
            </h1>
          </div>
        </div>

        {period && (
          <div className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 px-3.5 py-1.5 rounded-full border border-zinc-200/80 dark:border-zinc-800 font-medium tabular-nums">
            {period.localFromDate} – {period.localToDate}
          </div>
        )}
      </div>

      {/* Metric Cards Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Subscribers"
          value="24,850"
          subtitle="Net gain: +320 subscribers."
          icon={<UsersIcon className="w-4 h-4" />}
          badgeText={`Last ${selectedRange.toUpperCase()}`}
          variant="rose"
        />

        <MetricCard
          title="Total Views"
          value="142,600"
          subtitle="Lifetime views on public videos."
          precision="EXACT"
          icon={<YouTubeIcon className="w-4 h-4" />}
          variant="rose"
        />

        <MetricCard
          title="Watch Time"
          value="4,210 hrs"
          subtitle="Estimated total hours watched."
          icon={<ClockIcon className="w-4 h-4" />}
          variant="amber"
        />

        <MetricCard
          title="Impressions CTR"
          value="7.4%"
          subtitle="Average click-through rate across videos."
          icon={<BarChart3Icon className="w-4 h-4" />}
          variant="emerald"
        />
      </section>

      {/* Charts Section */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Views Chart */}
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Daily Video Views
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                Daily public video views.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              26.6K views
            </span>
          </div>

          <div className="h-44 w-full pt-2">
            <svg viewBox="0 0 700 160" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="rose-bar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E11D48" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#FB7185" stopOpacity="0.75" />
                </linearGradient>
              </defs>

              {sampleDailyViews.map((item, idx) => {
                const totalBars = sampleDailyViews.length;
                const slotWidth = 700 / totalBars;
                const barWidth = Math.min(36, slotWidth * 0.55);
                const barHeight = Math.max(8, (item.views / maxViews) * 110);
                const x = idx * slotWidth + (slotWidth - barWidth) / 2;
                const y = 130 - barHeight;

                return (
                  <g key={item.date} className="group">
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx={4}
                      fill="url(#rose-bar)"
                      className="transition-all duration-200 group-hover:opacity-90"
                    />
                    <text
                      x={x + barWidth / 2}
                      y={y - 6}
                      textAnchor="middle"
                      className="text-[11px] font-bold fill-zinc-700 dark:fill-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {item.views.toLocaleString()}
                    </text>
                    <text
                      x={x + barWidth / 2}
                      y={150}
                      textAnchor="middle"
                      className="text-[11px] fill-zinc-400 font-medium"
                    >
                      {item.date}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Audience Retention & Growth Chart */}
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Subscriber Growth
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                Net subscribers gained per day.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              +320 net
            </span>
          </div>

          <div className="h-44 w-full pt-2">
            <svg viewBox="0 0 700 160" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="emerald-sub-bar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#34D399" stopOpacity="0.75" />
                </linearGradient>
              </defs>

              {[
                { date: "11-18", subs: 35 },
                { date: "11-19", subs: 42 },
                { date: "11-20", subs: 58 },
                { date: "11-21", subs: 39 },
                { date: "11-22", subs: 64 },
                { date: "11-23", subs: 52 },
                { date: "11-24", subs: 30 },
              ].map((item, idx) => {
                const totalBars = 7;
                const slotWidth = 700 / totalBars;
                const barWidth = Math.min(36, slotWidth * 0.55);
                const barHeight = Math.max(8, (item.subs / 64) * 110);
                const x = idx * slotWidth + (slotWidth - barWidth) / 2;
                const y = 130 - barHeight;

                return (
                  <g key={item.date} className="group">
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx={4}
                      fill="url(#emerald-sub-bar)"
                      className="transition-all duration-200 group-hover:opacity-90"
                    />
                    <text
                      x={x + barWidth / 2}
                      y={y - 6}
                      textAnchor="middle"
                      className="text-[11px] font-bold fill-zinc-700 dark:fill-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      +{item.subs}
                    </text>
                    <text
                      x={x + barWidth / 2}
                      y={150}
                      textAnchor="middle"
                      className="text-[11px] fill-zinc-400 font-medium"
                    >
                      {item.date}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </section>

      {/* Top Videos Table */}
      <section className="p-6 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Published Videos
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
              Recent channel videos with lifetime metrics.
            </p>
          </div>
          <span className="text-xs text-zinc-500">
            Total: <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{sampleVideos.length}</strong> videos
          </span>
        </div>

        <div className="overflow-x-auto my-2">
          <table className="w-full text-left text-xs min-w-[560px]">
            <thead>
              <tr className="border-b border-zinc-200/80 dark:border-zinc-800 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3 font-semibold">Video Title</th>
                <th className="py-3 px-3 font-semibold">Published</th>
                <th className="py-3 px-3 font-semibold">Views</th>
                <th className="py-3 px-3 font-semibold">Likes</th>
                <th className="py-3 px-3 font-semibold">Comments</th>
                <th className="py-3 px-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {sampleVideos.map((video) => (
                <tr key={video.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2 max-w-md">
                      <div className="p-1 rounded bg-rose-50 text-rose-600 shrink-0">
                        <PlayIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {video.title}
                      </span>
                      <span className="text-[10px] text-zinc-400 shrink-0">
                        ({video.duration})
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                    {video.publishedAt}
                  </td>
                  <td className="py-3.5 px-3 font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {video.views.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-3 text-zinc-700 dark:text-zinc-300 tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <ThumbsUpIcon className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{video.likes.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-zinc-700 dark:text-zinc-300 tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <MessageSquareIcon className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{video.comments.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded-lg border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 shadow-xs hover:bg-zinc-50 cursor-pointer"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Integration Footer Note (strictly 1 sentence) */}
        <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 text-center">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Ready for YouTube Data API v3 integration with your channel ID and API key.
          </p>
        </div>
      </section>
    </div>
  );
}
