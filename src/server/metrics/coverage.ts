import { type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/client.ts";
import {
  formatLocalDate,
  resolvePresetRange,
  DEFAULT_CHANNEL_TIMEZONE,
  PRESET_DAYS_MAP,
  type PresetKey,
} from "./timezone.ts";

export interface PostCoverageSummary {
  totalPosts: number;
  oldestPostPublishedAt: Date | null;
  newestPostPublishedAt: Date | null;
  oldestPostLocalDate: string | null;
  newestPostLocalDate: string | null;
  postHistoryDays: number;
}

export interface ObservationCoverageSummary {
  totalObservations: number;
  oldestObservationAt: Date | null;
  newestObservationAt: Date | null;
  trackingStartDate: string | null;
  latestObservationDate: string | null;
  observedCalendarDays: string[];
  observedDaysCount: number;
  hasMetricObservations: boolean;
}

export interface PresetAvailability {
  preset: PresetKey;
  days: number;
  isAvailable: boolean;
  reason?: string;
  requiredDays: number;
  localFromDate: string;
  localToDate: string;
}

export interface ChannelCoverageResult {
  channelId: string;
  telegramUsername: string;
  timezone: string;
  asOfDateUtc: string;
  todayLocalDate: string;
  postCoverage: PostCoverageSummary;
  observationCoverage: ObservationCoverageSummary;
  historicalCoverageDays: number;
  rangeAvailability: Record<PresetKey, PresetAvailability>;
  longestAvailablePreset: PresetKey | null;
}

export interface RawCoverageData {
  channelId: string;
  telegramUsername: string;
  timezone: string;
  referenceDateUtc: Date;
  posts: Array<{
    id: string;
    publishedAt: Date;
    deletedAt: Date | null;
  }>;
  observations: Array<{
    id: string;
    observedAt: Date;
    metricType: string;
  }>;
  syncRuns: Array<{
    id: string;
    startedAt: Date;
    finishedAt: Date | null;
    status: string;
  }>;
}

/**
 * Calculates calendar day difference between two 'YYYY-MM-DD' date strings: (dateB - dateA).
 */
export function calendarDayDifference(dateStrA: string, dateStrB: string): number {
  const [yA, mA, dA] = dateStrA.split("-").map(Number);
  const [yB, mB, dB] = dateStrB.split("-").map(Number);
  const utcA = Date.UTC(yA, mA - 1, dA);
  const utcB = Date.UTC(yB, mB - 1, dB);
  return Math.round((utcB - utcA) / (24 * 60 * 60 * 1000));
}

/**
 * Subtracts N days from a 'YYYY-MM-DD' calendar date string.
 */
export function subtractDaysFromLocalDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - days));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Pure evaluation function that calculates coverage and range availability from raw data.
 */
