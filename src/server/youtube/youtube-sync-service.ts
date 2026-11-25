import { type PrismaClient, SyncStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/client.ts";
import { sanitizeSyncRunError } from "../db/integrity.ts";
import { DEFAULT_CHANNEL_TIMEZONE } from "../metrics/timezone.ts";
import {
  fetchYouTubeChannelData,
  normalizeYouTubeHandle,
} from "./youtube-collector.ts";

export interface SyncYouTubeResult {
  channelId: string;
  handle: string;
  syncRunId: string;
  status: "SUCCESS" | "FAILED";
  videosFetched: number;
  videosCreated: number;
  videosUpdated: number;
  observationsCreated: number;
  errorMessage?: string;
}

/**
 * Synchronizes a public YouTube channel and its recent videos via YouTube Data API v3.
 * Idempotent: running twice does not duplicate videos or redundant observations.
 */
export async function syncYouTubeChannel(
  handleInput: string,
  options?: {
    apiKey?: string;
    maxPages?: number;
    prisma?: PrismaClient;
    customFetch?: typeof fetch;
  }
): Promise<SyncYouTubeResult> {
  const db = options?.prisma ?? defaultPrisma;
  const apiKey = options?.apiKey ?? process.env.YOUTUBE_API_KEY ?? "";
  const handle = normalizeYouTubeHandle(handleInput);
  const timezone = process.env.APP_TIMEZONE || DEFAULT_CHANNEL_TIMEZONE;

  const data = await fetchYouTubeChannelData(handle, {
    apiKey,
    maxPages: options?.maxPages ?? 2,
    customFetch: options?.customFetch,
  });

  // Upsert channel metadata
  const channel = await db.youTubeChannel.upsert({
    where: { youtubeChannelId: data.channel.youtubeChannelId },
    update: {
      handle: data.channel.handle,
      title: data.channel.title,
      uploadsPlaylistId: data.channel.uploadsPlaylistId,
      subscriberCount: data.channel.subscriberCount,
      totalViewCount: data.channel.totalViewCount,
      videoCount: data.channel.videoCount,
      lastSyncedAt: new Date(),
    },
    create: {
      handle: data.channel.handle,
      youtubeChannelId: data.channel.youtubeChannelId,
      title: data.channel.title,
      uploadsPlaylistId: data.channel.uploadsPlaylistId,
      subscriberCount: data.channel.subscriberCount,
      totalViewCount: data.channel.totalViewCount,
      videoCount: data.channel.videoCount,
      timezone,
      lastSyncedAt: new Date(),
    },
  });

  const syncRun = await db.youTubeSyncRun.create({
    data: {
      channelId: channel.id,
      status: SyncStatus.RUNNING,
    },
  });

  let videosCreated = 0;
  let videosUpdated = 0;
  let observationsCreated = 0;

  try {
    for (const v of data.videos) {
      const existing = await db.youTubeVideo.findUnique({
        where: {
          channelId_youtubeVideoId: {
            channelId: channel.id,
            youtubeVideoId: v.youtubeVideoId,
          },
        },
        include: {
          observations: {
            orderBy: { observedAt: "desc" },
            take: 1,
          },
        },
      });

      let videoId: string;
      if (!existing) {
        const created = await db.youTubeVideo.create({
          data: {
            channelId: channel.id,
            youtubeVideoId: v.youtubeVideoId,
            title: v.title,
            publishedAt: new Date(v.publishedAtUtc),
            duration: v.duration,
            isShort: v.isShort,
            viewCount: v.viewCount,
            likeCount: v.likeCount,
            commentCount: v.commentCount,
          },
        });
        videoId = created.id;
        videosCreated++;

        await db.youTubeVideoObservation.create({
          data: {
            videoId,
            viewCount: v.viewCount,
            likeCount: v.likeCount,
            commentCount: v.commentCount,
          },
        });
        observationsCreated++;
      } else {
        videoId = existing.id;
        const hasSnapshotChange =
          existing.title !== v.title ||
          existing.duration !== v.duration ||
          existing.isShort !== v.isShort ||
          existing.viewCount !== v.viewCount ||
          existing.likeCount !== v.likeCount ||
          existing.commentCount !== v.commentCount;

        if (hasSnapshotChange) {
          await db.youTubeVideo.update({
            where: { id: existing.id },
            data: {
              title: v.title,
              duration: v.duration,
              isShort: v.isShort,
              viewCount: v.viewCount,
              likeCount: v.likeCount,
              commentCount: v.commentCount,
            },
          });
          videosUpdated++;
        }

        const latestObs = existing.observations[0];
        const metricChanged =
          !latestObs ||
          latestObs.viewCount !== v.viewCount ||
          latestObs.likeCount !== v.likeCount ||
          latestObs.commentCount !== v.commentCount;

        if (metricChanged) {
          await db.youTubeVideoObservation.create({
            data: {
              videoId,
              viewCount: v.viewCount,
              likeCount: v.likeCount,
              commentCount: v.commentCount,
            },
          });
          observationsCreated++;
        }
      }
    }

    await db.youTubeSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: SyncStatus.SUCCESS,
        finishedAt: new Date(),
        videosFetched: data.videos.length,
      },
    });

    return {
      channelId: channel.id,
      handle: channel.handle,
      syncRunId: syncRun.id,
      status: "SUCCESS",
      videosFetched: data.videos.length,
      videosCreated,
      videosUpdated,
      observationsCreated,
    };
  } catch (err: unknown) {
    const safeMsg = sanitizeSyncRunError(err);
    await db.youTubeSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: safeMsg,
      },
    });

    return {
      channelId: channel.id,
      handle: channel.handle,
      syncRunId: syncRun.id,
      status: "FAILED",
      videosFetched: data.videos.length,
      videosCreated,
      videosUpdated,
      observationsCreated,
      errorMessage: safeMsg,
    };
  }
}
