import { NextResponse } from "next/server";
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
    const cleanId = rawId.trim().replace(/^@/, "");

    if (!cleanId) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CHANNEL_ID",
            message: "YouTube channel identifier is required.",
          },
        },
        { status: 400 }
      );
    }

    const channel = await prisma.youTubeChannel.findFirst({
      where: {
        OR: [
          { id: cleanId },
          { youtubeChannelId: cleanId },
          { handle: { equals: cleanId, mode: "insensitive" } },
        ],
      },
    });

    if (!channel) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `YouTube channel "${rawId}" was not found.`,
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
      channel.timezone
    );
    const period = resolveExplicitPeriod(fromUtc, toUtc, channel.timezone);

    const allVideosInPeriod = await prisma.youTubeVideo.findMany({
      where: {
        channelId: channel.id,
        publishedAt: {
          gte: period.fromUtc,
          lt: period.toUtc,
        },
      },
      orderBy: { publishedAt: "desc" },
    });

    const shortsCount = allVideosInPeriod.filter((v) => v.isShort).length;
    const regularCount = allVideosInPeriod.length - shortsCount;

    const videosInPeriod =
      typeParam === "shorts"
        ? allVideosInPeriod.filter((v) => v.isShort)
        : typeParam === "videos"
        ? allVideosInPeriod.filter((v) => !v.isShort)
        : allVideosInPeriod;

    const days = getCalendarDaysBetween(period.localFromDate, period.localToDate);
    const dailyMap = new Map<string, { count: number; views: number }>();
    for (const d of days) {
      dailyMap.set(d, { count: 0, views: 0 });
    }

    let totalViews: number | null = null;
    let totalLikes: number | null = null;
    let totalComments: number | null = null;

    for (const v of videosInPeriod) {
      const localDate = formatLocalDate(v.publishedAt, channel.timezone);
      const bucket = dailyMap.get(localDate);
      if (bucket) {
        bucket.count += 1;
        if (v.viewCount !== null) {
          bucket.views += v.viewCount;
        }
      }

      if (v.viewCount !== null) {
        totalViews = (totalViews ?? 0) + v.viewCount;
      }
      if (v.likeCount !== null) {
        totalLikes = (totalLikes ?? 0) + v.likeCount;
      }
      if (v.commentCount !== null) {
        totalComments = (totalComments ?? 0) + v.commentCount;
      }
    }

    return NextResponse.json({
      channel: {
        id: channel.id,
        handle: channel.handle,
        youtubeChannelId: channel.youtubeChannelId,
        title: channel.title,
        subscriberCount: channel.subscriberCount,
        totalViewCount:
          channel.totalViewCount !== null ? channel.totalViewCount.toString() : null,
        videoCount: channel.videoCount,
        lastSyncedAt: channel.lastSyncedAt ? channel.lastSyncedAt.toISOString() : null,
      },
      period: {
        from: period.fromUtc.toISOString(),
        to: period.toUtc.toISOString(),
        timezone: period.timezone,
        localFromDate: period.localFromDate,
        localToDate: period.localToDate,
      },
      videosPublished: {
        total: videosInPeriod.length,
        breakdown: {
          all: allVideosInPeriod.length,
          videos: regularCount,
          shorts: shortsCount,
        },
        daily: days.map((date) => ({
          date,
          count: dailyMap.get(date)?.count ?? 0,
          views: dailyMap.get(date)?.views ?? 0,
        })),
      },
      periodTotals: {
        views: videosInPeriod.length === 0 ? 0 : totalViews,
        likes: videosInPeriod.length === 0 ? 0 : totalLikes,
        comments: videosInPeriod.length === 0 ? 0 : totalComments,
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
          message: "Failed to compute YouTube analytics.",
        },
      },
      { status: 500 }
    );
  }
}
