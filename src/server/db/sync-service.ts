import {
  type PrismaClient,
  SyncStatus,
  MetricType,
} from "@prisma/client";
import { prisma as defaultPrisma } from "./client.ts";
import {
  fetchPublicChannelPosts,
  validateChannelUsername,
} from "../public-channel-collector.ts";
import {
  createObservationFromParsedCounter,
  sanitizeSyncRunError,
} from "./integrity.ts";

export const DEFAULT_SYNC_MAX_PAGES = 2;
export const MAX_ALLOWED_SYNC_PAGES = 10;

export class PaginationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaginationValidationError";
  }
}

/**
 * Resolves and validates maximum pages to synchronize with the following precedence:
 * 1. CLI argument (e.g. process.argv[3])
 * 2. Environment variable (SYNC_MAX_PAGES)
 * 3. Default (2)
 *
 * Rules:
 * - Must be an integer.
 * - Must be >= 1.
 * - Must be <= 10.
 */
export function resolveSyncMaxPages(
  cliArg?: string | number,
  envVar?: string
): number {
  const candidate = cliArg !== undefined && cliArg !== "" ? cliArg : envVar;

  if (candidate === undefined || candidate === null || candidate === "") {
    return DEFAULT_SYNC_MAX_PAGES;
  }

  const num = typeof candidate === "number" ? candidate : Number(candidate.toString().trim());

  if (!Number.isInteger(num)) {
    throw new PaginationValidationError(
      `Invalid page count: "${candidate}". Must be an integer between 1 and ${MAX_ALLOWED_SYNC_PAGES}.`
    );
  }

  if (num < 1) {
    throw new PaginationValidationError(
      `Invalid page count: ${num}. Page count must be a positive integer (minimum 1).`
    );
  }

  if (num > MAX_ALLOWED_SYNC_PAGES) {
    throw new PaginationValidationError(
      `Page count ${num} exceeds maximum allowed limit of ${MAX_ALLOWED_SYNC_PAGES} pages.`
    );
  }

  return num;
}

export interface SyncOptions {
  maxPages?: number;
  customFetch?: typeof fetch;
  prisma?: PrismaClient;
}

export interface SyncResult {
  success: boolean;
  channelId: string;
  channelUsername: string;
  channelTitle: string | null;
  syncRunId: string;
  status: SyncStatus;
  pagesFetched: number;
  postsFetched: number;
  postsCreated: number;
  postsUpdated: number;
  observationsCreated: number;
  observationsSkippedUnchanged: number;
  hasMore: boolean;
  errorMessage?: string;
}

export class SyncExecutionError extends Error {
  readonly syncRunId: string;
  readonly sanitizedMessage: string;

  constructor(syncRunId: string, sanitizedMessage: string) {
    super(`Sync failed for run '${syncRunId}': ${sanitizedMessage}`);
    this.name = "SyncExecutionError";
    this.syncRunId = syncRunId;
    this.sanitizedMessage = sanitizedMessage;
  }
}

/**
 * Synchronizes a public Telegram channel with the PostgreSQL database.
 * 
 * Rules enforced:
 * - Channels identified by normalized username.
 * - Idempotent post upserts (channelId + telegramMessageId).
 * - Append-only metric observations (no updates/overwrites).
 * - Avoids duplicate observations when counter values and precision are unchanged.
 * - SyncRun lifecycle: RUNNING -> SUCCESS or FAILED.
 * - Sanitized error logging (no secrets).
 * - Incomplete pagination never marks absent posts as deleted.
 */
