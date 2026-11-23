import { NextResponse } from "next/server";
import { validateApiAccess } from "@/server/auth/guard";
import { prisma } from "@/server/db/client";
import { findChannelByIdentifier, findPostByIdentifier } from "@/server/db/channel-queries";
import {
  ApiValidationError,
  parsePaginationLimit,
} from "@/server/metrics/validation";
import {
  decodeObservationsCursor,
  encodeObservationsCursor,
  buildObservationsKeysetWhere,
} from "@/server/metrics/pagination";
import { MetricType, Prisma } from "@prisma/client";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; postId: string }> }
) {
  const auth = validateApiAccess(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const { id: rawId, postId: rawPostId } = await context.params;

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

    const post = await findPostByIdentifier(channel.id, rawPostId);
    if (!post) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `Post "${rawPostId}" was not found in channel "${channel.telegramUsername}".`,
          },
        },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const limit = parsePaginationLimit(url.searchParams.get("limit"), 50, 200);
    const cursorParam = url.searchParams.get("cursor");
    const metricTypeParam = url.searchParams.get("metricType");

    const baseConditions: Prisma.PostMetricObservationWhereInput[] = [
      { postId: post.id },
    ];

    if (metricTypeParam && metricTypeParam.trim() !== "") {
      const normalizedMetricType = metricTypeParam.trim().toUpperCase();
      if (!Object.values(MetricType).includes(normalizedMetricType as MetricType)) {
        throw new ApiValidationError(
          "INVALID_METRIC_TYPE",
          `Invalid metricType: "${metricTypeParam}". Allowed values are VIEWS, REACTIONS, or COMMENTS.`
        );
      }
      baseConditions.push({ metricType: normalizedMetricType as MetricType });
    }

    const baseWhere: Prisma.PostMetricObservationWhereInput = { AND: baseConditions };
    const totalCount = await prisma.postMetricObservation.count({ where: baseWhere });

    const queryConditions: Prisma.PostMetricObservationWhereInput[] = [...baseConditions];
    if (cursorParam && cursorParam.trim() !== "") {
      const decodedCursor = decodeObservationsCursor(cursorParam.trim());
      queryConditions.push(buildObservationsKeysetWhere(decodedCursor));
    }

    const observations = await prisma.postMetricObservation.findMany({
      where: { AND: queryConditions },
      orderBy: [{ observedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = observations.length > limit;
    if (hasMore) {
      observations.pop();
    }

    const lastObs = observations.length > 0 ? observations[observations.length - 1] : null;
    const nextCursor = hasMore && lastObs ? encodeObservationsCursor(lastObs.observedAt, lastObs.id) : null;

    const formattedObservations = observations.map((o) => ({
      id: o.id,
      observedAt: o.observedAt.toISOString(),
      metricType: o.metricType,
      rawValue: o.rawValue,
      numericValue: o.numericValue,
      precision: o.precision,
    }));

    return NextResponse.json({
      postId: post.id,
      telegramMessageId: post.telegramMessageId,
      observations: formattedObservations,
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
          message: "Failed to retrieve post observations.",
        },
      },
      { status: 500 }
    );
  }
}
