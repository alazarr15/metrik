import { NextResponse } from "next/server";
import { validateApiAccess } from "@/server/auth/guard";
import { prisma } from "@/server/db/client";

export async function GET(request: Request) {
  const auth = validateApiAccess(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const channels = await prisma.channel.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: {
            posts: {
              where: { deletedAt: null },
            },
          },
        },
        syncRuns: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });

    const responseData = channels.map((c) => {
      const latestSync = c.syncRuns[0] ?? null;
      return {
        id: c.id,
        telegramUsername: c.telegramUsername,
        title: c.title,
        timezone: c.timezone,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        bootstrapStatus: c.bootstrapStatus,
        lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
        nextPollAt: c.nextPollAt ? c.nextPollAt.toISOString() : null,
        postsCount: c._count.posts,
        latestSync: latestSync
          ? {
              id: latestSync.id,
              status: latestSync.status,
              finishedAt: latestSync.finishedAt ? latestSync.finishedAt.toISOString() : null,
              pagesFetched: latestSync.pagesFetched,
              postsFetched: latestSync.postsFetched,
            }
          : null,
      };
    });

    return NextResponse.json({ channels: responseData });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve channels.",
        },
      },
      { status: 500 }
    );
  }
}
