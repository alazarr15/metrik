import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  validateMetricObservation,
  createObservationFromParsedCounter,
  sanitizeSyncRunError,
  DataIntegrityError,
} from "../src/server/db/integrity.ts";
import {
  parseDisplayCounter,
  calculateCounterDelta,
} from "../src/lib/counter-precision.ts";

describe("Database Schema: Prisma DMMF Definitions", () => {
  const dmmf = Prisma.dmmf;

  it("defines Channel model with required fields, defaults, and unique constraints", () => {
    const channelModel = dmmf.datamodel.models.find((m) => m.name === "Channel");
    expect(channelModel).toBeDefined();

    const fieldNames = channelModel!.fields.map((f) => f.name);
    expect(fieldNames).toContain("id");
    expect(fieldNames).toContain("telegramUsername");
    expect(fieldNames).toContain("title");
    expect(fieldNames).toContain("timezone");
    expect(fieldNames).toContain("createdAt");
    expect(fieldNames).toContain("updatedAt");
    expect(fieldNames).toContain("posts");
    expect(fieldNames).toContain("syncRuns");

    const usernameField = channelModel!.fields.find((f) => f.name === "telegramUsername");
    expect(usernameField?.isUnique).toBe(true);

    const tzField = channelModel!.fields.find((f) => f.name === "timezone");
    expect(tzField?.default).toBe("Africa/Addis_Ababa");
  });

  it("defines Post model with unique [channelId, telegramMessageId] constraint and soft-delete field", () => {
    const postModel = dmmf.datamodel.models.find((m) => m.name === "Post");
    expect(postModel).toBeDefined();

    const fieldNames = postModel!.fields.map((f) => f.name);
    expect(fieldNames).toContain("id");
    expect(fieldNames).toContain("channelId");
    expect(fieldNames).toContain("telegramMessageId");
    expect(fieldNames).toContain("publishedAt");
    expect(fieldNames).toContain("text");
    expect(fieldNames).toContain("deletedAt");
    expect(fieldNames).toContain("observations");

    // Telegram message ID must be an integer
    const msgIdField = postModel!.fields.find((f) => f.name === "telegramMessageId");
    expect(msgIdField?.type).toBe("Int");

    // Soft delete timestamp must be optional
    const deletedAtField = postModel!.fields.find((f) => f.name === "deletedAt");
    expect(deletedAtField?.isRequired).toBe(false);

    // Unique compound key on [channelId, telegramMessageId]
    const compoundKeyExists = postModel!.uniqueFields.some(
      (fields) => fields.includes("channelId") && fields.includes("telegramMessageId")
    );
    expect(compoundKeyExists).toBe(true);
  });

  it("defines PostMetricObservation with Restrict onDelete relation to protect historical data", () => {
    const obsModel = dmmf.datamodel.models.find((m) => m.name === "PostMetricObservation");
    expect(obsModel).toBeDefined();

    const postRelation = obsModel!.fields.find((f) => f.name === "post");
    expect(postRelation).toBeDefined();
    expect(postRelation?.relationOnDelete).toBe("Restrict");

    const fieldNames = obsModel!.fields.map((f) => f.name);
    expect(fieldNames).toContain("id");
    expect(fieldNames).toContain("postId");
    expect(fieldNames).toContain("observedAt");
    expect(fieldNames).toContain("metricType");
    expect(fieldNames).toContain("rawValue");
    expect(fieldNames).toContain("numericValue");
    expect(fieldNames).toContain("precision");

    // Observations are append-only: there is NO updatedAt field
    expect(fieldNames).not.toContain("updatedAt");
  });

  it("defines SyncRun model with channel relation and status tracking", () => {
    const syncModel = dmmf.datamodel.models.find((m) => m.name === "SyncRun");
    expect(syncModel).toBeDefined();

    const fieldNames = syncModel!.fields.map((f) => f.name);
    expect(fieldNames).toContain("id");
    expect(fieldNames).toContain("channelId");
    expect(fieldNames).toContain("startedAt");
    expect(fieldNames).toContain("finishedAt");
    expect(fieldNames).toContain("status");
    expect(fieldNames).toContain("pagesFetched");
    expect(fieldNames).toContain("postsFetched");
    expect(fieldNames).toContain("errorMessage");
  });

  it("defines MetricType, MetricPrecision, and SyncStatus enums", () => {
    const enums = dmmf.datamodel.enums;
    const typeEnum = enums.find((e) => e.name === "MetricType");
    expect(typeEnum?.values.map((v) => v.name)).toEqual(["VIEWS", "REACTIONS", "COMMENTS"]);

    const precisionEnum = enums.find((e) => e.name === "MetricPrecision");
    expect(precisionEnum?.values.map((v) => v.name)).toEqual(["EXACT", "ROUNDED", "UNAVAILABLE"]);

    const statusEnum = enums.find((e) => e.name === "SyncStatus");
    expect(statusEnum?.values.map((v) => v.name)).toEqual(["RUNNING", "SUCCESS", "FAILED"]);
  });
});

