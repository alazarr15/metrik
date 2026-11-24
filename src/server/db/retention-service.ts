import { type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./client.ts";
import { resolvePresetRange } from "../metrics/timezone.ts";
import { validateChannelUsername } from "../public-channel-collector.ts";

export const DEFAULT_RETENTION_DAYS = 60;

export interface RetentionOptions {
  channelUsername?: string; // If omitted, all channels are processed
  retentionDays?: number; // Defaults to 60 days
  referenceDateUtc?: Date; // Defaults to current UTC instant
  prisma?: PrismaClient;
}

export interface ChannelRetentionSummary {
  channelId: string;
  telegramUsername: string;
  retentionBoundaryUtc: Date;
  observationsBeforeBoundary: number;
  anchorsPreserved: number;
  observationsPruned: number;
}

export interface RetentionResult {
  retentionDays: number;
  referenceDateUtc: Date;
  channelsProcessed: number;
  totalObservationsExamined: number;
  totalObservationsPruned: number;
  totalAnchorsPreserved: number;
  totalPostsPreserved: number;
  totalSyncRunsPreserved: number;
  channelSummaries: ChannelRetentionSummary[];
}

/**
 * Calculates the exact retention cutoff timestamp for a channel in its configured timezone.
 * Start is inclusive, matching the 60-calendar-day boundary [retentionBoundaryUtc, tomorrowMidnightUtc).
 */
export function calculateRetentionBoundary(
  retentionDays: number = DEFAULT_RETENTION_DAYS,
  timezone = "Africa/Addis_Ababa",
  referenceDateUtc: Date = new Date()
): Date {
  if (retentionDays === 60) {
    return resolvePresetRange("60d", referenceDateUtc, timezone).fromUtc;
  }
  // For custom retention day counts:
  const localToday = resolvePresetRange("1d", referenceDateUtc, timezone).localFromDate;
  const todayDateObj = new Date(`${localToday}T00:00:00Z`);
  const startDateObj = new Date(todayDateObj.getTime());
  startDateObj.setUTCDate(startDateObj.getUTCDate() - (retentionDays - 1));

  const y = startDateObj.getUTCFullYear();
  const m = String(startDateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(startDateObj.getUTCDate()).padStart(2, "0");
  const localStartDate = `${y}-${m}-${d}`;

  const { fromUtc } = resolvePresetRange("1d", new Date(`${localStartDate}T12:00:00Z`), timezone);
  return fromUtc;
}

/**
 * Executes safe rolling retention for historical metric observations.
 *
 * Analytics Integrity Guarantee:
 * - Observations within the rolling 60-day window are retained.
 * - For observations preceding the 60-day boundary, the SINGLE LATEST observation
 *   per post & metric type is preserved as an anchor. This ensures:
 *   1. Observed views growth calculations for the 60-day period maintain their baseline (O_base <= boundary).
 *   2. Posts without observations inside the 60-day window maintain their lifetime views counter.
 * - Only redundant observations older than the baseline anchor are pruned.
 * - Post records, channels, and SyncRun audit history are never deleted.
 */
export async function pruneHistoricalObservations(
  options?: RetentionOptions
): Promise<RetentionResult> {
  const db = options?.prisma ?? defaultPrisma;
  const retentionDays = options?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const referenceDateUtc = options?.referenceDateUtc ?? new Date();

  // Find target channels
  let channels;
  if (options?.channelUsername) {
    const cleanUsername = validateChannelUsername(options.channelUsername);
    const channel = await db.channel.findUnique({
      where: { telegramUsername: cleanUsername },
    });
    channels = channel ? [channel] : [];
  } else {
    channels = await db.channel.findMany({
      orderBy: { createdAt: "asc" },
    });
  }

  let totalObservationsExamined = 0;
  let totalObservationsPruned = 0;
  let totalAnchorsPreserved = 0;
  const channelSummaries: ChannelRetentionSummary[] = [];

  for (const channel of channels) {
    const retentionBoundaryUtc = calculateRetentionBoundary(
      retentionDays,
      channel.timezone,
      referenceDateUtc
    );

    // Query posts belonging to this channel
    const posts = await db.post.findMany({
      where: { channelId: channel.id },
      select: { id: true },
    });

    const postIds = posts.map((p) => p.id);
    if (postIds.length === 0) {
      channelSummaries.push({
        channelId: channel.id,
        telegramUsername: channel.telegramUsername,
        retentionBoundaryUtc,
        observationsBeforeBoundary: 0,
        anchorsPreserved: 0,
        observationsPruned: 0,
      });
      continue;
    }

    // Query observations before retention boundary
    const olderObservations = await db.postMetricObservation.findMany({
      where: {
        postId: { in: postIds },
        observedAt: { lt: retentionBoundaryUtc },
      },
      select: {
        id: true,
        postId: true,
        metricType: true,
        observedAt: true,
      },
      orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    });

    totalObservationsExamined += olderObservations.length;

    // Group by postId and metricType to identify anchor vs redundant observations
    // Key: `${postId}:${metricType}` -> latest observation is preserved as anchor
    const anchorObservationIds = new Set<string>();
    const redundantObservationIds: string[] = [];
    const seenPostMetric = new Set<string>();

    for (const obs of olderObservations) {
      const key = `${obs.postId}:${obs.metricType}`;
      if (!seenPostMetric.has(key)) {
        // First encountered because sorted by observedAt desc -> this is the latest before boundary
        seenPostMetric.add(key);
        anchorObservationIds.add(obs.id);
      } else {
        // Older than the anchor -> redundant and eligible for pruning
        redundantObservationIds.push(obs.id);
      }
    }

    // Prune redundant observations in batch
    if (redundantObservationIds.length > 0) {
      await db.postMetricObservation.deleteMany({
        where: {
          id: { in: redundantObservationIds },
        },
      });
    }

    const prunedCount = redundantObservationIds.length;
    const preservedCount = anchorObservationIds.size;

    totalObservationsPruned += prunedCount;
    totalAnchorsPreserved += preservedCount;

    channelSummaries.push({
      channelId: channel.id,
      telegramUsername: channel.telegramUsername,
      retentionBoundaryUtc,
      observationsBeforeBoundary: olderObservations.length,
      anchorsPreserved: preservedCount,
      observationsPruned: prunedCount,
    });
  }

  // Count preserved posts and SyncRuns
  const totalPostsPreserved = await db.post.count();
  const totalSyncRunsPreserved = await db.syncRun.count();

  return {
    retentionDays,
    referenceDateUtc,
    channelsProcessed: channels.length,
    totalObservationsExamined,
    totalObservationsPruned,
    totalAnchorsPreserved,
    totalPostsPreserved,
    totalSyncRunsPreserved,
    channelSummaries,
  };
}
