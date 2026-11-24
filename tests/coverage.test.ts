import { describe, it, expect } from "vitest";
import {
  evaluateChannelCoverage,
  getChannelCoverage,
  calendarDayDifference,
  subtractDaysFromLocalDate,
  type RawCoverageData,
} from "../src/server/metrics/coverage.ts";
import { prisma } from "../src/server/db/client.ts";

describe("Phase 7: Data-Aware Analytics Coverage & Range Availability", () => {
  const TIMEZONE_EAT = "Africa/Addis_Ababa";
  // Reference date: 2026-11-24 12:00:00 UTC (15:00:00 EAT)
  const refDateUtc = new Date("2026-11-24T12:00:00.000Z");

  describe("Helper Functions: calendarDayDifference & subtractDaysFromLocalDate", () => {
    it("calculates exact calendar day differences regardless of daylight saving time", () => {
      expect(calendarDayDifference("2026-11-17", "2026-11-24")).toBe(7);
      expect(calendarDayDifference("2026-11-24", "2026-11-24")).toBe(0);
      expect(calendarDayDifference("2026-11-24", "2026-11-17")).toBe(-7);
      expect(calendarDayDifference("2026-10-25", "2026-11-24")).toBe(30);
    });

    it("subtracts days accurately across month and year boundaries", () => {
      expect(subtractDaysFromLocalDate("2026-11-24", 6)).toBe("2026-11-18");
      expect(subtractDaysFromLocalDate("2026-11-24", 7)).toBe("2026-11-17");
      expect(subtractDaysFromLocalDate("2026-11-01", 1)).toBe("2026-10-31");
      expect(subtractDaysFromLocalDate("2026-01-02", 5)).toBe("2025-12-28");
    });
  });

  describe("Initial 7-Day Baseline Coverage (Nov 17–24, 2026)", () => {
    it("enables 1D, 5D, 7D and disables 15D, 30D, 60D for the initial 7-day baseline dataset", () => {
      // Simulating a channel synced with initial 7-day collection
      // Posts exist back to 2026-11-17 (and Nov 13)
      // First sync on 2026-11-23, latest sync on 2026-11-24
      const initialBaselineData: RawCoverageData = {
        channelId: "ch-initial",
        telegramUsername: "testchannel",
        timezone: TIMEZONE_EAT,
        referenceDateUtc: refDateUtc,
        posts: [
          { id: "p1", publishedAt: new Date("2026-11-13T16:00:00.000Z"), deletedAt: null },
          { id: "p2", publishedAt: new Date("2026-11-17T17:00:00.000Z"), deletedAt: null },
          { id: "p3", publishedAt: new Date("2026-11-18T16:00:00.000Z"), deletedAt: null },
          { id: "p4", publishedAt: new Date("2026-11-19T18:00:00.000Z"), deletedAt: null },
          { id: "p5", publishedAt: new Date("2026-11-23T16:00:00.000Z"), deletedAt: null },
        ],
        observations: [
          { id: "o1", observedAt: new Date("2026-11-23T15:52:00.000Z"), metricType: "VIEWS" },
          { id: "o2", observedAt: new Date("2026-11-24T09:57:00.000Z"), metricType: "VIEWS" },
        ],
        syncRuns: [
          { id: "s1", startedAt: new Date("2026-11-23T15:52:00.000Z"), finishedAt: new Date("2026-11-23T15:52:05.000Z"), status: "SUCCESS" },
          { id: "s2", startedAt: new Date("2026-11-24T09:57:00.000Z"), finishedAt: new Date("2026-11-24T09:57:05.000Z"), status: "SUCCESS" },
        ],
      };

      const result = evaluateChannelCoverage(initialBaselineData);

      expect(result.todayLocalDate).toBe("2026-11-24");
      expect(result.historicalCoverageDays).toBe(8); // Nov 17 to Nov 24 inclusive = 8 days
      expect(result.longestAvailablePreset).toBe("7d");

      // 1D, 5D, 7D are available
      expect(result.rangeAvailability["1d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["5d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["7d"].isAvailable).toBe(true);

      // 15D, 30D, 60D are unavailable with clean explanatory reason
      expect(result.rangeAvailability["15d"].isAvailable).toBe(false);
      expect(result.rangeAvailability["15d"].reason).toBe("Available after 15 days of recorded history.");

      expect(result.rangeAvailability["30d"].isAvailable).toBe(false);
      expect(result.rangeAvailability["30d"].reason).toBe("Available after 30 days of recorded history.");

      expect(result.rangeAvailability["60d"].isAvailable).toBe(false);
      expect(result.rangeAvailability["60d"].reason).toBe("Available after 60 days of recorded history.");
    });
  });

  describe("History Accumulation over Time (15, 30, and 60 days)", () => {
    it("automatically enables 15D once 15 calendar days of history have accumulated", () => {
      // 15 days after baseline start: 2026-12-02
      const date15 = new Date("2026-12-02T12:00:00.000Z");
      const data15Days: RawCoverageData = {
        channelId: "ch-15d",
        telegramUsername: "testchannel",
        timezone: TIMEZONE_EAT,
        referenceDateUtc: date15,
        posts: [
          { id: "p1", publishedAt: new Date("2026-11-17T17:00:00.000Z"), deletedAt: null },
          { id: "p2", publishedAt: new Date("2026-12-02T10:00:00.000Z"), deletedAt: null },
        ],
        observations: [
          { id: "o1", observedAt: new Date("2026-11-23T15:52:00.000Z"), metricType: "VIEWS" },
          { id: "o2", observedAt: new Date("2026-12-02T10:00:00.000Z"), metricType: "VIEWS" },
        ],
        syncRuns: [
          { id: "s1", startedAt: new Date("2026-11-23T15:52:00.000Z"), finishedAt: new Date("2026-11-23T15:52:05.000Z"), status: "SUCCESS" },
          { id: "s2", startedAt: new Date("2026-12-02T10:00:00.000Z"), finishedAt: new Date("2026-12-02T10:00:05.000Z"), status: "SUCCESS" },
        ],
      };

      const result = evaluateChannelCoverage(data15Days);

      expect(result.todayLocalDate).toBe("2026-12-02");
      expect(result.historicalCoverageDays).toBe(16); // Nov 17 to Dec 02 = 16 days
      expect(result.longestAvailablePreset).toBe("15d");

      expect(result.rangeAvailability["1d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["5d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["7d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["15d"].isAvailable).toBe(true);

      // 30D and 60D remain unavailable
      expect(result.rangeAvailability["30d"].isAvailable).toBe(false);
      expect(result.rangeAvailability["60d"].isAvailable).toBe(false);
    });

    it("automatically enables 30D once 30 calendar days of history have accumulated", () => {
      // 30 days after baseline start: 2026-12-17
      const date30 = new Date("2026-12-17T12:00:00.000Z");
      const data30Days: RawCoverageData = {
        channelId: "ch-30d",
        telegramUsername: "testchannel",
        timezone: TIMEZONE_EAT,
        referenceDateUtc: date30,
        posts: [
          { id: "p1", publishedAt: new Date("2026-11-17T17:00:00.000Z"), deletedAt: null },
          { id: "p2", publishedAt: new Date("2026-12-17T10:00:00.000Z"), deletedAt: null },
        ],
        observations: [
          { id: "o1", observedAt: new Date("2026-11-23T15:52:00.000Z"), metricType: "VIEWS" },
          { id: "o2", observedAt: new Date("2026-12-17T10:00:00.000Z"), metricType: "VIEWS" },
        ],
        syncRuns: [
          { id: "s1", startedAt: new Date("2026-11-23T15:52:00.000Z"), finishedAt: new Date("2026-11-23T15:52:05.000Z"), status: "SUCCESS" },
          { id: "s2", startedAt: new Date("2026-12-17T10:00:00.000Z"), finishedAt: new Date("2026-12-17T10:00:05.000Z"), status: "SUCCESS" },
        ],
      };

      const result = evaluateChannelCoverage(data30Days);

      expect(result.historicalCoverageDays).toBe(31);
      expect(result.longestAvailablePreset).toBe("30d");

      expect(result.rangeAvailability["1d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["5d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["7d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["15d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["30d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["60d"].isAvailable).toBe(false);
    });

    it("automatically enables all 6 presets (including 60D) once 60 calendar days of history have accumulated", () => {
      // 60 days after baseline start: 2027-01-16
      const date60 = new Date("2027-01-16T12:00:00.000Z");
      const data60Days: RawCoverageData = {
        channelId: "ch-60d",
        telegramUsername: "testchannel",
        timezone: TIMEZONE_EAT,
        referenceDateUtc: date60,
        posts: [
          { id: "p1", publishedAt: new Date("2026-11-17T17:00:00.000Z"), deletedAt: null },
          { id: "p2", publishedAt: new Date("2027-01-16T10:00:00.000Z"), deletedAt: null },
        ],
        observations: [
          { id: "o1", observedAt: new Date("2026-11-23T15:52:00.000Z"), metricType: "VIEWS" },
          { id: "o2", observedAt: new Date("2027-01-16T10:00:00.000Z"), metricType: "VIEWS" },
        ],
        syncRuns: [
          { id: "s1", startedAt: new Date("2026-11-23T15:52:00.000Z"), finishedAt: new Date("2026-11-23T15:52:05.000Z"), status: "SUCCESS" },
          { id: "s2", startedAt: new Date("2027-01-16T10:00:00.000Z"), finishedAt: new Date("2027-01-16T10:00:05.000Z"), status: "SUCCESS" },
        ],
      };

      const result = evaluateChannelCoverage(data60Days);

      expect(result.historicalCoverageDays).toBe(61);
      expect(result.longestAvailablePreset).toBe("60d");

      expect(result.rangeAvailability["1d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["5d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["7d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["15d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["30d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["60d"].isAvailable).toBe(true);
    });
  });

  describe("Edge Cases: Missing Observations, Failed Syncs, and Incomplete Sync", () => {
    it("disables all ranges when channel has posts but ZERO metric observations", () => {
      const dataNoObs: RawCoverageData = {
        channelId: "ch-no-obs",
        telegramUsername: "testchannel",
        timezone: TIMEZONE_EAT,
        referenceDateUtc: refDateUtc,
        posts: [
          { id: "p1", publishedAt: new Date("2026-11-20T10:00:00.000Z"), deletedAt: null },
        ],
        observations: [], // No observations recorded
        syncRuns: [
          { id: "s1", startedAt: new Date("2026-11-24T10:00:00.000Z"), finishedAt: new Date("2026-11-24T10:00:05.000Z"), status: "SUCCESS" },
        ],
      };

      const result = evaluateChannelCoverage(dataNoObs);

      expect(result.historicalCoverageDays).toBe(0);
      expect(result.longestAvailablePreset).toBeNull();
      expect(result.observationCoverage.hasMetricObservations).toBe(false);

      for (const preset of ["1d", "5d", "7d", "15d", "30d", "60d"] as const) {
        expect(result.rangeAvailability[preset].isAvailable).toBe(false);
        expect(result.rangeAvailability[preset].reason).toBe("No metric observations recorded yet.");
      }
    });

    it("disables all ranges when channel has no successful sync runs", () => {
      const dataFailedSync: RawCoverageData = {
        channelId: "ch-failed-sync",
        telegramUsername: "testchannel",
        timezone: TIMEZONE_EAT,
        referenceDateUtc: refDateUtc,
        posts: [
          { id: "p1", publishedAt: new Date("2026-11-20T10:00:00.000Z"), deletedAt: null },
        ],
        observations: [
          { id: "o1", observedAt: new Date("2026-11-24T10:00:00.000Z"), metricType: "VIEWS" },
        ],
        syncRuns: [
          { id: "s1", startedAt: new Date("2026-11-24T10:00:00.000Z"), finishedAt: null, status: "FAILED" },
        ],
      };

      const result = evaluateChannelCoverage(dataFailedSync);

      expect(result.historicalCoverageDays).toBe(0);
      expect(result.longestAvailablePreset).toBeNull();

      for (const preset of ["1d", "5d", "7d", "15d", "30d", "60d"] as const) {
        expect(result.rangeAvailability[preset].isAvailable).toBe(false);
        expect(result.rangeAvailability[preset].reason).toBe("No successful synchronization recorded.");
      }
    });

    it("handles a brand new channel with only today's posts (only 1D enabled)", () => {
      const dataTodayOnly: RawCoverageData = {
        channelId: "ch-new",
        telegramUsername: "newchannel",
        timezone: TIMEZONE_EAT,
        referenceDateUtc: refDateUtc,
        posts: [
          { id: "p1", publishedAt: new Date("2026-11-24T08:00:00.000Z"), deletedAt: null },
        ],
        observations: [
          { id: "o1", observedAt: new Date("2026-11-24T10:00:00.000Z"), metricType: "VIEWS" },
        ],
        syncRuns: [
          { id: "s1", startedAt: new Date("2026-11-24T10:00:00.000Z"), finishedAt: new Date("2026-11-24T10:00:05.000Z"), status: "SUCCESS" },
        ],
      };

      const result = evaluateChannelCoverage(dataTodayOnly);

      expect(result.historicalCoverageDays).toBe(1);
      expect(result.longestAvailablePreset).toBe("1d");

      expect(result.rangeAvailability["1d"].isAvailable).toBe(true);
      expect(result.rangeAvailability["5d"].isAvailable).toBe(false);
      expect(result.rangeAvailability["7d"].isAvailable).toBe(false);
      expect(result.rangeAvailability["15d"].isAvailable).toBe(false);
      expect(result.rangeAvailability["30d"].isAvailable).toBe(false);
      expect(result.rangeAvailability["60d"].isAvailable).toBe(false);
    });

    it("does NOT falsely enable ranges when a channel was abandoned and has a long sync blackout", () => {
      // First sync on Nov 1, last sync on Nov 1. Today is Dec 25 (54 days later, but server was off).
      const dateAbandoned = new Date("2026-12-25T12:00:00.000Z");
      const dataAbandoned: RawCoverageData = {
        channelId: "ch-abandoned",
        telegramUsername: "abandonedchannel",
        timezone: TIMEZONE_EAT,
        referenceDateUtc: dateAbandoned,
        posts: [
          { id: "p1", publishedAt: new Date("2026-11-01T10:00:00.000Z"), deletedAt: null },
        ],
        observations: [
          { id: "o1", observedAt: new Date("2026-11-01T10:00:00.000Z"), metricType: "VIEWS" },
        ],
        syncRuns: [
          { id: "s1", startedAt: new Date("2026-11-01T10:00:00.000Z"), finishedAt: new Date("2026-11-01T10:00:05.000Z"), status: "SUCCESS" },
        ],
      };

      const result = evaluateChannelCoverage(dataAbandoned);

      // Stale activity prevents advancing coverage to today
      expect(result.historicalCoverageDays).toBe(1);
      // Because the last sync was in early November, ranges ending today do NOT have recent data
      expect(result.longestAvailablePreset).toBe("1d");
      expect(result.rangeAvailability["7d"].isAvailable).toBe(false);
      expect(result.rangeAvailability["15d"].isAvailable).toBe(false);
      expect(result.rangeAvailability["30d"].isAvailable).toBe(false);
    });
  });

  describe("Different Channel Timezones", () => {
    it("respects UTC and America/New_York calendar boundaries correctly", () => {
      // 2026-11-24 02:00:00 UTC
      // In UTC: 2026-11-24
      // In America/New_York (UTC-5): 2026-11-23 21:00:00 EST (still Nov 23!)
      const instant = new Date("2026-11-24T02:00:00.000Z");

      const dataUtc: RawCoverageData = {
        channelId: "ch-utc",
        telegramUsername: "utcchannel",
        timezone: "UTC",
        referenceDateUtc: instant,
        posts: [{ id: "p1", publishedAt: instant, deletedAt: null }],
        observations: [{ id: "o1", observedAt: instant, metricType: "VIEWS" }],
        syncRuns: [{ id: "s1", startedAt: instant, finishedAt: instant, status: "SUCCESS" }],
      };

      const resultUtc = evaluateChannelCoverage(dataUtc);
      expect(resultUtc.todayLocalDate).toBe("2026-11-24");

      const dataNy: RawCoverageData = {
        ...dataUtc,
        timezone: "America/New_York",
      };

      const resultNy = evaluateChannelCoverage(dataNy);
      expect(resultNy.todayLocalDate).toBe("2026-11-23");
    });
  });

  describe("Database Integration: getChannelCoverage for existing channel", () => {
    it("returns real coverage for mogesmotor in database with 1D, 5D, 7D enabled and 15D, 30D, 60D disabled", async () => {
      const channel = await prisma.channel.findUnique({
        where: { telegramUsername: "mogesmotor" },
      });
      expect(channel).toBeDefined();

      const coverage = await getChannelCoverage(channel!.id, {
        referenceDateUtc: refDateUtc,
      });

      expect(coverage).not.toBeNull();
      expect(coverage!.telegramUsername).toBe("mogesmotor");
      expect(coverage!.timezone).toBe("Africa/Addis_Ababa");
      expect(coverage!.historicalCoverageDays).toBeGreaterThanOrEqual(7);
      expect(coverage!.historicalCoverageDays).toBeLessThan(15);

      expect(coverage!.rangeAvailability["1d"].isAvailable).toBe(true);
      expect(coverage!.rangeAvailability["5d"].isAvailable).toBe(true);
      expect(coverage!.rangeAvailability["7d"].isAvailable).toBe(true);

      expect(coverage!.rangeAvailability["15d"].isAvailable).toBe(false);
      expect(coverage!.rangeAvailability["15d"].reason).toContain("15 days");

      expect(coverage!.rangeAvailability["30d"].isAvailable).toBe(false);
      expect(coverage!.rangeAvailability["30d"].reason).toContain("30 days");

      expect(coverage!.rangeAvailability["60d"].isAvailable).toBe(false);
      expect(coverage!.rangeAvailability["60d"].reason).toContain("60 days");

      expect(coverage!.longestAvailablePreset).toBe("7d");
    });
  });
});
