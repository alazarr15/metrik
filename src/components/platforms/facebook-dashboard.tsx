import React from "react";
import { MetricCard } from "../ui/metric-card";
import { UsersIcon, FacebookIcon, EyeIcon, MessageSquareIcon, ThumbsUpIcon, Share2Icon } from "../ui/icons";

interface FacebookDashboardProps {
  period?: { localFromDate: string; localToDate: string };
  selectedRange: string;
}

export function FacebookDashboard({ period, selectedRange }: FacebookDashboardProps) {
  const sampleDailyReach = [
    { date: "11-18", reach: 11200 },
    { date: "11-19", reach: 13400 },
    { date: "11-20", reach: 16800 },
    { date: "11-21", reach: 12100 },
    { date: "11-22", reach: 18500 },
    { date: "11-23", reach: 19800 },
    { date: "11-24", reach: 14200 },
  ];

  const maxReach = Math.max(...sampleDailyReach.map((d) => d.reach), 1);

  const samplePosts = [
    {
      id: "fb-1",
      text: "Excited to introduce our new showroom arrivals this week!",
      publishedAt: "2026-11-23",
      reach: 24500,
      reactions: 840,
      comments: 128,
      shares: 64,
    },
    {
      id: "fb-2",
      text: "Weekend special: Complete vehicle inspection and oil check guide.",
      publishedAt: "2026-11-21",
      reach: 19800,
      reactions: 620,
      comments: 74,
      shares: 42,
    },
    {
      id: "fb-3",
      text: "Customer delivery day at Moges Motor — congratulations to our client!",
      publishedAt: "2026-11-19",
      reach: 16400,
      reactions: 510,
      comments: 49,
      shares: 31,
    },
    {
      id: "fb-4",
      text: "Safety first: What to check before your next highway road trip.",
      publishedAt: "2026-11-17",
      reach: 14200,
      reactions: 430,
      comments: 38,
      shares: 25,
    },
    {
      id: "fb-5",
      text: "Behind the scenes with our certified mechanics and diagnostic tools.",
      publishedAt: "2026-11-14",
      reach: 14250,
      reactions: 390,
      comments: 31,
      shares: 19,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <FacebookIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Facebook Analytics
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
          title="Page Followers"
          value="18,420"
          subtitle="Net gain: +185 followers."
          icon={<UsersIcon className="w-4 h-4" />}
          badgeText={`Last ${selectedRange.toUpperCase()}`}
          variant="blue"
        />

        <MetricCard
          title="Post Reach"
          value="89,150"
          subtitle="Unique accounts reached by posts."
          precision="EXACT"
          icon={<FacebookIcon className="w-4 h-4" />}
          variant="blue"
        />

        <MetricCard
          title="Post Engagements"
          value="12,640"
          subtitle="Reactions, comments, and shares."
          icon={<MessageSquareIcon className="w-4 h-4" />}
          variant="indigo"
        />

        <MetricCard
          title="Page Visits"
          value="5,380"
          subtitle="Total page and profile views."
          icon={<EyeIcon className="w-4 h-4" />}
          variant="sky"
        />
      </section>

      {/* Charts Section */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Post Reach Chart */}
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Daily Post Reach
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                Unique users reached by page posts.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              89.1K reached
            </span>
          </div>

          <div className="h-44 w-full pt-2">
            <svg viewBox="0 0 700 160" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="blue-bar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#60A5FA" stopOpacity="0.75" />
                </linearGradient>
              </defs>

              {sampleDailyReach.map((item, idx) => {
                const totalBars = sampleDailyReach.length;
                const slotWidth = 700 / totalBars;
                const barWidth = Math.min(36, slotWidth * 0.55);
                const barHeight = Math.max(8, (item.reach / maxReach) * 110);
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
                      fill="url(#blue-bar)"
                      className="transition-all duration-200 group-hover:opacity-90"
                    />
                    <text
                      x={x + barWidth / 2}
                      y={y - 6}
                      textAnchor="middle"
                      className="text-[11px] font-bold fill-zinc-700 dark:fill-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {item.reach.toLocaleString()}
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

        {/* Engagement Distribution Chart */}
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Daily Engagements
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                Interactions across published posts.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
              12.6K total
            </span>
          </div>

          <div className="h-44 w-full pt-2">
            <svg viewBox="0 0 700 160" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="indigo-eng-bar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#818CF8" stopOpacity="0.75" />
                </linearGradient>
              </defs>

              {[
                { date: "11-18", eng: 1540 },
                { date: "11-19", eng: 1820 },
                { date: "11-20", eng: 2310 },
                { date: "11-21", eng: 1690 },
                { date: "11-22", eng: 2640 },
                { date: "11-23", eng: 2850 },
                { date: "11-24", eng: 1980 },
              ].map((item, idx) => {
                const totalBars = 7;
                const slotWidth = 700 / totalBars;
                const barWidth = Math.min(36, slotWidth * 0.55);
                const barHeight = Math.max(8, (item.eng / 2850) * 110);
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
                      fill="url(#indigo-eng-bar)"
                      className="transition-all duration-200 group-hover:opacity-90"
                    />
                    <text
                      x={x + barWidth / 2}
                      y={y - 6}
                      textAnchor="middle"
                      className="text-[11px] font-bold fill-zinc-700 dark:fill-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {item.eng.toLocaleString()}
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

      {/* Page Posts Table */}
      <section className="p-6 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Page Posts & Insights
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
              Recent page updates with reach and engagement metrics.
            </p>
          </div>
          <span className="text-xs text-zinc-500">
            Total: <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{samplePosts.length}</strong> posts
          </span>
        </div>

        <div className="overflow-x-auto my-2">
          <table className="w-full text-left text-xs min-w-[560px]">
            <thead>
              <tr className="border-b border-zinc-200/80 dark:border-zinc-800 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3 font-semibold max-w-xs">Post Preview</th>
                <th className="py-3 px-3 font-semibold">Published</th>
                <th className="py-3 px-3 font-semibold">Reach</th>
                <th className="py-3 px-3 font-semibold">Reactions</th>
                <th className="py-3 px-3 font-semibold">Comments</th>
                <th className="py-3 px-3 font-semibold">Shares</th>
                <th className="py-3 px-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {samplePosts.map((post) => (
                <tr key={post.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                  <td className="py-3.5 px-3 max-w-xs text-zinc-700 dark:text-zinc-300">
                    <div className="truncate max-w-xs font-sans text-xs font-medium" title={post.text}>
                      {post.text}
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                    {post.publishedAt}
                  </td>
                  <td className="py-3.5 px-3 font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {post.reach.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-3 text-zinc-700 dark:text-zinc-300 tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <ThumbsUpIcon className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{post.reactions.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-zinc-700 dark:text-zinc-300 tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <MessageSquareIcon className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{post.comments.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-zinc-700 dark:text-zinc-300 tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <Share2Icon className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{post.shares.toLocaleString()}</span>
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
            Ready for Facebook Graph API integration with your Page ID and access token.
          </p>
        </div>
      </section>
    </div>
  );
}
