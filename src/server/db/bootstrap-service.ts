import {
  type PrismaClient,
  BootstrapStatus,
  SyncStatus,
} from "@prisma/client";
import { prisma as defaultPrisma } from "./client.ts";
import {
  syncPublicChannel,
  type SyncResult,
} from "./sync-service.ts";
import {
  resolvePresetRange,
  DEFAULT_CHANNEL_TIMEZONE,
} from "../metrics/timezone.ts";
import { validateChannelUsername } from "../public-channel-collector.ts";

export interface BootstrapWindow {
  windowStartLocalDate: string;
  windowEndLocalDate: string;
  cutoffDateUtc: Date;
  timezone: string;
}

export interface BootstrapResult {
  success: boolean;
  channelId: string;
  channelUsername: string;
  status: BootstrapStatus;
  windowStartLocalDate: string;
  windowEndLocalDate: string;
  cutoffDateUtc: Date;
  pagesFetched: number;
  postsFetched: number;
  postsCreated: number;
  observationsCreated: number;
  cutoffReached: boolean;
  oldestPostPublishedAt: Date | null;
  errorMessage?: string;
  syncResult?: SyncResult;
}

export interface BootstrapOptions {
  maxPages?: number;
  customFetch?: typeof fetch;
  prisma?: PrismaClient;
  referenceDateUtc?: Date;
}

/**
 * Calculates the exact 7-calendar-day bootstrap window [D_today - 6, D_today]
 * for a channel in its configured timezone.
 */
export function calculateBootstrapWindow(
  referenceDateUtc: Date = new Date(),
  timezone: string = DEFAULT_CHANNEL_TIMEZONE
): BootstrapWindow {
  const period = resolvePresetRange("7d", referenceDateUtc, timezone);
  return {
    windowStartLocalDate: period.localFromDate,
    windowEndLocalDate: period.localToDate,
    cutoffDateUtc: period.fromUtc,
    timezone,
  };
}

/**
 * Checks existing database records to determine whether a channel's 7-day bootstrap is complete.
 */