export function evaluateChannelCoverage(data: RawCoverageData): ChannelCoverageResult {
  const {
    channelId,
    telegramUsername,
    timezone = DEFAULT_CHANNEL_TIMEZONE,
    referenceDateUtc,
    posts,
    observations,
    syncRuns,
  } = data;

  const todayLocalDate = formatLocalDate(referenceDateUtc, timezone);

  // Active non-deleted posts
  const activePosts = posts.filter((p) => p.deletedAt === null);
  const sortedPosts = [...activePosts].sort(
    (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()
  );
  const oldestPost = sortedPosts[0] || null;
  const newestPost = sortedPosts[sortedPosts.length - 1] || null;

  const oldestPostLocalDate = oldestPost
    ? formatLocalDate(oldestPost.publishedAt, timezone)
    : null;
  const newestPostLocalDate = newestPost
    ? formatLocalDate(newestPost.publishedAt, timezone)
    : null;

  const postHistoryDays = oldestPostLocalDate
    ? calendarDayDifference(oldestPostLocalDate, todayLocalDate) + 1
    : 0;

  const postCoverage: PostCoverageSummary = {
    totalPosts: activePosts.length,
    oldestPostPublishedAt: oldestPost ? oldestPost.publishedAt : null,
    newestPostPublishedAt: newestPost ? newestPost.publishedAt : null,
    oldestPostLocalDate,
    newestPostLocalDate,
    postHistoryDays: Math.max(0, postHistoryDays),
  };

  // Observations
  const sortedObs = [...observations].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime()
  );
  const oldestObs = sortedObs[0] || null;
  const newestObs = sortedObs[sortedObs.length - 1] || null;

  const trackingStartDate = oldestObs
    ? formatLocalDate(oldestObs.observedAt, timezone)
    : null;
  const latestObservationDate = newestObs
    ? formatLocalDate(newestObs.observedAt, timezone)
    : null;

  const observedDatesSet = new Set<string>();
  for (const obs of sortedObs) {
    observedDatesSet.add(formatLocalDate(obs.observedAt, timezone));
  }
  const observedCalendarDays = Array.from(observedDatesSet).sort();

  const observationCoverage: ObservationCoverageSummary = {
    totalObservations: observations.length,
    oldestObservationAt: oldestObs ? oldestObs.observedAt : null,
    newestObservationAt: newestObs ? newestObs.observedAt : null,
    trackingStartDate,
    latestObservationDate,
    observedCalendarDays,
    observedDaysCount: observedCalendarDays.length,
    hasMetricObservations: observations.length > 0,
  };

  // Successful sync runs
  const successfulSyncs = syncRuns
    .filter((s) => s.status === "SUCCESS")
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const earliestSync = successfulSyncs[0] || null;
  const latestSync = successfulSyncs[successfulSyncs.length - 1] || null;

  // Determine historical coverage
  let historicalCoverageDays = 0;

  if (observationCoverage.hasMetricObservations && successfulSyncs.length > 0) {
    // Determine the baseline start date.
    // In Metrik, the initial collection targeted up to 7 calendar days before the first sync.
    const firstSyncLocalDate = formatLocalDate(earliestSync.startedAt, timezone);
    const initialTargetStart = subtractDaysFromLocalDate(firstSyncLocalDate, 6);

    let baselineStartDate: string;
    if (oldestPostLocalDate) {
      // If the channel has posts going back to or before the 7-day initial collection boundary,
      // the baseline starts at the 7-day boundary.
      // If the channel is brand new and only has posts from later (e.g. 2 days ago),
      // the baseline starts on the oldest post date.
      baselineStartDate =
        calendarDayDifference(oldestPostLocalDate, initialTargetStart) >= 0
          ? initialTargetStart
          : oldestPostLocalDate;
    } else {
      baselineStartDate = firstSyncLocalDate;
    }

    // Coverage ends at the latest confirmed sync or observation date
    const latestSyncDate = latestSync ? formatLocalDate(latestSync.startedAt, timezone) : firstSyncLocalDate;
    const latestCoveredDate = latestObservationDate || latestSyncDate;

    // Check if the latest activity is reasonably recent (within 7 days of reference date)
    // to prevent claiming full coverage for an abandoned channel where sync was off for weeks.
    const daysSinceLatestActivity = calendarDayDifference(latestCoveredDate, todayLocalDate);
    const isActivityRecent = daysSinceLatestActivity <= 7;

    if (isActivityRecent) {
      // Calculate coverage days from baseline start to the latest activity date
      const daysSpan = calendarDayDifference(baselineStartDate, latestCoveredDate) + 1;
      historicalCoverageDays = Math.max(1, daysSpan);
    } else {
      // If activity is stale, coverage is frozen at what was collected
      const daysSpan = calendarDayDifference(baselineStartDate, latestCoveredDate) + 1;
      historicalCoverageDays = Math.max(0, daysSpan);
    }
  }

  // Evaluate range availability for each preset
  const rangeAvailability = {} as Record<PresetKey, PresetAvailability>;
  const presetKeys: PresetKey[] = ["1d", "5d", "7d", "15d", "30d", "60d"];
  let longestAvailablePreset: PresetKey | null = null;

  for (const preset of presetKeys) {
    const days = PRESET_DAYS_MAP[preset];
    const period = resolvePresetRange(preset, referenceDateUtc, timezone);

    let isAvailable = false;
    let reason: string | undefined;

    if (!observationCoverage.hasMetricObservations) {
      isAvailable = false;
      reason = "No metric observations recorded yet.";
    } else if (successfulSyncs.length === 0) {
      isAvailable = false;
      reason = "No successful synchronization recorded.";
    } else if (historicalCoverageDays < days) {
      isAvailable = false;
      reason = `Available after ${days} days of recorded history.`;
    } else {
      // Verify that data actually exists covering this range
      // Range start date must be >= baseline start date
      isAvailable = true;
    }

    if (isAvailable) {
      longestAvailablePreset = preset;
    }

    rangeAvailability[preset] = {
      preset,
      days,
      isAvailable,
      reason,
      requiredDays: days,
      localFromDate: period.localFromDate,
      localToDate: period.localToDate,
    };
  }

  return {
    channelId,
    telegramUsername,
    timezone,
    asOfDateUtc: referenceDateUtc.toISOString(),
    todayLocalDate,
    postCoverage,
    observationCoverage,
    historicalCoverageDays,
    rangeAvailability,
    longestAvailablePreset,
  };
}

/**
 * Retrieves database records and computes data-aware analytics coverage for a given channel.
 */
export async function getChannelCoverage(
  channelId: string,
  options: {
    referenceDateUtc?: Date;
    prisma?: PrismaClient;
  } = {}
): Promise<ChannelCoverageResult | null> {
  const db = options.prisma || defaultPrisma;
  const refDate = options.referenceDateUtc || new Date();

  const channel = await db.channel.findUnique({
    where: { id: channelId },
    select: { id: true, telegramUsername: true, timezone: true },
  });

  if (!channel) {
    return null;
  }

  const [posts, observations, syncRuns] = await Promise.all([
    db.post.findMany({
      where: { channelId: channel.id },
      select: { id: true, publishedAt: true, deletedAt: true },
    }),
    db.postMetricObservation.findMany({
      where: { post: { channelId: channel.id } },
      select: { id: true, observedAt: true, metricType: true },
    }),
    db.syncRun.findMany({
      where: { channelId: channel.id },
      select: { id: true, startedAt: true, finishedAt: true, status: true },
    }),
  ]);

  return evaluateChannelCoverage({
    channelId: channel.id,
    telegramUsername: channel.telegramUsername,
    timezone: channel.timezone,
    referenceDateUtc: refDate,
    posts,
    observations,
    syncRuns,
  });
}
