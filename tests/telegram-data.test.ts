import { describe, it, expect } from "vitest";
import {
  normalizeTelegramPost,
  filterPostsByDateRange,
  summarizePostMetrics,
  type RawTelegramMessage,
} from "../src/lib/telegram-data";

describe("telegram-data metrics normalization and filtering", () => {
  it("preserves true zero views and distinguishes from missing views", () => {
    const postWithZero: RawTelegramMessage = {
      id: 101,
      date: 1700000000,
      views: 0,
      post: true,
    };
    const postWithMissing: RawTelegramMessage = {
      id: 102,
      date: 1700000000,
      views: undefined,
      post: true,
    };
    const postWithNull: RawTelegramMessage = {
      id: 103,
      date: 1700000000,
      views: null,
      post: true,
    };

    const normZero = normalizeTelegramPost(postWithZero);
    const normMissing = normalizeTelegramPost(postWithMissing);
    const normNull = normalizeTelegramPost(postWithNull);

    expect(normZero.views).toBe(0);
    expect(normMissing.views).toBeNull();
    expect(normNull.views).toBeNull();
  });

  it("normalizes publish timestamps to ISO UTC", () => {
    const raw: RawTelegramMessage = {
      id: 200,
      date: 1704067200, // 2024-01-01T00:00:00.000Z
      views: 45,
      post: true,
    };

    const normalized = normalizeTelegramPost(raw);
    expect(normalized.publishedAtUtc).toBe("2024-01-01T00:00:00.000Z");
    expect(normalized.publishedTimestamp).toBe(1704067200000);
  });

  it("filters posts by range strictly with inclusive start and exclusive end [start, end)", () => {
    const p1 = normalizeTelegramPost({ id: 1, date: 100, views: 10 });
    const p2 = normalizeTelegramPost({ id: 2, date: 200, views: 20 });
    const p3 = normalizeTelegramPost({ id: 3, date: 300, views: 30 });

    const posts = [p1, p2, p3];

    // Range [100000ms, 300000ms) -> includes p1 (100s) and p2 (200s), excludes p3 (300s)
    const result = filterPostsByDateRange(posts, new Date(100000), new Date(300000));
    expect(result.map((p) => p.id)).toEqual([1, 2]);

    // Range [200000ms, 200000ms) -> empty range
    const emptyResult = filterPostsByDateRange(posts, new Date(200000), new Date(200000));
    expect(emptyResult).toHaveLength(0);
  });

  it("summarizes metrics correctly and flags missing views as null total", () => {
    const completePosts = [
      normalizeTelegramPost({ id: 1, date: 100, views: 10 }),
      normalizeTelegramPost({ id: 2, date: 200, views: 25 }),
      normalizeTelegramPost({ id: 3, date: 300, views: 0 }),
    ];

    const completeSummary = summarizePostMetrics(completePosts);
    expect(completeSummary.totalPosts).toBe(3);
    expect(completeSummary.postsWithMissingViews).toBe(0);
    expect(completeSummary.totalLifetimeViewsOfPosts).toBe(35);

    const incompletePosts = [
      normalizeTelegramPost({ id: 1, date: 100, views: 10 }),
      normalizeTelegramPost({ id: 2, date: 200, views: undefined }),
    ];

    const incompleteSummary = summarizePostMetrics(incompletePosts);
    expect(incompleteSummary.totalPosts).toBe(2);
    expect(incompleteSummary.postsWithMissingViews).toBe(1);
    expect(incompleteSummary.totalLifetimeViewsOfPosts).toBeNull();
  });
});
