import { type PrismaClient, SyncStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/client.ts";
import { sanitizeSyncRunError } from "../db/integrity.ts";
import { DEFAULT_CHANNEL_TIMEZONE } from "../metrics/timezone.ts";
import { fetchFacebookPageData } from "./facebook-collector.ts";

export interface SyncFacebookResult {
  pageId: string;
  facebookPageId: string;
  name: string;
  syncRunId: string;
  status: "SUCCESS" | "FAILED";
  itemsFetched: number;
  itemsCreated: number;
  itemsUpdated: number;
  observationsCreated: number;
  errorMessage?: string;
}

/**
 * Synchronizes a Facebook Page's Posts and Reels via Meta Graph API.
 * Idempotent: running twice does not duplicate items or redundant observations.
 */
export async function syncFacebookPage(
  facebookPageIdInput?: string,
  options?: {
    accessToken?: string;
    limit?: number;
    prisma?: PrismaClient;
    customFetch?: typeof fetch;
  }
): Promise<SyncFacebookResult> {
  const db = options?.prisma ?? defaultPrisma;
  const facebookPageId = (facebookPageIdInput ?? process.env.FACEBOOK_PAGE_ID ?? "").trim();
  const accessToken = (options?.accessToken ?? process.env.FACEBOOK_ACCESS_TOKEN ?? "").trim();
  const timezone = process.env.APP_TIMEZONE || DEFAULT_CHANNEL_TIMEZONE;

  const data = await fetchFacebookPageData(facebookPageId, {
    accessToken,
    limit: options?.limit ?? 50,
    customFetch: options?.customFetch,
  });

  const page = await db.facebookPage.upsert({
    where: { facebookPageId: data.page.facebookPageId },
    update: {
      name: data.page.name,
      followersCount: data.page.followersCount,
      fanCount: data.page.fanCount,
      lastSyncedAt: new Date(),
    },
    create: {
      facebookPageId: data.page.facebookPageId,
      name: data.page.name,
      followersCount: data.page.followersCount,
      fanCount: data.page.fanCount,
      timezone,
      lastSyncedAt: new Date(),
    },
  });

  const syncRun = await db.facebookSyncRun.create({
    data: {
      pageId: page.id,
      status: SyncStatus.RUNNING,
    },
  });

  let itemsCreated = 0;
  let itemsUpdated = 0;
  let observationsCreated = 0;

  try {
    for (const item of data.items) {
      const existing = await db.facebookItem.findUnique({
        where: {
          pageId_facebookItemId: {
            pageId: page.id,
            facebookItemId: item.facebookItemId,
          },
        },
        include: {
          observations: {
            orderBy: { observedAt: "desc" },
            take: 1,
          },
        },
      });

      let itemId: string;
      if (!existing) {
        const created = await db.facebookItem.create({
          data: {
            pageId: page.id,
            facebookItemId: item.facebookItemId,
            itemType: item.itemType,
            message: item.message,
            permalinkUrl: item.permalinkUrl,
            publishedAt: new Date(item.publishedAtUtc),
            viewsCount: item.viewsCount,
            reachCount: item.reachCount,
            reactionsCount: item.reactionsCount,
            commentsCount: item.commentsCount,
            sharesCount: item.sharesCount,
          },
        });
        itemId = created.id;
        itemsCreated++;

        await db.facebookItemObservation.create({
          data: {
            itemId,
            viewsCount: item.viewsCount,
            reachCount: item.reachCount,
            reactionsCount: item.reactionsCount,
            commentsCount: item.commentsCount,
            sharesCount: item.sharesCount,
          },
        });
        observationsCreated++;
      } else {
        itemId = existing.id;
        const hasSnapshotChange =
          existing.itemType !== item.itemType ||
          existing.message !== item.message ||
          existing.permalinkUrl !== item.permalinkUrl ||
          existing.viewsCount !== item.viewsCount ||
          existing.reachCount !== item.reachCount ||
          existing.reactionsCount !== item.reactionsCount ||
          existing.commentsCount !== item.commentsCount ||
          existing.sharesCount !== item.sharesCount;

        if (hasSnapshotChange) {
          await db.facebookItem.update({
            where: { id: existing.id },
            data: {
              itemType: item.itemType,
              message: item.message,
              permalinkUrl: item.permalinkUrl,
              viewsCount: item.viewsCount,
              reachCount: item.reachCount,
              reactionsCount: item.reactionsCount,
              commentsCount: item.commentsCount,
              sharesCount: item.sharesCount,
            },
          });
          itemsUpdated++;
        }

        const latestObs = existing.observations[0];
        const metricChanged =
          !latestObs ||
          latestObs.viewsCount !== item.viewsCount ||
          latestObs.reachCount !== item.reachCount ||
          latestObs.reactionsCount !== item.reactionsCount ||
          latestObs.commentsCount !== item.commentsCount ||
          latestObs.sharesCount !== item.sharesCount;

        if (metricChanged) {
          await db.facebookItemObservation.create({
            data: {
              itemId,
              viewsCount: item.viewsCount,
              reachCount: item.reachCount,
              reactionsCount: item.reactionsCount,
              commentsCount: item.commentsCount,
              sharesCount: item.sharesCount,
            },
          });
          observationsCreated++;
        }
      }
    }

    await db.facebookSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: SyncStatus.SUCCESS,
        finishedAt: new Date(),
        itemsFetched: data.items.length,
      },
    });

    return {
      pageId: page.id,
      facebookPageId: page.facebookPageId,
      name: page.name,
      syncRunId: syncRun.id,
      status: "SUCCESS",
      itemsFetched: data.items.length,
      itemsCreated,
      itemsUpdated,
      observationsCreated,
    };
  } catch (err: unknown) {
    const safeMsg = sanitizeSyncRunError(err);
    await db.facebookSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: safeMsg,
      },
    });

    return {
      pageId: page.id,
      facebookPageId: page.facebookPageId,
      name: page.name,
      syncRunId: syncRun.id,
      status: "FAILED",
      itemsFetched: data.items.length,
      itemsCreated,
      itemsUpdated,
      observationsCreated,
      errorMessage: safeMsg,
    };
  }
}
