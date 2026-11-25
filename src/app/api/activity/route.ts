import { NextResponse } from "next/server";
import { validateApiAccess } from "@/server/auth/guard";
import { prisma } from "@/server/db/client";
import { recordVisit, VisitEvent, VisitPlatform } from "@/server/activity/visit-logger";

const ALLOWED_PLATFORMS = new Set(["telegram", "youtube", "facebook"]);
const ALLOWED_EVENTS = new Set(["login", "view"]);

export async function POST(request: Request) {
  const auth = validateApiAccess(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  let event: VisitEvent = "view";
  let platform: VisitPlatform = null;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      event?: unknown;
      platform?: unknown;
    };

    if (typeof body.event === "string" && ALLOWED_EVENTS.has(body.event)) {
      event = body.event as VisitEvent;
    }
    if (typeof body.platform === "string" && ALLOWED_PLATFORMS.has(body.platform)) {
      platform = body.platform as VisitPlatform;
    }
  } catch {
    // Default to view/null if body is empty
  }

  await recordVisit({
    role: auth.role ?? "admin",
    event,
    platform,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const auth = validateApiAccess(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  if ((auth.role ?? "admin") !== "admin") {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Admin access is required to view client activity.",
        },
      },
      { status: 403 }
    );
  }

  try {
    const url = new URL(request.url);
    const roleFilter = (url.searchParams.get("role") || "all").toLowerCase();
    const limitParam = parseInt(url.searchParams.get("limit") || "100", 10);
    const limit = Number.isNaN(limitParam) ? 100 : Math.min(Math.max(limitParam, 1), 200);

    const where =
      roleFilter === "client" || roleFilter === "admin"
        ? { role: roleFilter }
        : undefined;

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [
      visits,
      totalClientVisits,
      clientVisitsToday,
      totalAdminVisits,
      latestClientVisit,
    ] = await Promise.all([
      prisma.clientVisit.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.clientVisit.count({ where: { role: "client" } }),
      prisma.clientVisit.count({
        where: {
          role: "client",
          createdAt: { gte: startOfToday },
        },
      }),
      prisma.clientVisit.count({ where: { role: "admin" } }),
      prisma.clientVisit.findFirst({
        where: { role: "client" },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      summary: {
        totalClientVisits,
        clientVisitsToday,
        totalAdminVisits,
        lastClientVisitAt: latestClientVisit ? latestClientVisit.createdAt.toISOString() : null,
      },
      visits: visits.map((v) => ({
        id: v.id,
        role: v.role,
        event: v.event,
        platform: v.platform,
        userAgent: v.userAgent,
        createdAt: v.createdAt.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "ACTIVITY_FETCH_FAILED",
          message: "Failed to load activity log.",
        },
      },
      { status: 500 }
    );
  }
}
