import { describe, it, expect, vi } from "vitest";
import {
  calculateBootstrapWindow,
  determineBootstrapStatus,
} from "../src/server/db/bootstrap-service.ts";
import { type PrismaClient, BootstrapStatus, SyncStatus } from "@prisma/client";

describe("Bootstrap Service", () => {
  describe("calculateBootstrapWindow", () => {
    it("calculates exact 7-calendar-day window in Africa/Addis_Ababa", () => {
      // 2026-11-24T12:00:00Z -> in Africa/Addis_Ababa (UTC+3) is 2026-11-24 15:00:00
      const refDate = new Date("2026-11-24T12:00:00Z");
      const window = calculateBootstrapWindow(refDate, "Africa/Addis_Ababa");

      // 7 calendar days including today (Nov 24): Nov 18, 19, 20, 21, 22, 23, 24
      expect(window.windowStartLocalDate).toBe("2026-11-18");
      expect(window.windowEndLocalDate).toBe("2026-11-24");
      expect(window.timezone).toBe("Africa/Addis_Ababa");

      // Cutoff date is the start of 2026-11-18 00:00:00 local time
      // 2026-11-18 00:00:00 EAT is 2026-11-17 21:00:00 UTC
      expect(window.cutoffDateUtc.toISOString()).toBe("2026-11-17T21:00:00.000Z");
    });

    it("calculates exact 7-calendar-day window in UTC", () => {
      const refDate = new Date("2026-11-24T12:00:00Z");
      const window = calculateBootstrapWindow(refDate, "UTC");

      expect(window.windowStartLocalDate).toBe("2026-11-18");
      expect(window.windowEndLocalDate).toBe("2026-11-24");
      expect(window.timezone).toBe("UTC");
      expect(window.cutoffDateUtc.toISOString()).toBe("2026-11-18T00:00:00.000Z");
    });
  });

  describe("determineBootstrapStatus", () => {
    const mockChannel = {
      id: "chan-1",
      timezone: "Africa/Addis_Ababa",
      bootstrapStatus: BootstrapStatus.PENDING,
    };

    it("throws error if channel does not exist", async () => {
      const mockPrisma = {
        channel: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      await expect(
        determineBootstrapStatus("nonexistent", { prisma: mockPrisma })
      ).rejects.toThrow("Channel with ID 'nonexistent' was not found.");
    });

    it("returns PENDING when channel has no sync runs", async () => {
      const mockPrisma = {
        channel: { findUnique: vi.fn().mockResolvedValue(mockChannel) },
        post: { findFirst: vi.fn().mockResolvedValue(null) },
        syncRun: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const result = await determineBootstrapStatus("chan-1", {
        prisma: mockPrisma,
        referenceDateUtc: new Date("2026-11-24T12:00:00Z"),
      });

      expect(result.status).toBe(BootstrapStatus.PENDING);
      expect(result.cutoffReached).toBe(false);
      expect(result.oldestPostPublishedAt).toBeNull();
    });

    it("returns RUNNING when latest sync run is currently running", async () => {
      const mockPrisma = {
        channel: { findUnique: vi.fn().mockResolvedValue(mockChannel) },
        post: { findFirst: vi.fn().mockResolvedValue(null) },
        syncRun: {
          findFirst: vi.fn().mockResolvedValue({
            id: "sync-run-1",
            status: SyncStatus.RUNNING,
          }),
        },
      } as unknown as PrismaClient;

      const result = await determineBootstrapStatus("chan-1", {
        prisma: mockPrisma,
        referenceDateUtc: new Date("2026-11-24T12:00:00Z"),
      });

      expect(result.status).toBe(BootstrapStatus.RUNNING);
    });

    it("returns COMPLETED when oldest post is at or before the cutoff date", async () => {
      const mockPrisma = {
        channel: { findUnique: vi.fn().mockResolvedValue(mockChannel) },
        post: {
          findFirst: vi.fn().mockResolvedValue({
            publishedAt: new Date("2026-11-15T10:00:00Z"), // before Nov 17 21:00 UTC
          }),
        },
        syncRun: {
          findFirst: vi.fn().mockResolvedValue({
            id: "sync-run-1",
            status: SyncStatus.SUCCESS,
            pagesFetched: 5,
            postsFetched: 100,
          }),
        },
      } as unknown as PrismaClient;

      const result = await determineBootstrapStatus("chan-1", {
        prisma: mockPrisma,
        referenceDateUtc: new Date("2026-11-24T12:00:00Z"),
      });

      expect(result.status).toBe(BootstrapStatus.COMPLETED);
      expect(result.cutoffReached).toBe(true);
      expect(result.oldestPostPublishedAt).toEqual(new Date("2026-11-15T10:00:00Z"));
    });

    it("returns COMPLETED when channel origin was reached (sparse/new channel)", async () => {
      const mockPrisma = {
        channel: { findUnique: vi.fn().mockResolvedValue(mockChannel) },
        post: {
          findFirst: vi.fn().mockResolvedValue({
            publishedAt: new Date("2026-11-20T10:00:00Z"), // only 4 days old
          }),
        },
        syncRun: {
          findFirst: vi.fn().mockResolvedValue({
            id: "sync-run-1",
            status: SyncStatus.SUCCESS,
            pagesFetched: 2,
            postsFetched: 15, // < 2 * 20 -> reached end of channel
          }),
        },
      } as unknown as PrismaClient;

      const result = await determineBootstrapStatus("chan-1", {
        prisma: mockPrisma,
        referenceDateUtc: new Date("2026-11-24T12:00:00Z"),
      });

      expect(result.status).toBe(BootstrapStatus.COMPLETED);
      expect(result.cutoffReached).toBe(true);
    });

    it("returns INCOMPLETE when page limit reached without hitting cutoff", async () => {
      const mockPrisma = {
        channel: { findUnique: vi.fn().mockResolvedValue(mockChannel) },
        post: {
          findFirst: vi.fn().mockResolvedValue({
            publishedAt: new Date("2026-11-21T10:00:00Z"), // after cutoff
          }),
        },
        syncRun: {
          findFirst: vi.fn().mockResolvedValue({
            id: "sync-run-1",
            status: SyncStatus.SUCCESS,
            pagesFetched: 10,
            postsFetched: 200, // full pages, did not reach cutoff
          }),
        },
      } as unknown as PrismaClient;

      const result = await determineBootstrapStatus("chan-1", {
        prisma: mockPrisma,
        referenceDateUtc: new Date("2026-11-24T12:00:00Z"),
      });

      expect(result.status).toBe(BootstrapStatus.INCOMPLETE);
      expect(result.cutoffReached).toBe(false);
    });

    it("returns FAILED when latest sync failed and no posts exist", async () => {
      const mockPrisma = {
        channel: { findUnique: vi.fn().mockResolvedValue(mockChannel) },
        post: { findFirst: vi.fn().mockResolvedValue(null) },
        syncRun: {
          findFirst: vi.fn().mockResolvedValue({
            id: "sync-run-1",
            status: SyncStatus.FAILED,
          }),
        },
      } as unknown as PrismaClient;

      const result = await determineBootstrapStatus("chan-1", {
        prisma: mockPrisma,
        referenceDateUtc: new Date("2026-11-24T12:00:00Z"),
      });

      expect(result.status).toBe(BootstrapStatus.FAILED);
      expect(result.cutoffReached).toBe(false);
    });
  });
});
