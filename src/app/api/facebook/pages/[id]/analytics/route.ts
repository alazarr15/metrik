import { NextResponse } from "next/server";
import { FacebookItemType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { validateApiAccess } from "@/server/auth/guard";
import { ApiValidationError, validateDateRange } from "@/server/metrics/validation";
import {
  formatLocalDate,
  getCalendarDaysBetween,
  resolveExplicitPeriod,
} from "@/server/metrics/timezone";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = validateApiAccess(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const { id: rawId } = await context.params;
    const cleanId = rawId.trim();

    if (!cleanId) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PAGE_ID",
            message: "Facebook page identifier is required.",
          },
        },
        { status: 400 }
      );
    }

    const page = await prisma.facebookPage.findFirst({
      where: {
        OR: [{ id: cleanId }, { facebookPageId: cleanId }],
      },
    });

    if (!page) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `Facebook page "${rawId}" was not found.`,
          },
        },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const rangeParam = url.searchParams.get("range");
    const typeParam = (url.searchParams.get("type") || "all").toLowerCase();

    const { fromUtc, toUtc } = validateDateRange(
      fromParam,
      toParam,
      rangeParam,
      page.timezone
    );
    const period = resolveExplicitPeriod(fromUtc, toUtc, page.timezone);

    const allItemsInPeriod = await prisma.facebookItem.findMany({
      where: {
        pageId: page.id,
        publishedAt: {
          gte: period.fromUtc,
          lt: period.toUtc,
        },
      },
      orderBy: { publishedAt: "desc" },
    });

    const reelsCount = allItemsInPeriod.filter(
      (i) => i.itemType === FacebookItemType.REEL
    ).length;
    const postsCount = allItemsInPeriod.length - reelsCount;

    const itemsInPeriod =
      typeParam === "reels"
        ? allItemsInPeriod.filter((i) => i.itemType === FacebookItemType.REEL)
        : typeParam === "posts"
        ? allItemsInPeriod.filter((i) => i.itemType === FacebookItemType.POST)
        : allItemsInPeriod;

    const days = getCalendarDaysBetween(period.localFromDate, period.localToDate);
    const dailyMap = new Map<string, { count: number; engagement: number }>();
    for (const d of days) {
      dailyMap.set(d, { count: 0, engagement: 0 });
    }

    let totalReach: number | null = null;
    let totalViews: number | null = null;
    let totalReactions: number | null = null;
    let totalComments: number | null = null;
    let totalShares: number | null = null;

    for (const item of itemsInPeriod) {
      const localDate = formatLocalDate(item.publishedAt, page.timezone);
      const bucket = dailyMap.get(localDate);
      if (bucket) {
        bucket.count += 1;
        bucket.engagement +=
          (item.reactionsCount ?? 0) +
          (item.commentsCount ?? 0) +
          (item.sharesCount ?? 0);
      }

      if (item.reachCount !== null) {
        totalReach = (totalReach ?? 0) + item.reachCount;
      }
      if (item.viewsCount !== null) {
        totalViews = (totalViews ?? 0) + item.viewsCount;
      }
      if (item.reactionsCount !== null) {
        totalReactions = (totalReactions ?? 0) + item.reactionsCount;
      }
      if (item.commentsCount !== null) {
        totalComments = (totalComments ?? 0) + item.commentsCount;
      }
      if (item.sharesCount !== null) {
        totalShares = (totalShares ?? 0) + item.sharesCount;
      }
    }

    return NextResponse.json({
      page: {
        id: page.id,
        facebookPageId: page.facebookPageId,
        name: page.name,
        followersCount: page.followersCount,
        fanCount: page.fanCount,
        lastSyncedAt: page.lastSyncedAt ? page.lastSyncedAt.toISOString() : null,
      },
      period: {
        from: period.fromUtc.toISOString(),
        to: period.toUtc.toISOString(),
        timezone: period.timezone,
        localFromDate: period.localFromDate,
        localToDate: period.localToDate,
      },
      itemsPublished: {
        total: itemsInPeriod.length,
        breakdown: {
          all: allItemsInPeriod.length,
          posts: postsCount,
          reels: reelsCount,
        },
        daily: days.map((date) => ({
          date,
          count: dailyMap.get(date)?.count ?? 0,
          engagement: dailyMap.get(date)?.engagement ?? 0,
        })),
      },
      periodTotals: {
        reach: itemsInPeriod.length === 0 ? 0 : totalReach,
        views: itemsInPeriod.length === 0 ? 0 : totalViews,
        reactions: itemsInPeriod.length === 0 ? 0 : totalReactions,
        comments: itemsInPeriod.length === 0 ? 0 : totalComments,
        shares: itemsInPeriod.length === 0 ? 0 : totalShares,
      },
    });
  } catch (error) {
    if (error instanceof ApiValidationError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to compute Facebook analytics.",
        },
      },
      { status: 500 }
    );
  }
}
