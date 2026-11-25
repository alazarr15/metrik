import { NextResponse } from "next/server";
import { validateApiAccess } from "@/server/auth/guard";
import { prisma } from "@/server/db/client";
import { findChannelByIdentifier } from "@/server/db/channel-queries";
import { ApiValidationError, validateDateRange } from "@/server/metrics/validation";
import { resolveExplicitPeriod, type PresetKey } from "@/server/metrics/timezone";
import { calculatePostsPublished } from "@/server/metrics/posts-published";
import { calculateLifetimeViews } from "@/server/metrics/lifetime-views";
import { calculateObservedViewsGrowth } from "@/server/metrics/views-growth";
import { getChannelCoverage } from "@/server/metrics/coverage";
import { MetricType } from "@prisma/client";

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
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const rangeParam = url.searchParams.get("range");

    // Validate date range using channel's configured timezone
    const { fromUtc, toUtc } = validateDateRange(
      fromParam,
      toParam,
      rangeParam,
      channel.timezone
    );

    const period = resolveExplicitPeriod(fromUtc, toUtc, channel.timezone);

    // Query channel posts for postsPublished calculation (including deleted posts)
    const allPosts = await prisma.post.findMany({
      where: { channelId: channel.id },
      select: {
        id: true,
        publishedAt: true,
        deletedAt: true,
      },
    });

    const postsPublished = calculatePostsPublished(
      allPosts,
      period.fromUtc,
      period.toUtc,
      channel.timezone,
      period.localFromDate,
      period.localToDate
    );

    // Query active non-deleted posts with views observations for lifetime views and growth
    const activePosts = await prisma.post.findMany({
      where: {
        channelId: channel.id,
        deletedAt: null,
      },
      include: {
        observations: {
          where: { metricType: MetricType.VIEWS },
          orderBy: { observedAt: "desc" },
        },
      },
    });

    // Calculate Lifetime Views
    const lifetimePosts = activePosts.map((p) => ({
      postId: p.id,
      latestViews: p.observations[0]
        ? {
            numericValue: p.observations[0].numericValue,
            precision: p.observations[0].precision,
          }
        : null,
    }));
    const lifetimeViews = calculateLifetimeViews(lifetimePosts);

    // Calculate Views on posts published within the selected filter period
    const periodActivePosts = activePosts.filter(
      (p) => p.publishedAt >= period.fromUtc && p.publishedAt < period.toUtc
    );
    const periodViewsPosts = periodActivePosts.map((p) => ({
      postId: p.id,
      latestViews: p.observations[0]
        ? {
            numericValue: p.observations[0].numericValue,
            precision: p.observations[0].precision,
          }
        : null,
    }));
    const periodViews = calculateLifetimeViews(periodViewsPosts);

    // Calculate Observed Views Growth
    const growthPosts = activePosts.map((p) => ({
      postId: p.id,
      observations: p.observations.map((o) => ({
        id: o.id,
        postId: o.postId,
        observedAt: o.observedAt,
        numericValue: o.numericValue,
        precision: o.precision,
      })),
    }));
    const observedViewsGrowth = calculateObservedViewsGrowth(
      growthPosts,
      period.fromUtc,
      period.toUtc,
      channel.timezone,
      period.localFromDate,
      period.localToDate
    );

    const coverage = await getChannelCoverage(channel.id);

    return NextResponse.json({
      period: {
        from: period.fromUtc.toISOString(),
        to: period.toUtc.toISOString(),
        timezone: period.timezone,
        localFromDate: period.localFromDate,
        localToDate: period.localToDate,
      },
      postsPublished,
      lifetimeViews,
      periodViews,
      observedViewsGrowth,
      reach: {
        status: "UNAVAILABLE",
        value: null,
        reason: "Reach is unavailable on Telegram broadcast channels",
      },
      coverage: coverage
        ? {
            isRangeAvailable: rangeParam
              ? coverage.rangeAvailability[rangeParam as PresetKey]?.isAvailable ?? true
              : true,
            reason: rangeParam
              ? coverage.rangeAvailability[rangeParam as PresetKey]?.reason
              : undefined,
            historicalCoverageDays: coverage.historicalCoverageDays,
            trackingStartDate: coverage.observationCoverage.trackingStartDate,
            latestObservationDate: coverage.observationCoverage.latestObservationDate,
            longestAvailablePreset: coverage.longestAvailablePreset,
            rangeAvailability: coverage.rangeAvailability,
          }
        : null,
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
          message: "Failed to compute channel analytics.",
        },
      },
      { status: 500 }
    );
  }
}
