import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { validateApiAccess } from "@/server/auth/guard";
import { ApiValidationError, validateDateRange } from "@/server/metrics/validation";

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
    const limitParam = parseInt(url.searchParams.get("limit") || "25", 10);
    const limit = Number.isNaN(limitParam) ? 25 : Math.min(Math.max(limitParam, 1), 100);
    const rangeParam = url.searchParams.get("range");
    const typeParam = (url.searchParams.get("type") || "all").toLowerCase();
    const sortParam = (url.searchParams.get("sort") || "latest").toLowerCase();

    let publishedFilter: { gte: Date; lt: Date } | undefined;
    if (rangeParam) {
      const { fromUtc, toUtc } = validateDateRange(null, null, rangeParam, channel.timezone);
      publishedFilter = { gte: fromUtc, lt: toUtc };
    }

    const isShortFilter =
      typeParam === "shorts" ? true : typeParam === "videos" ? false : undefined;

    const videos = await prisma.youTubeVideo.findMany({
      where: {
        channelId: channel.id,
        ...(publishedFilter ? { publishedAt: publishedFilter } : {}),
        ...(isShortFilter !== undefined ? { isShort: isShortFilter } : {}),
      },
      orderBy:
        sortParam === "top"
          ? [{ viewCount: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }]
          : [{ publishedAt: "desc" }],
      take: limit,
    });

    return NextResponse.json({
      videos: videos.map((v) => ({
        id: v.id,
        youtubeVideoId: v.youtubeVideoId,
        title: v.title,
        publishedAt: v.publishedAt.toISOString(),
        duration: v.duration,
        isShort: v.isShort,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
      })),
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
          message: "Failed to retrieve YouTube videos.",
        },
      },
      { status: 500 }
    );
  }
}
