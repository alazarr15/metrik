import { describe, it, expect } from "vitest";
import {
  validateChannelIdentifier,
  validatePostIdentifier,
  parsePaginationLimit,
  parseBooleanParam,
  validateDateRange,
  ApiValidationError,
} from "../src/server/metrics/validation.ts";

describe("API Parameter Validation", () => {
  describe("validateChannelIdentifier", () => {
    it("accepts valid Telegram handles", () => {
      expect(validateChannelIdentifier("mogesmotor")).toBe("mogesmotor");
      expect(validateChannelIdentifier("@mogesmotor")).toBe("mogesmotor");
      expect(validateChannelIdentifier("channel_123")).toBe("channel_123");
    });

    it("accepts valid CUID identifiers", () => {
      expect(validateChannelIdentifier("cmwtg1vwm00005vzczmhjitup")).toBe(
        "cmwtg1vwm00005vzczmhjitup"
      );
    });

    it("rejects invalid or malformed identifiers", () => {
      expect(() => validateChannelIdentifier("")).toThrow(ApiValidationError);
      expect(() => validateChannelIdentifier("ab")).toThrow(ApiValidationError);
      expect(() => validateChannelIdentifier("invalid handle with spaces")).toThrow(
        ApiValidationError
      );
      expect(() => validateChannelIdentifier("invalid$symbols")).toThrow(
        ApiValidationError
      );
    });
  });

  describe("validatePostIdentifier", () => {
    it("accepts integer Telegram message IDs", () => {
      expect(validatePostIdentifier("32171")).toBe(32171);
      expect(validatePostIdentifier("1")).toBe(1);
    });

    it("accepts CUID identifiers", () => {
      expect(validatePostIdentifier("cmwtg1vxw00015vzc4b123456")).toBe(
        "cmwtg1vxw00015vzc4b123456"
      );
    });

    it("rejects zero or negative message IDs", () => {
      expect(() => validatePostIdentifier("0")).toThrow(ApiValidationError);
      expect(() => validatePostIdentifier("-5")).toThrow(ApiValidationError);
    });

    it("rejects invalid or empty post identifiers", () => {
      expect(() => validatePostIdentifier("")).toThrow(ApiValidationError);
      expect(() => validatePostIdentifier("   ")).toThrow(ApiValidationError);
    });
  });

  describe("parsePaginationLimit", () => {
    it("returns default limit when not provided", () => {
      expect(parsePaginationLimit(null, 20, 100)).toBe(20);
      expect(parsePaginationLimit(undefined, 50, 200)).toBe(50);
      expect(parsePaginationLimit("", 20, 100)).toBe(20);
    });

    it("parses valid integer within range", () => {
      expect(parsePaginationLimit("15", 20, 100)).toBe(15);
      expect(parsePaginationLimit("100", 20, 100)).toBe(100);
      expect(parsePaginationLimit("1", 20, 100)).toBe(1);
    });

    it("rejects invalid strings, decimals, and out-of-bounds limits", () => {
      expect(() => parsePaginationLimit("0", 20, 100)).toThrow(ApiValidationError);
      expect(() => parsePaginationLimit("-1", 20, 100)).toThrow(ApiValidationError);
      expect(() => parsePaginationLimit("101", 20, 100)).toThrow(ApiValidationError);
      expect(() => parsePaginationLimit("12.5", 20, 100)).toThrow(ApiValidationError);
      expect(() => parsePaginationLimit("abc", 20, 100)).toThrow(ApiValidationError);
    });
  });

  describe("parseBooleanParam", () => {
    it("handles default values when omitted", () => {
      expect(parseBooleanParam(null, false)).toBe(false);
      expect(parseBooleanParam(undefined, true)).toBe(true);
      expect(parseBooleanParam("", false)).toBe(false);
    });

    it("parses valid boolean values strictly", () => {
      expect(parseBooleanParam("true")).toBe(true);
      expect(parseBooleanParam("TRUE")).toBe(true);
      expect(parseBooleanParam("1")).toBe(true);
      expect(parseBooleanParam("false")).toBe(false);
      expect(parseBooleanParam("FALSE")).toBe(false);
      expect(parseBooleanParam("0")).toBe(false);
    });

    it("rejects non-boolean strings", () => {
      expect(() => parseBooleanParam("yes")).toThrow(ApiValidationError);
      expect(() => parseBooleanParam("no")).toThrow(ApiValidationError);
      expect(() => parseBooleanParam("all")).toThrow(ApiValidationError);
    });
  });

  describe("validateDateRange", () => {
    const fixedReference = new Date("2026-11-23T12:00:00.000Z");

    it("defaults to 30d preset when no parameters are provided", () => {
      const res = validateDateRange(null, null, null, "Africa/Addis_Ababa", fixedReference);
      expect(res.preset).toBe("30d");
      expect(res.fromUtc).toBeInstanceOf(Date);
      expect(res.toUtc).toBeInstanceOf(Date);
      expect(res.fromUtc.getTime()).toBeLessThan(res.toUtc.getTime());
    });

    it("accepts valid presets: 7d, 30d, 90d", () => {
      const res7 = validateDateRange(null, null, "7d", "Africa/Addis_Ababa", fixedReference);
      expect(res7.preset).toBe("7d");

      const res30 = validateDateRange(null, null, "30d", "Africa/Addis_Ababa", fixedReference);
      expect(res30.preset).toBe("30d");

      const res90 = validateDateRange(null, null, "90d", "Africa/Addis_Ababa", fixedReference);
      expect(res90.preset).toBe("90d");
    });

    it("rejects invalid presets", () => {
      expect(() =>
        validateDateRange(null, null, "14d", "Africa/Addis_Ababa", fixedReference)
      ).toThrow(ApiValidationError);
      expect(() =>
        validateDateRange(null, null, "1y", "Africa/Addis_Ababa", fixedReference)
      ).toThrow(ApiValidationError);
    });

    it("rejects ambiguous range parameters (combining preset and from/to)", () => {
      expect(() =>
        validateDateRange(
          "2026-11-01T00:00:00Z",
          null,
          "7d",
          "Africa/Addis_Ababa",
          fixedReference
        )
      ).toThrow(ApiValidationError);

      expect(() =>
        validateDateRange(
          null,
          "2026-11-20T00:00:00Z",
          "30d",
          "Africa/Addis_Ababa",
          fixedReference
        )
      ).toThrow(ApiValidationError);
    });

    it("rejects incomplete explicit date ranges", () => {
      expect(() =>
        validateDateRange("2026-11-01T00:00:00Z", null, null, "Africa/Addis_Ababa", fixedReference)
      ).toThrow(ApiValidationError);

      expect(() =>
        validateDateRange(null, "2026-11-20T00:00:00Z", null, "Africa/Addis_Ababa", fixedReference)
      ).toThrow(ApiValidationError);
    });

    it("validates valid ISO 8601 explicit date ranges", () => {
      const res = validateDateRange(
        "2026-11-01T00:00:00.000Z",
        "2026-11-20T00:00:00.000Z",
        null,
        "Africa/Addis_Ababa",
        fixedReference
      );
      expect(res.fromUtc.toISOString()).toBe("2026-11-01T00:00:00.000Z");
      expect(res.toUtc.toISOString()).toBe("2026-11-20T00:00:00.000Z");
      expect(res.preset).toBeUndefined();
    });

    it("rejects malformed ISO date strings", () => {
      expect(() =>
        validateDateRange("not-a-date", "2026-11-20T00:00:00Z", null, "Africa/Addis_Ababa")
      ).toThrow(ApiValidationError);

      expect(() =>
        validateDateRange("2026-11-01T00:00:00Z", "invalid", null, "Africa/Addis_Ababa")
      ).toThrow(ApiValidationError);
    });

    it("rejects when from >= to", () => {
      expect(() =>
        validateDateRange(
          "2026-11-20T00:00:00.000Z",
          "2026-11-01T00:00:00.000Z",
          null,
          "Africa/Addis_Ababa"
        )
      ).toThrow(ApiValidationError);

      expect(() =>
        validateDateRange(
          "2026-11-20T00:00:00.000Z",
          "2026-11-20T00:00:00.000Z",
          null,
          "Africa/Addis_Ababa"
        )
      ).toThrow(ApiValidationError);
    });

    it("rejects ranges exceeding 365 calendar days", () => {
      expect(() =>
        validateDateRange(
          "2025-01-01T00:00:00.000Z",
          "2026-01-05T00:00:00.000Z",
          null,
          "Africa/Addis_Ababa"
        )
      ).toThrow(ApiValidationError);
    });
  });
});
