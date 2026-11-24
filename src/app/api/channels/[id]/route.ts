import { NextResponse } from "next/server";
import { validateApiAccess } from "@/server/auth/guard";
import { prisma } from "@/server/db/client";
import { findChannelByIdentifier } from "@/server/db/channel-queries";
import { ApiValidationError } from "@/server/metrics/validation";
import { getChannelCoverage } from "@/server/metrics/coverage";

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
    const channel = await findChannelByIdentifier(rawId);

    if (!channel) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `Channel "${rawId}" was not found.`,
          },
        },
        { status: 404 }
      );
    }

    // Query channel summary statistics and coverage
    const [publishedTotal, deletedTotal, oldestPost, newestPost, latestSync, coverage] =
      await Promise.all([
        prisma.post.count({
          where: { channelId: channel.id, deletedAt: null },
        }),
        prisma.post.count({
          where: { channelId: channel.id, deletedAt: { not: null } },
        }),
        prisma.post.findFirst({
          where: { channelId: channel.id, deletedAt: null },
          orderBy: { publishedAt: "asc" },
          select: { publishedAt: true },
        }),
        prisma.post.findFirst({
          where: { channelId: channel.id, deletedAt: null },
          orderBy: { publishedAt: "desc" },
          select: { publishedAt: true },
        }),
        prisma.syncRun.findFirst({
          where: { channelId: channel.id },
          orderBy: { startedAt: "desc" },
        }),
        getChannelCoverage(channel.id),
      ]);

    return NextResponse.json({
      channel: {
        id: channel.id,
        telegramUsername: channel.telegramUsername,
        title: channel.title,
        timezone: channel.timezone,
        createdAt: channel.createdAt.toISOString(),
        updatedAt: channel.updatedAt.toISOString(),
      },
      summary: {
        postsPublishedTotal: publishedTotal,
        postsDeletedTotal: deletedTotal,
        reach: {
          status: "UNAVAILABLE",
          value: null,
          reason: "Reach is unavailable on Telegram broadcast channels",
        },
        oldestPostPublishedAt: oldestPost ? oldestPost.publishedAt.toISOString() : null,
        newestPostPublishedAt: newestPost ? newestPost.publishedAt.toISOString() : null,
      },
      latestSync: latestSync
        ? {
            id: latestSync.id,
            status: latestSync.status,
            startedAt: latestSync.startedAt.toISOString(),
            finishedAt: latestSync.finishedAt ? latestSync.finishedAt.toISOString() : null,
            pagesFetched: latestSync.pagesFetched,
            postsFetched: latestSync.postsFetched,
          }
        : null,
      coverage,
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
          message: "Failed to retrieve channel details.",
        },
      },
      { status: 500 }
    );
  }
}