export async function determineBootstrapStatus(
  channelId: string,
  options: {
    prisma?: PrismaClient;
    referenceDateUtc?: Date;
  } = {}
): Promise<{
  status: BootstrapStatus;
  cutoffReached: boolean;
  oldestPostPublishedAt: Date | null;
  cutoffDateUtc: Date;
  windowStartLocalDate: string;
  windowEndLocalDate: string;
}> {
  const db = options.prisma ?? defaultPrisma;
  const channel = await db.channel.findUnique({
    where: { id: channelId },
    select: { id: true, timezone: true, bootstrapStatus: true },
  });

  if (!channel) {
    throw new Error(`Channel with ID '${channelId}' was not found.`);
  }

  const window = calculateBootstrapWindow(options.referenceDateUtc, channel.timezone);

  const [oldestPost, latestSync] = await Promise.all([
    db.post.findFirst({
      where: { channelId, deletedAt: null },
      orderBy: { publishedAt: "asc" },
      select: { publishedAt: true },
    }),
    db.syncRun.findFirst({
      where: { channelId },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  if (!latestSync) {
    return {
      status: BootstrapStatus.PENDING,
      cutoffReached: false,
      oldestPostPublishedAt: null,
      cutoffDateUtc: window.cutoffDateUtc,
      windowStartLocalDate: window.windowStartLocalDate,
      windowEndLocalDate: window.windowEndLocalDate,
    };
  }

  if (latestSync.status === SyncStatus.RUNNING) {
    return {
      status: BootstrapStatus.RUNNING,
      cutoffReached: false,
      oldestPostPublishedAt: oldestPost ? oldestPost.publishedAt : null,
      cutoffDateUtc: window.cutoffDateUtc,
      windowStartLocalDate: window.windowStartLocalDate,
      windowEndLocalDate: window.windowEndLocalDate,
    };
  }

  const oldestDate = oldestPost ? oldestPost.publishedAt : null;
  // If the oldest post publishedAt is at or before the cutoffDateUtc, or if the collector reached the
  // channel's origin (postsFetched < pagesFetched * 20 for sparse/young channels), the bootstrap is complete.
  const reachedChannelBeginning =
    latestSync.status === SyncStatus.SUCCESS &&
    latestSync.pagesFetched > 0 &&
    latestSync.postsFetched < latestSync.pagesFetched * 20;

  const cutoffReached =
    (oldestDate !== null && oldestDate.getTime() <= window.cutoffDateUtc.getTime()) ||
    reachedChannelBeginning;

  let status: BootstrapStatus;
  if (cutoffReached) {
    status = BootstrapStatus.COMPLETED;
  } else if (latestSync.status === SyncStatus.FAILED && !oldestPost) {
    status = BootstrapStatus.FAILED;
  } else {
    // If sync succeeded but cutoff was not reached (e.g. more older posts exist on Telegram)
    status = BootstrapStatus.INCOMPLETE;
  }

  return {
    status,
    cutoffReached,
    oldestPostPublishedAt: oldestDate,
    cutoffDateUtc: window.cutoffDateUtc,
    windowStartLocalDate: window.windowStartLocalDate,
    windowEndLocalDate: window.windowEndLocalDate,
  };
}

/**
 * Executes a historical 7-day bootstrap for a public Telegram channel.
 * Collects all public posts published during the previous seven calendar days.
 */
export async function runChannelBootstrap(
  channelUsernameInput: string,
  options?: BootstrapOptions
): Promise<BootstrapResult> {
  const db = options?.prisma ?? defaultPrisma;
  const cleanUsername = validateChannelUsername(channelUsernameInput);

  // 1. Load or upsert channel
  const channel = await db.channel.upsert({
    where: { telegramUsername: cleanUsername },
    create: {
      telegramUsername: cleanUsername,
      title: null,
      timezone: DEFAULT_CHANNEL_TIMEZONE,
      bootstrapStatus: BootstrapStatus.RUNNING,
    },
    update: {
      bootstrapStatus: BootstrapStatus.RUNNING,
    },
  });

  const window = calculateBootstrapWindow(options?.referenceDateUtc, channel.timezone);

  try {
    // 2. Perform synchronized collection targeting 7 days with safe page limit (default 10)
    const maxPages = options?.maxPages ?? 10;
    const syncResult = await syncPublicChannel(cleanUsername, {
      maxPages,
      targetDays: 7,
      customFetch: options?.customFetch,
      prisma: db,
    });

    // 3. Inspect oldest post to determine if the 7-day cutoff was reached
    const oldestPost = await db.post.findFirst({
      where: { channelId: channel.id, deletedAt: null },
      orderBy: { publishedAt: "asc" },
      select: { publishedAt: true },
    });

    const oldestDate = oldestPost ? oldestPost.publishedAt : null;
    const cutoffReached =
      (oldestDate !== null && oldestDate.getTime() <= window.cutoffDateUtc.getTime()) ||
      !syncResult.hasMore; // If channel has fewer than 7 days of posts total on Telegram

    const finalStatus = cutoffReached ? BootstrapStatus.COMPLETED : BootstrapStatus.INCOMPLETE;

    // 4. Update channel with bootstrap status and lastSyncedAt
    await db.channel.update({
      where: { id: channel.id },
      data: {
        bootstrapStatus: finalStatus,
        lastSyncedAt: new Date(),
      },
    });

    return {
      success: true,
      channelId: channel.id,
      channelUsername: cleanUsername,
      status: finalStatus,
      windowStartLocalDate: window.windowStartLocalDate,
      windowEndLocalDate: window.windowEndLocalDate,
      cutoffDateUtc: window.cutoffDateUtc,
      pagesFetched: syncResult.pagesFetched,
      postsFetched: syncResult.postsFetched,
      postsCreated: syncResult.postsCreated,
      observationsCreated: syncResult.observationsCreated,
      cutoffReached,
      oldestPostPublishedAt: oldestDate,
      syncResult,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error during bootstrap.";

    await db.channel.update({
      where: { id: channel.id },
      data: {
        bootstrapStatus: BootstrapStatus.FAILED,
      },
    });

    return {
      success: false,
      channelId: channel.id,
      channelUsername: cleanUsername,
      status: BootstrapStatus.FAILED,
      windowStartLocalDate: window.windowStartLocalDate,
      windowEndLocalDate: window.windowEndLocalDate,
      cutoffDateUtc: window.cutoffDateUtc,
      pagesFetched: 0,
      postsFetched: 0,
      postsCreated: 0,
      observationsCreated: 0,
      cutoffReached: false,
      oldestPostPublishedAt: null,
      errorMessage: errorMsg,
    };
  }
}
