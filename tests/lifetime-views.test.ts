import { describe, it, expect } from "vitest";
import {
  calculateLifetimeViews,
  type PostLatestViewsObservation,
} from "../src/server/metrics/lifetime-views.ts";

describe("Lifetime Views Aggregation", () => {
  it("calculates exact sum and marks isExact = true when 100% of observations are EXACT", () => {
    const posts: PostLatestViewsObservation[] = [
      {
        postId: "p1",
        latestViews: { numericValue: 161, precision: "EXACT" },
      },
      {
        postId: "p2",
        latestViews: { numericValue: 250, precision: "EXACT" },
      },
      {
        postId: "p3",
        latestViews: { numericValue: 89, precision: "EXACT" },
      },
    ];

    const result = calculateLifetimeViews(posts);
    expect(result.exactSum).toBe(500);
    expect(result.roundedEstimate).toBe(0);
    expect(result.totalEstimate).toBe(500);
    expect(result.isExact).toBe(true);
    expect(result.breakdown).toEqual({
      totalPosts: 3,
      exactPostsCount: 3,
      roundedPostsCount: 0,
      unavailablePostsCount: 0,
      missingObservationPostsCount: 0,
    });
  });

  it("marks isExact = false if even a single post has a ROUNDED counter", () => {
    const posts: PostLatestViewsObservation[] = [
      {
        postId: "p1",
        latestViews: { numericValue: 161, precision: "EXACT" },
      },
      {
        postId: "p2",
        latestViews: { numericValue: 1200, precision: "ROUNDED" }, // 1.2K
      },
    ];

    const result = calculateLifetimeViews(posts);
    expect(result.exactSum).toBe(161);
    expect(result.roundedEstimate).toBe(1200);
    expect(result.totalEstimate).toBe(1361);
    expect(result.isExact).toBe(false);
    expect(result.breakdown.exactPostsCount).toBe(1);
    expect(result.breakdown.roundedPostsCount).toBe(1);
  });

  it("never converts missing or unavailable counters to 0", () => {
    const posts: PostLatestViewsObservation[] = [
      {
        postId: "p1",
        latestViews: { numericValue: 100, precision: "EXACT" },
      },
      {
        postId: "p2",
        latestViews: { numericValue: null, precision: "UNAVAILABLE" },
      },
      {
        postId: "p3",
        latestViews: null, // missing observation row
      },
    ];

    const result = calculateLifetimeViews(posts);
    expect(result.exactSum).toBe(100);
    expect(result.roundedEstimate).toBe(0);
    expect(result.totalEstimate).toBe(100);
    expect(result.isExact).toBe(false); // Because 2 posts are not EXACT
    expect(result.breakdown.unavailablePostsCount).toBe(1);
    expect(result.breakdown.missingObservationPostsCount).toBe(1);
  });

  it("handles empty post list cleanly", () => {
    const result = calculateLifetimeViews([]);
    expect(result.exactSum).toBe(0);
    expect(result.roundedEstimate).toBe(0);
    expect(result.totalEstimate).toBe(0);
    expect(result.isExact).toBe(true);
    expect(result.breakdown.totalPosts).toBe(0);
  });
});
