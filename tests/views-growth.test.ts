import { describe, it, expect } from "vitest";
import {
  calculateObservedViewsGrowth,
  type PostWithViewsObservations,
} from "../src/server/metrics/views-growth.ts";

describe("Observed Views Growth Algorithm", () => {
  const TIMEZONE = "Africa/Addis_Ababa";
  // Query interval: [2026-11-20T21:00:00Z, 2026-11-23T21:00:00Z)
  // Local dates in Addis Ababa: 2026-11-21 to 2026-11-23
  const fromUtc = new Date("2026-11-20T21:00:00.000Z");
  const toUtc = new Date("2026-11-23T21:00:00.000Z");
  const localFromDate = "2026-11-21";
  const localToDate = "2026-11-23";

  it("excludes posts with no baseline at or before period start", () => {
    const post: PostWithViewsObservations = {
      postId: "p1",
      observations: [
        {
          id: "obs-1",
          postId: "p1",
          observedAt: new Date("2026-11-21T06:00:00.000Z"), // Inside period, not at/before start
          numericValue: 100,
          precision: "EXACT",
        },
      ],
    };

    const result = calculateObservedViewsGrowth(
      [post],
      fromUtc,
      toUtc,
      TIMEZONE,
      localFromDate,
      localToDate
    );

    expect(result.value).toBe(null);
    expect(result.isExact).toBe(false);
    expect(result.coverage.eligiblePostsCount).toBe(0);
    expect(result.coverage.excludedNoBaseline).toBe(1);
    // Initial observation on 2026-11-21 establishes baseline only
    const day21 = result.daily.find((d) => d.date === "2026-11-21");
    expect(day21?.observedGrowth).toBe(null);
    expect(day21?.reason).toBe("Baseline establishment only");
  });

  it("excludes posts with baseline but no subsequent observation inside period", () => {
    const post: PostWithViewsObservations = {
      postId: "p1",
      observations: [
        {
          id: "obs-1",
          postId: "p1",
          observedAt: new Date("2026-11-20T12:00:00.000Z"), // Baseline (before fromUtc)
          numericValue: 100,
          precision: "EXACT",
        },
      ],
    };

    const result = calculateObservedViewsGrowth(
      [post],
      fromUtc,
      toUtc,
      TIMEZONE,
      localFromDate,
      localToDate
    );

    expect(result.value).toBe(null);
    expect(result.coverage.excludedNoSubsequentObservation).toBe(1);
    expect(result.coverage.eligiblePostsCount).toBe(0);
  });

  it("excludes posts if any intermediate observation in trajectory is ROUNDED or UNAVAILABLE", () => {
    const post: PostWithViewsObservations = {
      postId: "p1",
      observations: [
        {
          id: "obs-0",
          postId: "p1",
          observedAt: new Date("2026-11-20T12:00:00.000Z"), // Baseline (EXACT)
          numericValue: 900,
          precision: "EXACT",
        },
        {
          id: "obs-1",
          postId: "p1",
          observedAt: new Date("2026-11-21T12:00:00.000Z"), // Intermediate (ROUNDED 1.1K)
          numericValue: 1100,
          precision: "ROUNDED",
        },
        {
          id: "obs-2",
          postId: "p1",
          observedAt: new Date("2026-11-22T12:00:00.000Z"), // Comparison (EXACT)
          numericValue: 1200,
          precision: "EXACT",
        },
      ],
    };

    const result = calculateObservedViewsGrowth(
      [post],
      fromUtc,
      toUtc,
      TIMEZONE,
      localFromDate,
      localToDate
    );

    expect(result.value).toBe(null);
    expect(result.coverage.excludedRoundedOrUnavailable).toBe(1);
    expect(result.coverage.eligiblePostsCount).toBe(0);
  });

  it("detects and isolates intermediate negative delta anomalies even when net delta is positive", () => {
    // Sequence: 100 -> 80 -> 120
    // Net: 120 - 100 = +20
    // But consecutive transition 100 -> 80 is -20 (anomaly!)
    const post: PostWithViewsObservations = {
      postId: "p1",
      observations: [
        {
          id: "obs-0",
          postId: "p1",
          observedAt: new Date("2026-11-20T12:00:00.000Z"), // Baseline 100
          numericValue: 100,
          precision: "EXACT",
        },
        {
          id: "obs-1",
          postId: "p1",
          observedAt: new Date("2026-11-21T12:00:00.000Z"), // Dropped to 80
          numericValue: 80,
          precision: "EXACT",
        },
        {
          id: "obs-2",
          postId: "p1",
          observedAt: new Date("2026-11-22T12:00:00.000Z"), // Rose to 120
          numericValue: 120,
          precision: "EXACT",
        },
      ],
    };

    const result = calculateObservedViewsGrowth(
      [post],
      fromUtc,
      toUtc,
      TIMEZONE,
      localFromDate,
      localToDate
    );

    // Strict Invariant: Net positive delta must never hide intermediate decrease.
    // Post must be classified as EXCLUDED_NEGATIVE_DELTA and excluded from growth sum.
    expect(result.value).toBe(null);
    expect(result.coverage.excludedNegativeDelta).toBe(1);
    expect(result.coverage.eligiblePostsCount).toBe(0);
  });

  it("calculates exact growth and attributes daily increments for eligible uninterrupted posts", () => {
    const post: PostWithViewsObservations = {
      postId: "p1",
      observations: [
        {
          id: "obs-0",
          postId: "p1",
          observedAt: new Date("2026-11-20T12:00:00.000Z"), // Baseline: 100
          numericValue: 100,
          precision: "EXACT",
        },
        {
          id: "obs-1",
          postId: "p1",
          observedAt: new Date("2026-11-21T12:00:00.000Z"), // 185 (+85 on Nov 21)
          numericValue: 185,
          precision: "EXACT",
        },
        {
          id: "obs-2",
          postId: "p1",
          observedAt: new Date("2026-11-22T12:00:00.000Z"), // 245 (+60 on Nov 22)
          numericValue: 245,
          precision: "EXACT",
        },
      ],
    };

    const result = calculateObservedViewsGrowth(
      [post],
      fromUtc,
      toUtc,
      TIMEZONE,
      localFromDate,
      localToDate
    );

    expect(result.value).toBe(145); // 245 - 100 = 145
    expect(result.isExact).toBe(true);
    expect(result.coverage.eligiblePostsCount).toBe(1);

    const day21 = result.daily.find((d) => d.date === "2026-11-21");
    expect(day21?.observedGrowth).toBe(85);
    expect(day21?.isExact).toBe(true);

    const day22 = result.daily.find((d) => d.date === "2026-11-22");
    expect(day22?.observedGrowth).toBe(60);
    expect(day22?.isExact).toBe(true);

    const day23 = result.daily.find((d) => d.date === "2026-11-23");
    expect(day23?.observedGrowth).toBe(null);
    expect(day23?.reason).toBe("No sync event recorded");
  });
});
