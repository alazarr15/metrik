import { describe, it, expect } from "vitest";
import {
  encodePostsCursor,
  decodePostsCursor,
  buildPostsKeysetWhere,
  encodeObservationsCursor,
  decodeObservationsCursor,
  buildObservationsKeysetWhere,
} from "../src/server/metrics/pagination.ts";
import { ApiValidationError } from "../src/server/metrics/validation.ts";

describe("Deterministic Compound Keyset Pagination", () => {
  describe("Posts Cursor", () => {
    it("round-trips encode and decode accurately", () => {
      const pubDate = new Date("2026-11-19T18:18:37.000Z");
      const id = "cmwtg1vxw00015vzc4b123456";

      const token = encodePostsCursor(pubDate, id);
      expect(typeof token).toBe("string");

      const decoded = decodePostsCursor(token);
      expect(decoded.id).toBe(id);
      expect(decoded.publishedAt.toISOString()).toBe(pubDate.toISOString());
    });

    it("rejects malformed or non-base64 cursor strings", () => {
      expect(() => decodePostsCursor("not-base64-json")).toThrow(ApiValidationError);
      expect(() => decodePostsCursor("")).toThrow(ApiValidationError);

      const invalidJson = Buffer.from("{ bad json }").toString("base64");
      expect(() => decodePostsCursor(invalidJson)).toThrow(ApiValidationError);

      const missingFields = Buffer.from(JSON.stringify({ id: "123" })).toString("base64");
      expect(() => decodePostsCursor(missingFields)).toThrow(ApiValidationError);
    });

    it("builds the correct Prisma OR predicate for compound descending keyset", () => {
      const pubDate = new Date("2026-11-19T18:18:37.000Z");
      const id = "post-123";

      const where = buildPostsKeysetWhere({ publishedAt: pubDate, id });
      expect(where).toEqual({
        OR: [
          { publishedAt: { lt: pubDate } },
          { publishedAt: pubDate, id: { lt: id } },
        ],
      });
    });
  });

  describe("Observations Cursor", () => {
    it("round-trips encode and decode accurately", () => {
      const obsDate = new Date("2026-11-23T15:52:03.500Z");
      const id = "obs-abc-999";

      const token = encodeObservationsCursor(obsDate, id);
      const decoded = decodeObservationsCursor(token);

      expect(decoded.id).toBe(id);
      expect(decoded.observedAt.toISOString()).toBe(obsDate.toISOString());
    });

    it("rejects invalid observations cursor", () => {
      expect(() => decodeObservationsCursor("invalid-token")).toThrow(ApiValidationError);
    });

    it("builds the correct Prisma OR predicate for observation keyset", () => {
      const obsDate = new Date("2026-11-23T15:52:03.500Z");
      const id = "obs-1";

      const where = buildObservationsKeysetWhere({ observedAt: obsDate, id });
      expect(where).toEqual({
        OR: [
          { observedAt: { lt: obsDate } },
          { observedAt: obsDate, id: { lt: id } },
        ],
      });
    });
  });
});
