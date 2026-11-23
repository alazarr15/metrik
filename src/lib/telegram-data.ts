/**
 * Pure helper functions for parsing and normalizing Telegram message and metric data.
 * Adheres strictly to AGENTS.md metric rules:
 * - Missing data is null, never 0.
 * - True zero (0) is preserved and distinguished from unavailable (null).
 * - Timestamps are stored and processed in UTC.
 * - Start time is inclusive, end time is exclusive.
 */

export interface RawTelegramMessage {
  id: number;
  date: number; // Unix timestamp in seconds
  views?: number | null;
  forwards?: number | null;
  post?: boolean;
}

export interface NormalizedTelegramPost {
  id: number;
  publishedAtUtc: string; // ISO 8601 UTC string
  publishedTimestamp: number; // Unix epoch milliseconds
  views: number | null; // null represents missing/unavailable
  forwards: number | null;
  isChannelPost: boolean;
}

export interface MetricSummary {
  totalPosts: number;
  postsWithMissingViews: number;
  totalLifetimeViewsOfPosts: number | null; // null if any post has missing views
}

/**
 * Normalizes a raw Telegram message into a standard structure.
 * Missing views is normalized to null, never 0.
 */
export function normalizeTelegramPost(raw: RawTelegramMessage): NormalizedTelegramPost {
  const publishedEpochMs = raw.date * 1000;
  const publishedDate = new Date(publishedEpochMs);

  return {
    id: raw.id,
    publishedAtUtc: publishedDate.toISOString(),
    publishedTimestamp: publishedEpochMs,
    views: typeof raw.views === "number" ? raw.views : null,
    forwards: typeof raw.forwards === "number" ? raw.forwards : null,
    isChannelPost: Boolean(raw.post),
  };
}

/**
 * Filters normalized posts by a UTC time range.
 * Range convention: start is inclusive, end is exclusive [start, end).
 */
export function filterPostsByDateRange(
  posts: readonly NormalizedTelegramPost[],
  startInclusiveUtc: Date,
  endExclusiveUtc: Date
): NormalizedTelegramPost[] {
  const startMs = startInclusiveUtc.getTime();
  const endMs = endExclusiveUtc.getTime();

  return posts.filter((post) => {
    return post.publishedTimestamp >= startMs && post.publishedTimestamp < endMs;
  });
}

/**
 * Computes metric summary for a collection of posts.
 * If any post has missing views (null), the total lifetime views is flagged as incomplete (null).
 */
export function summarizePostMetrics(posts: readonly NormalizedTelegramPost[]): MetricSummary {
  let missingViewsCount = 0;
  let lifetimeViewsSum = 0;

  for (const post of posts) {
    if (post.views === null) {
      missingViewsCount++;
    } else {
      lifetimeViewsSum += post.views;
    }
  }

  return {
    totalPosts: posts.length,
    postsWithMissingViews: missingViewsCount,
    totalLifetimeViewsOfPosts: missingViewsCount > 0 ? null : lifetimeViewsSum,
  };
}
