import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../src/server/db/client.ts";
import {
  calculateRetentionBoundary,
  pruneHistoricalObservations,
  DEFAULT_RETENTION_DAYS,
} from "../src/server/db/retention-service.ts";
import { MetricType, MetricPrecision } from "@prisma/client";

describe("Rolling 60-Day Observation Retention Service", () => {
  const testChannelUsername = "test_retention_channel";
  let channelId: string;
  let post1Id: string;
  let post2Id: string;

  // Use a fixed reference date for tests: 2026-11-24 12:00:00 UTC
  const fixedRefDate = new Date("2026-11-24T12:00:00.000Z");
  // 60-day boundary for Africa/Addis_Ababa (UTC+03:00):
  // Today is 2026-11-24. 60 days covers 2026-09-26 to 2026-11-24.
  // Local start: 2026-09-26 00:00:00 EAT -> 2026-09-25 21:00:00 UTC
  const boundaryUtc = calculateRetentionBoundary(60, "Africa/Addis_Ababa", fixedRefDate);

  async function cleanupTestChannel() {
    const existingChannel = await prisma.channel.findUnique({
      where: { telegramUsername: testChannelUsername },
      include: { posts: { select: { id: true } } },
    });
    if (existingChannel) {
      const postIds = existingChannel.posts.map((p) => p.id);
      if (postIds.length > 0) {
        await prisma.postMetricObservation.deleteMany({
          where: { postId: { in: postIds } },
        });
        await prisma.post.deleteMany({
          where: { id: { in: postIds } },
        });
      }
      await prisma.syncRun.deleteMany({
        where: { channelId: existingChannel.id },
      });
      await prisma.channel.delete({
        where: { id: existingChannel.id },
      });
    }
  }

  beforeEach(async () => {
    // Clean up test channel if it exists
    await cleanupTestChannel();

    // Create test channel
    const channel = await prisma.channel.create({
      data: {
        telegramUsername: testChannelUsername,
        title: "Retention Test Channel",
        timezone: "Africa/Addis_Ababa",
      },
    });
    channelId = channel.id;

    // Create 2 posts
    const post1 = await prisma.post.create({
      data: {
        channelId,
        telegramMessageId: 1001,
        publishedAt: new Date("2026-09-01T10:00:00.000Z"),
        text: "Older Post 1",
      },
    });
    post1Id = post1.id;

    const post2 = await prisma.post.create({
      data: {
        channelId,
        telegramMessageId: 1002,
        publishedAt: new Date("2026-10-15T10:00:00.000Z"),
        text: "Recent Post 2",
      },
    });
    post2Id = post2.id;

    // Post 1 observations:
    // Obs A: 80 days ago (older redundant) -> SHOULD BE PRUNED
    // Obs B: 70 days ago (older redundant) -> SHOULD BE PRUNED
    // Obs C: 61 days ago (latest before 60-day boundary) -> SHOULD BE PRESERVED AS ANCHOR
    // Obs D: 30 days ago (inside 60-day window) -> SHOULD BE RETAINED
    const dayMs = 24 * 60 * 60 * 1000;
    const boundaryMs = boundaryUtc.getTime();

    await prisma.postMetricObservation.createMany({
      data: [
        {
          postId: post1Id,
          metricType: MetricType.VIEWS,
          numericValue: 100,
          rawValue: "100",
          precision: MetricPrecision.EXACT,
          observedAt: new Date(boundaryMs - 20 * dayMs), // Day -80
        },
        {
          postId: post1Id,
          metricType: MetricType.VIEWS,
          numericValue: 120,
          rawValue: "120",
          precision: MetricPrecision.EXACT,
          observedAt: new Date(boundaryMs - 10 * dayMs), // Day -70
        },
        {
          postId: post1Id,
          metricType: MetricType.VIEWS,
          numericValue: 150,
          rawValue: "150",
          precision: MetricPrecision.EXACT,
          observedAt: new Date(boundaryMs - 1 * dayMs), // Day -61 (ANCHOR)
        },
        {
          postId: post1Id,
          metricType: MetricType.VIEWS,
          numericValue: 200,
          rawValue: "200",
          precision: MetricPrecision.EXACT,
          observedAt: new Date(boundaryMs + 30 * dayMs), // Day -30 (INSIDE WINDOW)
        },
      ],
    });

    // Post 2 observations:
    // All inside the 60-day window -> ALL SHOULD BE RETAINED
    await prisma.postMetricObservation.createMany({
      data: [
        {
          postId: post2Id,
          metricType: MetricType.VIEWS,
          numericValue: 50,
          rawValue: "50",
          precision: MetricPrecision.EXACT,
          observedAt: new Date(boundaryMs + 10 * dayMs),
        },
        {
          postId: post2Id,
          metricType: MetricType.VIEWS,
          numericValue: 80,
          rawValue: "80",
          precision: MetricPrecision.EXACT,
          observedAt: new Date(boundaryMs + 20 * dayMs),
        },
      ],
    });

    // Create a SyncRun record to ensure SyncRuns are never deleted during pruning
    await prisma.syncRun.create({
      data: {
        channelId,
        startedAt: new Date(boundaryMs - 50 * dayMs),
        finishedAt: new Date(boundaryMs - 50 * dayMs + 5000),
        status: "SUCCESS",
        pagesFetched: 2,
        postsFetched: 10,
      },
    });
  });

  afterEach(async () => {
    await cleanupTestChannel();
  });

  describe("calculateRetentionBoundary", () => {
    it("calculates exact start-of-day UTC boundary for Africa/Addis_Ababa", () => {
      const boundary = calculateRetentionBoundary(DEFAULT_RETENTION_DAYS, "Africa/Addis_Ababa", fixedRefDate);
      expect(boundary.toISOString()).toBe("2026-09-25T21:00:00.000Z");
    });
  });

  describe("pruneHistoricalObservations", () => {
    it("prunes redundant observations before boundary while preserving the latest anchor", async () => {
      const result = await pruneHistoricalObservations({
        channelUsername: testChannelUsername,
        retentionDays: 60,
        referenceDateUtc: fixedRefDate,
      });

      expect(result.channelsProcessed).toBe(1);
      // Post 1 had 3 observations before boundary. 1 is anchor, 2 are redundant.
      expect(result.totalObservationsExamined).toBe(3);
      expect(result.totalAnchorsPreserved).toBe(1);
      expect(result.totalObservationsPruned).toBe(2);

      // Verify remaining observations for Post 1
      const post1Obs = await prisma.postMetricObservation.findMany({
        where: { postId: post1Id },
        orderBy: { observedAt: "asc" },
      });

      // Should have 2 observations left: Day -61 (anchor) and Day -30 (inside window)
      expect(post1Obs.length).toBe(2);
      expect(post1Obs[0].numericValue).toBe(150); // Anchor
      expect(post1Obs[1].numericValue).toBe(200); // Inside window

      // Post 2 observations should be completely untouched (2 inside window)
      const post2Obs = await prisma.postMetricObservation.findMany({
        where: { postId: post2Id },
      });
      expect(post2Obs.length).toBe(2);
    });

    it("is completely idempotent when rerun immediately", async () => {
      // First run: prunes 2 redundant observations
      const firstRun = await pruneHistoricalObservations({
        channelUsername: testChannelUsername,
        retentionDays: 60,
        referenceDateUtc: fixedRefDate,
      });
      expect(firstRun.totalObservationsPruned).toBe(2);

      // Second run: 0 observations pruned
      const secondRun = await pruneHistoricalObservations({
        channelUsername: testChannelUsername,
        retentionDays: 60,
        referenceDateUtc: fixedRefDate,
      });
      expect(secondRun.totalObservationsPruned).toBe(0);
      expect(secondRun.totalAnchorsPreserved).toBe(1);
    });

    it("never deletes posts, channels, or SyncRun audit records", async () => {
      await pruneHistoricalObservations({
        channelUsername: testChannelUsername,
        retentionDays: 60,
        referenceDateUtc: fixedRefDate,
      });

      // Verify Channel exists
      const ch = await prisma.channel.findUnique({
        where: { id: channelId },
      });
      expect(ch).not.toBeNull();

      // Verify Posts exist (both old Post 1 and recent Post 2)
      const postsCount = await prisma.post.count({
        where: { channelId },
      });
      expect(postsCount).toBe(2);

      // Verify SyncRun exists
      const syncRunCount = await prisma.syncRun.count({
        where: { channelId },
      });
      expect(syncRunCount).toBe(1);
    });

    it("preserves single lifetime observation when post has no observations inside window", async () => {
      // Create a 3rd post with only 1 observation before boundary
      const post3 = await prisma.post.create({
        data: {
          channelId,
          telegramMessageId: 1003,
          publishedAt: new Date("2026-08-01T10:00:00.000Z"),
          text: "Very Old Post 3",
        },
      });

      await prisma.postMetricObservation.create({
        data: {
          postId: post3.id,
          metricType: MetricType.VIEWS,
          numericValue: 42,
          rawValue: "42",
          precision: MetricPrecision.EXACT,
          observedAt: new Date(boundaryUtc.getTime() - 40 * 24 * 60 * 60 * 1000), // 40 days before boundary
        },
      });

      const result = await pruneHistoricalObservations({
        channelUsername: testChannelUsername,
        retentionDays: 60,
        referenceDateUtc: fixedRefDate,
      });
      expect(result.channelSummaries[0]?.channelId).toBe(channelId);

      // Post 3's lone observation must be preserved as its lifetime anchor
      const post3Obs = await prisma.postMetricObservation.findMany({
        where: { postId: post3.id },
      });
      expect(post3Obs.length).toBe(1);
      expect(post3Obs[0].numericValue).toBe(42);
    });
  });
});
