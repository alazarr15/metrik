import { NextResponse } from "next/server";
import { validateApiAccess } from "@/server/auth/guard";
import { prisma } from "@/server/db/client";
import { findChannelByIdentifier } from "@/server/db/channel-queries";
import {
  ApiValidationError,
  parsePaginationLimit,
  parseBooleanParam,
} from "@/server/metrics/validation";
import {
  decodePostsCursor,
  encodePostsCursor,
  buildPostsKeysetWhere,
} from "@/server/metrics/pagination";
import { MetricType, Prisma } from "@prisma/client";

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

    const url = new URL(request.url);
    const limit = parsePaginationLimit(url.searchParams.get("limit"), 20, 100);
    const includeDeleted = parseBooleanParam(url.searchParams.get("includeDeleted"), false);
    const cursorParam = url.searchParams.get("cursor");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    // Base filter conditions
    const baseConditions: Prisma.PostWhereInput[] = [{ channelId: channel.id }];

    if (!includeDeleted) {
      baseConditions.push({ deletedAt: null });
    }

    if (fromParam || toParam) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (fromParam) {
        const fromDate = new Date(fromParam.trim());
        if (Number.isNaN(fromDate.getTime())) {
          throw new ApiValidationError("INVALID_DATE_FORMAT", `Invalid 'from' timestamp: "${fromParam}".`);
        }
        dateFilter.gte = fromDate;
      }
      if (toParam) {
        const toDate = new Date(toParam.trim());
        if (Number.isNaN(toDate.getTime())) {
          throw new ApiValidationError("INVALID_DATE_FORMAT", `Invalid 'to' timestamp: "${toParam}".`);
        }
        dateFilter.lt = toDate;
      }
      if (fromParam && toParam) {
        const fromDate = new Date(fromParam.trim());
        const toDate = new Date(toParam.trim());
        if (fromDate.getTime() >= toDate.getTime()) {
          throw new ApiValidationError("INVALID_DATE_RANGE", "'from' timestamp must strictly precede 'to' timestamp.");
        }
      }
      baseConditions.push({ publishedAt: dateFilter });
    }

    const baseWhere: Prisma.PostWhereInput = { AND: baseConditions };

    // Total count of matching records (excluding cursor predicate)
    const totalCount = await prisma.post.count({ where: baseWhere });

    // Build query with keyset cursor if supplied
    const queryConditions: Prisma.PostWhereInput[] = [...baseConditions];
    if (cursorParam && cursorParam.trim() !== "") {
      const decodedCursor = decodePostsCursor(cursorParam.trim());
      queryConditions.push(buildPostsKeysetWhere(decodedCursor));
    }

    const posts = await prisma.post.findMany({
      where: { AND: queryConditions },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        observations: {
          orderBy: { observedAt: "desc" },
        },
        _count: {
          select: { observations: true },
        },
      },
    });

    const hasMore = posts.length > limit;
    if (hasMore) {
      posts.pop();
    }

    const lastPost = posts.length > 0 ? posts[posts.length - 1] : null;
    const nextCursor = hasMore && lastPost ? encodePostsCursor(lastPost.publishedAt, lastPost.id) : null;

    const formattedPosts = posts.map((post) => {
      const viewsObs = post.observations.find((o) => o.metricType === MetricType.VIEWS);
      const reactionsObs = post.observations.find((o) => o.metricType === MetricType.REACTIONS);
      const commentsObs = post.observations.find((o) => o.metricType === MetricType.COMMENTS);

      return {
        id: post.id,
        telegramMessageId: post.telegramMessageId,
        publishedAt: post.publishedAt.toISOString(),
        text: post.text,
        deletedAt: post.deletedAt ? post.deletedAt.toISOString() : null,
        metrics: {
          views: {
            rawValue: viewsObs ? viewsObs.rawValue : null,
            numericValue: viewsObs ? viewsObs.numericValue : null,
            precision: viewsObs ? viewsObs.precision : "UNAVAILABLE",
            observedAt: viewsObs ? viewsObs.observedAt.toISOString() : null,
          },
          reactions: {
            rawValue: reactionsObs ? reactionsObs.rawValue : null,
            numericValue: reactionsObs ? reactionsObs.numericValue : null,
            precision: reactionsObs ? reactionsObs.precision : "UNAVAILABLE",
            observedAt: reactionsObs ? reactionsObs.observedAt.toISOString() : null,
          },
          comments: {
            rawValue: commentsObs ? commentsObs.rawValue : null,
            numericValue: commentsObs ? commentsObs.numericValue : null,
            precision: commentsObs ? commentsObs.precision : "UNAVAILABLE",
            observedAt: commentsObs ? commentsObs.observedAt.toISOString() : null,
          },
        },
        observationsCount: post._count.observations,
      };
    });

    return NextResponse.json({
      posts: formattedPosts,
      pagination: {
        nextCursor,
        hasMore,
        totalCount,
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
          message: "Failed to retrieve channel posts.",
        },
      },
      { status: 500 }
    );
  }
}
