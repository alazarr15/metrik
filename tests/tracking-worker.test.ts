import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { type PrismaClient } from "@prisma/client";
import {
  resolvePollIntervalMinutes,
  resolvePollIntervalMs,
  DEFAULT_POLL_INTERVAL_MINUTES,
  TrackingConfigError,
} from "../src/server/tracking/config.ts";
import {
  TrackingWorker,
  getTrackingWorkerStatus,
} from "../src/server/tracking/tracking-worker.ts";

describe("Tracking Configuration", () => {
  const originalEnv = process.env.TELEGRAM_POLL_INTERVAL_MINUTES;

  beforeEach(() => {
    delete process.env.TELEGRAM_POLL_INTERVAL_MINUTES;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.TELEGRAM_POLL_INTERVAL_MINUTES = originalEnv;
    } else {
      delete process.env.TELEGRAM_POLL_INTERVAL_MINUTES;
    }
  });

  it("defaults to 30 minutes when environment variable is unset", () => {
    expect(resolvePollIntervalMinutes()).toBe(DEFAULT_POLL_INTERVAL_MINUTES);
    expect(resolvePollIntervalMinutes("")).toBe(DEFAULT_POLL_INTERVAL_MINUTES);
    expect(resolvePollIntervalMinutes(undefined)).toBe(DEFAULT_POLL_INTERVAL_MINUTES);
  });

  it("parses valid integer interval", () => {
    expect(resolvePollIntervalMinutes("15")).toBe(15);
    expect(resolvePollIntervalMinutes("45")).toBe(45);
    expect(resolvePollIntervalMinutes("60")).toBe(60);
  });

  it("converts minutes to milliseconds correctly", () => {
    expect(resolvePollIntervalMs("30")).toBe(30 * 60 * 1000);
    expect(resolvePollIntervalMs("5")).toBe(5 * 60 * 1000);
  });

  it("rejects non-integer strings", () => {
    expect(() => resolvePollIntervalMinutes("abc")).toThrow(TrackingConfigError);
    expect(() => resolvePollIntervalMinutes("30.5")).toThrow(TrackingConfigError);
  });

  it("rejects polling intervals less than 5 minutes", () => {
    expect(() => resolvePollIntervalMinutes("4")).toThrow(TrackingConfigError);
    expect(() => resolvePollIntervalMinutes("0")).toThrow(TrackingConfigError);
    expect(() => resolvePollIntervalMinutes("-10")).toThrow(TrackingConfigError);
  });

  it("rejects polling intervals greater than 1440 minutes (24h)", () => {
    expect(() => resolvePollIntervalMinutes("1441")).toThrow(TrackingConfigError);
    expect(() => resolvePollIntervalMinutes("2000")).toThrow(TrackingConfigError);
  });
});

describe("TrackingWorker and WorkerStatus", () => {
  describe("getTrackingWorkerStatus", () => {
    it("returns UNAVAILABLE and isWorkerActive=false when no heartbeat exists", async () => {
      const mockPrisma = {
        workerHeartbeat: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaClient;

      const status = await getTrackingWorkerStatus(mockPrisma);
      expect(status.isWorkerActive).toBe(false);
      expect(status.status).toBe("UNAVAILABLE");
      expect(status.pollIntervalMinutes).toBe(30);
    });

    it("returns isWorkerActive=true when heartbeat is recent (<90s) and status is RUNNING", async () => {
      const mockPrisma = {
        workerHeartbeat: {
          findUnique: vi.fn().mockResolvedValue({
            id: "singleton",
            workerId: "test-worker-1",
            lastHeartbeatAt: new Date(Date.now() - 10_000), // 10s ago
            pollIntervalMin: 30,
            status: "RUNNING",
          }),
        },
      } as unknown as PrismaClient;

      const status = await getTrackingWorkerStatus(mockPrisma);
      expect(status.isWorkerActive).toBe(true);
      expect(status.status).toBe("RUNNING");
      expect(status.workerId).toBe("test-worker-1");
    });

    it("returns isWorkerActive=false when heartbeat is stale (>90s) despite status RUNNING", async () => {
      const mockPrisma = {
        workerHeartbeat: {
          findUnique: vi.fn().mockResolvedValue({
            id: "singleton",
            workerId: "dead-worker",
            lastHeartbeatAt: new Date(Date.now() - 120_000), // 120s ago
            pollIntervalMin: 30,
            status: "RUNNING",
          }),
        },
      } as unknown as PrismaClient;

      const status = await getTrackingWorkerStatus(mockPrisma);
      expect(status.isWorkerActive).toBe(false);
      expect(status.status).toBe("STOPPED");
    });

    it("returns isWorkerActive=false when status is STOPPED", async () => {
      const mockPrisma = {
        workerHeartbeat: {
          findUnique: vi.fn().mockResolvedValue({
            id: "singleton",
            workerId: "stopped-worker",
            lastHeartbeatAt: new Date(),
            pollIntervalMin: 30,
            status: "STOPPED",
          }),
        },
      } as unknown as PrismaClient;

      const status = await getTrackingWorkerStatus(mockPrisma);
      expect(status.isWorkerActive).toBe(false);
      expect(status.status).toBe("STOPPED");
    });
  });

  describe("TrackingWorker lifecycle and locking", () => {
    it("initializes with configured poll interval and unique worker ID", () => {
      const worker = new TrackingWorker({
        pollIntervalMinutes: 45,
        workerId: "custom-worker-id",
        prisma: {} as unknown as PrismaClient,
      });

      expect(worker.getPollIntervalMinutes()).toBe(45);
      expect(worker.getWorkerId()).toBe("custom-worker-id");
    });

    it("stops gracefully by updating heartbeat to STOPPED", async () => {
      const upsertMock = vi.fn().mockResolvedValue({});
      const mockPrisma = {
        workerHeartbeat: {
          upsert: upsertMock,
        },
      } as unknown as PrismaClient;

      const worker = new TrackingWorker({
        pollIntervalMinutes: 30,
        workerId: "test-worker",
        prisma: mockPrisma,
      });

      // Start internal state flag
      (worker as unknown as { isRunning: boolean }).isRunning = true;

      await worker.stop();

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
          update: expect.objectContaining({
            status: "STOPPED",
            workerId: "test-worker",
          }),
        })
      );
    });
  });
});
