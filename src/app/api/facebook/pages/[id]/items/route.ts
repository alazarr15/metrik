import { NextResponse } from "next/server";
import { FacebookItemType } from "@prisma/client";
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
    const cleanId = rawId.trim();

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
    const limitParam = parseInt(url.searchParams.get("limit") || "25", 10);
    const limit = Number.isNaN(limitParam) ? 25 : Math.min(Math.max(limitParam, 1), 100);
    const rangeParam = url.searchParams.get("range");
    const typeParam = (url.searchParams.get("type") || "all").toLowerCase();

    let publishedFilter: { gte: Date; lt: Date } | undefined;
    if (rangeParam) {
      const { fromUtc, toUtc } = validateDateRange(null, null, rangeParam, page.timezone);
      publishedFilter = { gte: fromUtc, lt: toUtc };
    }

    const typeFilter =
      typeParam === "reels"
        ? FacebookItemType.REEL
        : typeParam === "posts"
        ? FacebookItemType.POST
        : undefined;

    const items = await prisma.facebookItem.findMany({
      where: {
        pageId: page.id,
        ...(publishedFilter ? { publishedAt: publishedFilter } : {}),
        ...(typeFilter ? { itemType: typeFilter } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      items: items.map((i) => ({
        id: i.id,
        facebookItemId: i.facebookItemId,
        itemType: i.itemType,
        message: i.message,
        permalinkUrl: i.permalinkUrl,
        publishedAt: i.publishedAt.toISOString(),
        viewsCount: i.viewsCount,
        reachCount: i.reachCount,
        reactionsCount: i.reactionsCount,
        commentsCount: i.commentsCount,
        sharesCount: i.sharesCount,
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
          message: "Failed to retrieve Facebook items.",
        },
      },
      { status: 500 }
    );
  }
}