describe("Database Migration: SQL Constraints & Foreign Keys", () => {
  const migrationPath = path.join(
    __dirname,
    "../prisma/migrations/20261123173200_init_public_channel_analytics/migration.sql"
  );

  it("migration file exists and includes required schema statements", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Table creations
    expect(sql).toContain('CREATE TABLE "channels"');
    expect(sql).toContain('CREATE TABLE "posts"');
    expect(sql).toContain('CREATE TABLE "post_metric_observations"');
    expect(sql).toContain('CREATE TABLE "sync_runs"');

    // Unique constraints
    expect(sql).toContain('CREATE UNIQUE INDEX "channels_telegramUsername_key" ON "channels"("telegramUsername")');
    expect(sql).toContain('CREATE UNIQUE INDEX "posts_channelId_telegramMessageId_key" ON "posts"("channelId", "telegramMessageId")');

    // Foreign key with ON DELETE RESTRICT on observations
    expect(sql).toMatch(
      /ALTER TABLE "post_metric_observations" ADD CONSTRAINT "post_metric_observations_postId_fkey" FOREIGN KEY \("postId"\) REFERENCES "posts"\("id"\) ON DELETE RESTRICT/
    );

    // Database-level check constraints for metric precision and non-negative numbers
    expect(sql).toContain('chk_observation_precision_rules');
    expect(sql).toContain('"precision" = \'UNAVAILABLE\' AND "numericValue" IS NULL');
    expect(sql).toContain('"numericValue" >= 0');
  });
});

describe("Data Integrity Rules: Metric Observations", () => {
  it("allows EXACT observation with valid positive or zero numericValue", () => {
    const exactValid = validateMetricObservation({
      postId: "post_1",
      metricType: "VIEWS",
      rawValue: "98",
      numericValue: 98,
      precision: "EXACT",
    });
    expect(exactValid.numericValue).toBe(98);
    expect(exactValid.precision).toBe("EXACT");

    // True zero is allowed for exact counts (e.g. 0 reactions)
    const exactZero = validateMetricObservation({
      postId: "post_1",
      metricType: "REACTIONS",
      rawValue: "0",
      numericValue: 0,
      precision: "EXACT",
    });
    expect(exactZero.numericValue).toBe(0);
    expect(exactZero.precision).toBe("EXACT");
  });

  it("allows ROUNDED observation with valid positive estimated numericValue", () => {
    const roundedValid = validateMetricObservation({
      postId: "post_1",
      metricType: "VIEWS",
      rawValue: "1.2K",
      numericValue: 1200,
      precision: "ROUNDED",
    });
    expect(roundedValid.numericValue).toBe(1200);
    expect(roundedValid.precision).toBe("ROUNDED");
    expect(roundedValid.rawValue).toBe("1.2K");
  });

  it("strictly enforces that UNAVAILABLE metric must have numericValue = null", () => {
    const unavailableValid = validateMetricObservation({
      postId: "post_1",
      metricType: "VIEWS",
      rawValue: null,
      numericValue: null,
      precision: "UNAVAILABLE",
    });
    expect(unavailableValid.numericValue).toBeNull();
    expect(unavailableValid.precision).toBe("UNAVAILABLE");
  });

  it("strictly forbids storing zero for missing/UNAVAILABLE metrics", () => {
    expect(() =>
      validateMetricObservation({
        postId: "post_1",
        metricType: "VIEWS",
        rawValue: null,
        numericValue: 0,
        precision: "UNAVAILABLE",
      })
    ).toThrowError(/UNAVAILABLE metric must have numericValue = null/);
  });

  it("strictly forbids non-null numericValue for UNAVAILABLE metrics", () => {
    expect(() =>
      validateMetricObservation({
        postId: "post_1",
        metricType: "VIEWS",
        rawValue: "unavailable",
        numericValue: 100,
        precision: "UNAVAILABLE",
      })
    ).toThrowError(DataIntegrityError);
  });

  it("strictly forbids null numericValue for EXACT and ROUNDED metrics", () => {
    expect(() =>
      validateMetricObservation({
        postId: "post_1",
        metricType: "VIEWS",
        rawValue: "98",
        numericValue: null,
        precision: "EXACT",
      })
    ).toThrowError(/EXACT metric must have a non-null numericValue/);

    expect(() =>
      validateMetricObservation({
        postId: "post_1",
        metricType: "VIEWS",
        rawValue: "1.2K",
        numericValue: null,
        precision: "ROUNDED",
      })
    ).toThrowError(/ROUNDED metric must have a non-null numericValue/);
  });

  it("strictly forbids negative numericValue", () => {
    expect(() =>
      validateMetricObservation({
        postId: "post_1",
        metricType: "VIEWS",
        rawValue: "-5",
        numericValue: -5,
        precision: "EXACT",
      })
    ).toThrowError(/numericValue must never be negative/);
  });
});

