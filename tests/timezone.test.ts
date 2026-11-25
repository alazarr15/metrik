import { describe, it, expect } from "vitest";
import {
  formatLocalDate,
  localMidnightToUtc,
  getCalendarDaysBetween,
  resolvePresetRange,
  resolveExplicitPeriod,
} from "../src/server/metrics/timezone.ts";

describe("Timezone & Calendar Boundary Utilities", () => {
  const TIMEZONE = "Africa/Addis_Ababa"; // UTC+03:00, no DST

  describe("formatLocalDate", () => {
    it("formats UTC timestamps into local Addis Ababa dates correctly", () => {
      // 2026-11-19 21:00:00 UTC is 2026-11-20 00:00:00 EAT
      const instant1 = new Date("2026-11-19T21:00:00.000Z");
      expect(formatLocalDate(instant1, TIMEZONE)).toBe("2026-11-20");

      // 2026-11-19 20:59:59 UTC is 2026-11-19 23:59:59 EAT
      const instant2 = new Date("2026-11-19T20:59:59.000Z");
      expect(formatLocalDate(instant2, TIMEZONE)).toBe("2026-11-19");
    });
  });

  describe("localMidnightToUtc", () => {
    it("converts local midnight to exact UTC timestamp for Africa/Addis_Ababa (UTC+03:00)", () => {
      const utcDate = localMidnightToUtc("2026-11-20", TIMEZONE);
      expect(utcDate.toISOString()).toBe("2026-11-19T21:00:00.000Z");

      const utcDate2 = localMidnightToUtc("2026-11-23", TIMEZONE);
      expect(utcDate2.toISOString()).toBe("2026-11-22T21:00:00.000Z");
    });
  });

  describe("getCalendarDaysBetween", () => {
    it("generates contiguous list of calendar days inclusive", () => {
      const days = getCalendarDaysBetween("2026-11-20", "2026-11-23");
      expect(days).toEqual(["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]);
    });

    it("handles single-day ranges", () => {
      const days = getCalendarDaysBetween("2026-11-20", "2026-11-20");
      expect(days).toEqual(["2026-11-20"]);
    });
  });

  describe("resolvePresetRange", () => {
    // Noon on 2026-11-23 UTC (15:00 on 2026-11-23 in Addis Ababa)
    const ref = new Date("2026-11-23T12:00:00.000Z");

    it("resolves 1d preset to the rolling past 24 hours", () => {
      const res = resolvePresetRange("1d", ref, TIMEZONE);
      expect(res.localToDate).toBe("2026-11-23");
      expect(res.localFromDate).toBe("2026-11-22");
      expect(res.fromUtc.toISOString()).toBe("2026-11-22T12:00:00.000Z");
      expect(res.toUtc.toISOString()).toBe("2026-11-23T12:00:00.000Z");
    });

    it("resolves 5d preset to today and preceding 4 calendar days", () => {
      const res = resolvePresetRange("5d", ref, TIMEZONE);
      expect(res.localToDate).toBe("2026-11-23");
      expect(res.localFromDate).toBe("2026-11-19"); // 23 - 4 = 19
      expect(res.fromUtc.toISOString()).toBe("2026-11-18T21:00:00.000Z");
      expect(res.toUtc.toISOString()).toBe("2026-11-23T21:00:00.000Z");
    });

    it("resolves 7d preset to today and preceding 6 calendar days", () => {
      const res = resolvePresetRange("7d", ref, TIMEZONE);
      expect(res.localToDate).toBe("2026-11-23");
      expect(res.localFromDate).toBe("2026-11-17"); // 23 - 6 = 17

      // Start: 2026-11-17 00:00:00 EAT -> 2026-11-16 21:00:00 UTC
      expect(res.fromUtc.toISOString()).toBe("2026-11-16T21:00:00.000Z");
      // End: 2026-11-24 00:00:00 EAT -> 2026-11-23 21:00:00 UTC
      expect(res.toUtc.toISOString()).toBe("2026-11-23T21:00:00.000Z");
    });

    it("resolves 15d preset to today and preceding 14 calendar days", () => {
      const res = resolvePresetRange("15d", ref, TIMEZONE);
      expect(res.localToDate).toBe("2026-11-23");
      expect(res.localFromDate).toBe("2026-11-09"); // 23 - 14 = 9
      expect(res.fromUtc.toISOString()).toBe("2026-11-08T21:00:00.000Z");
      expect(res.toUtc.toISOString()).toBe("2026-11-23T21:00:00.000Z");
    });

    it("resolves 30d preset to today and preceding 29 calendar days", () => {
      const res = resolvePresetRange("30d", ref, TIMEZONE);
      expect(res.localToDate).toBe("2026-11-23");
      expect(res.localFromDate).toBe("2026-10-25"); // 30 calendar days
      expect(res.toUtc.toISOString()).toBe("2026-11-23T21:00:00.000Z");
    });

    it("resolves 60d preset to today and preceding 59 calendar days", () => {
      const res = resolvePresetRange("60d", ref, TIMEZONE);
      expect(res.localToDate).toBe("2026-11-23");
      expect(res.localFromDate).toBe("2026-09-25"); // 60 calendar days (Oct has 31 days)
      expect(res.toUtc.toISOString()).toBe("2026-11-23T21:00:00.000Z");
    });
  });

  describe("resolveExplicitPeriod", () => {
    it("maps UTC boundaries to channel local calendar dates", () => {
      const from = new Date("2026-11-19T21:00:00.000Z"); // 2026-11-20 00:00 EAT
      const to = new Date("2026-11-22T21:00:00.000Z"); // 2026-11-23 00:00 EAT (exclusive, covers up to 2026-11-22)

      const period = resolveExplicitPeriod(from, to, TIMEZONE);
      expect(period.localFromDate).toBe("2026-11-20");
      expect(period.localToDate).toBe("2026-11-22");
    });
  });
});