export async function syncPublicChannel(
  channelUsernameInput: string,
  options?: SyncOptions
): Promise<SyncResult> {
  const db = options?.prisma ?? defaultPrisma;
  const cleanUsername = validateChannelUsername(channelUsernameInput);

  // 1. Upsert channel metadata (defaults to Africa/Addis_Ababa timezone)
  const channel = await db.channel.upsert({
    where: { telegramUsername: cleanUsername },
    create: {
      telegramUsername: cleanUsername,
      title: null,
      timezone: "Africa/Addis_Ababa",
    },
    update: {},
  });

  // 2. Initialize SyncRun in RUNNING status
  const syncRun = await db.syncRun.create({
    data: {
      channelId: channel.id,
      status: SyncStatus.RUNNING,
      startedAt: new Date(),
      pagesFetched: 0,
      postsFetched: 0,
    },
  });

  try {
    // 3. Fetch public channel posts via bounded collector
    const maxPages = resolveSyncMaxPages(options?.maxPages);
    const fetchResult = await fetchPublicChannelPosts(cleanUsername, {
      maxPages,
      customFetch: options?.customFetch,
    });

    let postsCreated = 0;
    let postsUpdated = 0;
    let observationsCreated = 0;
    let observationsSkippedUnchanged = 0;

    // 4. Update channel title if exposed and changed
    let updatedTitle = channel.title;
    if (fetchResult.channelTitle && fetchResult.channelTitle !== channel.title) {
      await db.channel.update({
        where: { id: channel.id },
        data: { title: fetchResult.channelTitle },
      });
      updatedTitle = fetchResult.channelTitle;
    }

    // 5. Persist posts and metric observations
    for (const item of fetchResult.posts) {
      const existingPost = await db.post.findUnique({
        where: {
          channelId_telegramMessageId: {
            channelId: channel.id,
            telegramMessageId: item.id,
          },
        },
      });

      let postId: string;
      if (!existingPost) {
        const createdPost = await db.post.create({
          data: {
            channelId: channel.id,
            telegramMessageId: item.id,
            publishedAt: new Date(item.publishedAtUtc),
            text: item.text || null,
            deletedAt: null,
          },
        });
        postId = createdPost.id;
        postsCreated++;
      } else {
        postId = existingPost.id;
        // Update post text if it changed on Telegram; preserve publishedAt and deletedAt
        if (existingPost.text !== (item.text || null)) {
          await db.post.update({
            where: { id: existingPost.id },
            data: { text: item.text || null },
          });
          postsUpdated++;
        }
      }

      // Process and persist metrics for this post: VIEWS, REACTIONS, COMMENTS
      const metricConfigs = [
        { type: MetricType.VIEWS, counter: item.views },
        { type: MetricType.REACTIONS, counter: item.reactionsCount },
        { type: MetricType.COMMENTS, counter: item.commentsCount },
      ];

      for (const { type, counter } of metricConfigs) {
        const observationInput = createObservationFromParsedCounter(
          postId,
          type,
          counter
        );

        // Check the most recent observation for this post & metricType
        const latestObs = await db.postMetricObservation.findFirst({
          where: {
            postId,
            metricType: type,
          },
          orderBy: { observedAt: "desc" },
        });

        // Avoid inserting duplicate observations if value, precision, and raw text are unchanged
        const isUnchanged =
          latestObs &&
          latestObs.precision === observationInput.precision &&
          latestObs.numericValue === observationInput.numericValue &&
          latestObs.rawValue === observationInput.rawValue;

        if (isUnchanged) {
          observationsSkippedUnchanged++;
        } else {
          await db.postMetricObservation.create({
            data: observationInput,
          });
          observationsCreated++;
        }
      }
    }

    // 6. Finalize SyncRun with SUCCESS
    await db.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: SyncStatus.SUCCESS,
        finishedAt: new Date(),
        pagesFetched: fetchResult.pagesFetched,
        postsFetched: fetchResult.posts.length,
        errorMessage: null,
      },
    });

    return {
      success: true,
      channelId: channel.id,
      channelUsername: cleanUsername,
      channelTitle: updatedTitle,
      syncRunId: syncRun.id,
      status: SyncStatus.SUCCESS,
      pagesFetched: fetchResult.pagesFetched,
      postsFetched: fetchResult.posts.length,
      postsCreated,
      postsUpdated,
      observationsCreated,
      observationsSkippedUnchanged,
      hasMore: fetchResult.hasMore,
    };
  } catch (error) {
    const sanitizedError = sanitizeSyncRunError(error);

    // Record failure in SyncRun audit table
    await db.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: sanitizedError,
      },
    });

    throw new SyncExecutionError(syncRun.id, sanitizedError);
  }
}
