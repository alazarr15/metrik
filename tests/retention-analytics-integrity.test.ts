import { describe, it, expect } from "vitest";
import { calculateObservedViewsGrowth, type PostWithViewsObservations } from "../src/server/metrics/views-growth.ts";
import { calculateLifetimeViews, type PostLatestViewsObservation } from "../src/server/metrics/lifetime-views.ts";
import { resolvePresetRange } from "../src/server/metrics/timezone.ts";

describe("Retention Analytics Integrity", () => {
  const TIMEZONE = "Africa/Addis_Ababa";
  const fixedRefDate = new Date("2026-11-24T12:00:00.000Z");

  // 60-day period
  const period60 = resolvePresetRange("60d", fixedRefDate, TIMEZONE);

  it("calculates exact 60-day observed views growth using the preserved baseline anchor", () => {
    // Post with 1 preserved anchor at Day -61 (before 60d period start) and 1 observation at Day -10
    // (Redundant observations at Day -80 and Day -70 were safely pruned)
    const postWithAnchor: PostWithViewsObservations = {
      postId: "p1",
      observations: [
        {
          id: "obs-anchor",
          postId: "p1",
          observedAt: new Date(period60.fromUtc.getTime() - 24 * 60 * 60 * 1000), // Day -61 (at/before fromUtc)
          numericValue: 150,
          precision: "EXACT",
        },
        {
          id: "obs-recent",
          postId: "p1",
          observedAt: new Date(period60.fromUtc.getTime() + 30 * 24 * 60 * 60 * 1000), // Day -30 (inside period)
          numericValue: 200,
          precision: "EXACT",
        },
      ],
    };

    const result = calculateObservedViewsGrowth(
      [postWithAnchor],
      period60.fromUtc,
      period60.toUtc,
      TIMEZONE,
      period60.localFromDate,
      period60.localToDate
    );

    // Baseline anchor successfully establishes O_base = 150
    // Comparison is O_curr = 200
    // Growth = 200 - 150 = 50
    expect(result.value).toBe(50);
    expect(result.isExact).toBe(true);
    expect(result.coverage.eligiblePostsCount).toBe(1);
    expect(result.coverage.excludedNoBaseline).toBe(0);
  });

  it("proves that pruning without anchor preservation would corrupt growth with EXCLUDED_NO_BASELINE", () => {
    // If the observation before period start had been naively deleted:
    const postWithoutAnchor: PostWithViewsObservations = {
      postId: "p1",
      observations: [
        {
          id: "obs-recent",
          postId: "p1",
          observedAt: new Date(period60.fromUtc.getTime() + 30 * 24 * 60 * 60 * 1000), // Only has inside-period obs
          numericValue: 200,
          precision: "EXACT",
        },
      ],
    };

    const corruptedResult = calculateObservedViewsGrowth(
      [postWithoutAnchor],
      period60.fromUtc,
      period60.toUtc,
      TIMEZONE,
      period60.localFromDate,
      period60.localToDate
    );

    // Without anchor, post has no baseline and growth is lost!
    expect(corruptedResult.value).toBeNull();
    expect(corruptedResult.coverage.excludedNoBaseline).toBe(1);
    expect(corruptedResult.coverage.eligiblePostsCount).toBe(0);
  });

  it("maintains lifetime views calculation for old posts with preserved anchor", () => {
    // Post only had observations before 60-day boundary; anchor was preserved
    const postLatest: PostLatestViewsObservation = {
      postId: "p-old",
      latestViews: {
        numericValue: 450,
        precision: "EXACT",
      },
    };

    const lifetime = calculateLifetimeViews([postLatest]);
    expect(lifetime.exactSum).toBe(450);
    expect(lifetime.totalEstimate).toBe(450);
    expect(lifetime.isExact).toBe(true);
    expect(lifetime.breakdown.exactPostsCount).toBe(1);
    expect(lifetime.breakdown.missingObservationPostsCount).toBe(0);
  });
});