describe("Collector Integration: ParsedCounter to Observation Mapping", () => {
  it("maps exact counter '450' to EXACT precision with preserved text", () => {
    const parsed = parseDisplayCounter("450");
    const obs = createObservationFromParsedCounter("post_100", "VIEWS", parsed);

    expect(obs.precision).toBe("EXACT");
    expect(obs.numericValue).toBe(450);
    expect(obs.rawValue).toBe("450");
  });

  it("maps rounded counter '1.2K' to ROUNDED precision and preserves raw string", () => {
    const parsed = parseDisplayCounter("1.2K");
    const obs = createObservationFromParsedCounter("post_100", "VIEWS", parsed);

    expect(obs.precision).toBe("ROUNDED");
    expect(obs.numericValue).toBe(1200);
    expect(obs.rawValue).toBe("1.2K");

    // Cannot treat rounded values as exact in delta calculation
    const earlier = parseDisplayCounter("1.2K");
    const later = parseDisplayCounter("1.5K");
    const delta = calculateCounterDelta(earlier, later);
    expect(delta.isExact).toBe(false);
    expect(delta.delta).toBeNull();
  });

  it("maps rounded counter '1.74M' to ROUNDED precision and preserves raw string", () => {
    const parsed = parseDisplayCounter("1.74M");
    const obs = createObservationFromParsedCounter("post_100", "VIEWS", parsed);

    expect(obs.precision).toBe("ROUNDED");
    expect(obs.numericValue).toBe(1740000);
    expect(obs.rawValue).toBe("1.74M");
  });

  it("maps missing counter to UNAVAILABLE with null numericValue (never 0)", () => {
    const parsed = parseDisplayCounter(null);
    const obs = createObservationFromParsedCounter("post_100", "VIEWS", parsed);

    expect(obs.precision).toBe("UNAVAILABLE");
    expect(obs.numericValue).toBeNull();
    expect(obs.numericValue).not.toBe(0);
  });
});

describe("Append-Only & History Preservation", () => {
  it("preserves sequential observations over time for the same post", () => {
    const postId = "post_seq";
    const obs1 = createObservationFromParsedCounter(
      postId,
      "VIEWS",
      parseDisplayCounter("98"),
      new Date("2026-11-20T10:00:00Z")
    );
    const obs2 = createObservationFromParsedCounter(
      postId,
      "VIEWS",
      parseDisplayCounter("120"),
      new Date("2026-11-21T10:00:00Z")
    );

    // Both observations exist independently with distinct timestamps and values
    expect(obs1.observedAt).toEqual(new Date("2026-11-20T10:00:00Z"));
    expect(obs1.numericValue).toBe(98);
    expect(obs2.observedAt).toEqual(new Date("2026-11-21T10:00:00Z"));
    expect(obs2.numericValue).toBe(120);

    // Delta between exact observations is exact
    const deltaResult = calculateCounterDelta(parseDisplayCounter("98"), parseDisplayCounter("120"));
    expect(deltaResult.isExact).toBe(true);
    expect(deltaResult.delta).toBe(22);
  });
});

describe("SyncRun Error Sanitization", () => {
  it("sanitizes error messages and redacts potential secrets", () => {
    const rawError = new Error("Connection failed with token=secret_token_12345678 and api_hash=abc123xyz789");
    const sanitized = sanitizeSyncRunError(rawError);

    expect(sanitized).not.toContain("secret_token_12345678");
    expect(sanitized).not.toContain("abc123xyz789");
    expect(sanitized).toContain("[REDACTED]");
  });

  it("truncates excessively long error messages", () => {
    const longMessage = "E".repeat(1000);
    const sanitized = sanitizeSyncRunError(longMessage);
    expect(sanitized.length).toBeLessThanOrEqual(500);
  });
});
