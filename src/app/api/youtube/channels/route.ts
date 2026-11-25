import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { validateApiAccess } from "@/server/auth/guard";

export async function GET(request: Request) {
  const auth = validateApiAccess(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const channels = await prisma.youTubeChannel.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: { videos: true },
        },
        syncRuns: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });

    const formatted = channels.map((ch) => ({
      id: ch.id,
      handle: ch.handle,
      youtubeChannelId: ch.youtubeChannelId,
      title: ch.title,
      subscriberCount: ch.subscriberCount,
      totalViewCount: ch.totalViewCount !== null ? ch.totalViewCount.toString() : null,
      videoCount: ch.videoCount,
      timezone: ch.timezone,
      videosTrackedCount: ch._count.videos,
      lastSyncedAt: ch.lastSyncedAt ? ch.lastSyncedAt.toISOString() : null,
      latestSync: ch.syncRuns[0]
        ? {
            id: ch.syncRuns[0].id,
            status: ch.syncRuns[0].status,
            finishedAt: ch.syncRuns[0].finishedAt
              ? ch.syncRuns[0].finishedAt.toISOString()
              : null,
            videosFetched: ch.syncRuns[0].videosFetched,
          }
        : null,
    }));

    return NextResponse.json({ channels: formatted });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve YouTube channels.",
        },
      },
      { status: 500 }
    );
  }
}
