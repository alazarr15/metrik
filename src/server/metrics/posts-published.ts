import { formatLocalDate, getCalendarDaysBetween } from "./timezone";

export interface PostPublicationRecord {
  id: string;
  publishedAt: Date;
  deletedAt: Date | null;
}

export interface DailyPostCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface PostsPublishedResult {
  total: number;
  daily: DailyPostCount[];
}

/**
 * Calculates total and daily posts published within a [fromUtc, toUtc) interval,
 * grouped by the channel's local calendar dates.
 * Soft-deleted posts are excluded.
 */
export function calculatePostsPublished(
  posts: PostPublicationRecord[],
  fromUtc: Date,
  toUtc: Date,
  timezone: string,
  localFromDate: string,
  localToDate: string
): PostsPublishedResult {
  const fromMs = fromUtc.getTime();
  const toMs = toUtc.getTime();

  // Filter non-deleted posts in [fromUtc, toUtc)
  const activePosts = posts.filter((p) => {
    if (p.deletedAt !== null) return false;
    const pubMs = p.publishedAt.getTime();
    return pubMs >= fromMs && pubMs < toMs;
  });

  // Tally counts by local calendar date
  const countsByDate = new Map<string, number>();
  for (const post of activePosts) {
    const localDate = formatLocalDate(post.publishedAt, timezone);
    countsByDate.set(localDate, (countsByDate.get(localDate) ?? 0) + 1);
  }

  // Generate zero-filled array for all days between localFromDate and localToDate
  const allDays = getCalendarDaysBetween(localFromDate, localToDate);
  const daily: DailyPostCount[] = allDays.map((date) => ({
    date,
    count: countsByDate.get(date) ?? 0,
  }));

  const total = activePosts.length;

  return {
    total,
    daily,
  };
}
