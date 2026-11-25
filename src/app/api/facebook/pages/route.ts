import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { validateApiAccess } from "@/server/auth/guard";

export async function GET(request: Request) {
  const auth = validateApiAccess(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const pages = await prisma.facebookPage.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: { items: true },
        },
        syncRuns: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });

    const formatted = pages.map((p) => ({
      id: p.id,
      facebookPageId: p.facebookPageId,
      name: p.name,
      followersCount: p.followersCount,
      fanCount: p.fanCount,
      timezone: p.timezone,
      itemsTrackedCount: p._count.items,
      lastSyncedAt: p.lastSyncedAt ? p.lastSyncedAt.toISOString() : null,
      latestSync: p.syncRuns[0]
        ? {
            id: p.syncRuns[0].id,
            status: p.syncRuns[0].status,
            finishedAt: p.syncRuns[0].finishedAt
              ? p.syncRuns[0].finishedAt.toISOString()
              : null,
            itemsFetched: p.syncRuns[0].itemsFetched,
          }
        : null,
    }));

    return NextResponse.json({ pages: formatted });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve Facebook pages.",
        },
      },
      { status: 500 }
    );
  }
}
