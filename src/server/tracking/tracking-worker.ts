import { type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/client.ts";
import { syncPublicChannel } from "../db/sync-service.ts";
import { runChannelBootstrap } from "../db/bootstrap-service.ts";
import {
  resolvePollIntervalMinutes,
} from "./config.ts";
import { PublicChannelRateLimitError } from "../public-channel-collector.ts";

export interface WorkerStatusSummary {
  isWorkerActive: boolean;
  workerId: string | null;
  lastHeartbeatAt: Date | null;
  pollIntervalMinutes: number;
  status: "RUNNING" | "STOPPED" | "UNAVAILABLE";
}

export class TrackingWorker {
  private readonly db: PrismaClient;
  private readonly pollIntervalMinutes: number;
  private readonly pollIntervalMs: number;
  private readonly workerId: string;

  private isRunning: boolean = false;
  private isShuttingDown: boolean = false;
  private pollTimeout?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private readonly inFlightChannels: Set<string> = new Set();
  private readonly channelBackoffs: Map<string, number> = new Map();

  constructor(options?: {
    prisma?: PrismaClient;
    pollIntervalMinutes?: number;
    workerId?: string;
  }) {
    this.db = options?.prisma ?? defaultPrisma;
    this.pollIntervalMinutes =
      options?.pollIntervalMinutes ?? resolvePollIntervalMinutes();
    this.pollIntervalMs = this.pollIntervalMinutes * 60 * 1000;
    this.workerId = options?.workerId ?? `worker-${process.pid}-${Date.now()}`;
  }

  public getWorkerId(): string {
    return this.workerId;
  }

  public getPollIntervalMinutes(): number {
    return this.pollIntervalMinutes;
  }

  /**
   * Starts the continuous tracking worker.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isShuttingDown = false;

    // 1. Register heartbeat in database
    await this.updateHeartbeat("RUNNING");

    // 2. Start periodic heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        try {
          await this.updateHeartbeat("RUNNING");
        } catch {
          // Non-fatal heartbeat update failure
        }
      }
    }, 30_000);

    // 3. Trigger initial poll cycle immediately
    await this.runPollCycle();

    // 4. Schedule recurring poll cycle
    this.scheduleNextPoll();
  }

  /**
   * Schedules the next recurring poll cycle.
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning || this.isShuttingDown) return;

    this.pollTimeout = setTimeout(async () => {
      try {
        await this.runPollCycle();
      } finally {
        this.scheduleNextPoll();
      }
    }, this.pollIntervalMs);
  }

  /**
   * Executes one polling cycle across all configured channels.
   */
  public async runPollCycle(): Promise<void> {
    if (this.isShuttingDown) return;

    const channels = await this.db.channel.findMany({
      select: {
        id: true,
        telegramUsername: true,
        bootstrapStatus: true,
        lastSyncedAt: true,
      },
    });

    const now = Date.now();

    for (const channel of channels) {
      if (this.isShuttingDown) break;

      // 1. Prevent overlapping synchronization for the same channel
      if (this.inFlightChannels.has(channel.id)) {
        continue;
      }

      // 2. Check backoff for rate-limited channels
      const backoffUntil = this.channelBackoffs.get(channel.id);
      if (backoffUntil && now < backoffUntil) {
        continue;
      }

      // 3. Lock channel
      this.inFlightChannels.add(channel.id);

      try {
        // Step A: If channel has not completed initial 7-day bootstrap, run bootstrap first
        if (channel.bootstrapStatus !== "COMPLETED") {
          const bootstrapResult = await runChannelBootstrap(channel.telegramUsername, {
            prisma: this.db,
            maxPages: 10,
          });

          // Calculate next scheduled sync
          const nextPollAt = new Date(Date.now() + this.pollIntervalMs);
          await this.db.channel.update({
            where: { id: channel.id },
            data: {
              lastSyncedAt: new Date(),
              nextPollAt,
            },
          });

          if (!bootstrapResult.cutoffReached) {
            // Keep backoff clean if incomplete
          }
        } else {
          // Step B: Continuous tracking sync (recent 2 pages)
          // Fetch latest posts and detect new posts / changes in metrics
          await syncPublicChannel(channel.telegramUsername, {
            prisma: this.db,
            maxPages: 2,
          });

          const nextPollAt = new Date(Date.now() + this.pollIntervalMs);
          await this.db.channel.update({
            where: { id: channel.id },
            data: {
              lastSyncedAt: new Date(),
              nextPollAt,
            },
          });
        }

        // Clear any prior backoff on success
        this.channelBackoffs.delete(channel.id);
      } catch (err: unknown) {
        if (err instanceof PublicChannelRateLimitError) {
          // Apply 5-minute backoff for HTTP 429
          const backoffMs = 5 * 60 * 1000;
          this.channelBackoffs.set(channel.id, Date.now() + backoffMs);
          const nextPollAt = new Date(Date.now() + backoffMs);
          await this.db.channel.update({
            where: { id: channel.id },
            data: { nextPollAt },
          }).catch(() => {});
        } else {
          // General failure backoff (2 minutes)
          const backoffMs = 2 * 60 * 1000;
          this.channelBackoffs.set(channel.id, Date.now() + backoffMs);
        }
      } finally {
        this.inFlightChannels.delete(channel.id);
      }
    }
  }

  /**
   * Updates the worker heartbeat row in the database.
   */
  private async updateHeartbeat(status: "RUNNING" | "STOPPED"): Promise<void> {
    await this.db.workerHeartbeat.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        workerId: this.workerId,
        lastHeartbeatAt: new Date(),
        pollIntervalMin: this.pollIntervalMinutes,
        status,
      },
      update: {
        workerId: this.workerId,
        lastHeartbeatAt: new Date(),
        pollIntervalMin: this.pollIntervalMinutes,
        status,
      },
    });
  }

  /**
   * Gracefully stops the worker process.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isShuttingDown = true;
    this.isRunning = false;

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = undefined;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    // Wait briefly if any in-flight channel is finishing
    const maxWait = 5000;
    const startWait = Date.now();
    while (this.inFlightChannels.size > 0 && Date.now() - startWait < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    try {
      await this.updateHeartbeat("STOPPED");
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Retrieves the current status of the background tracking worker.
 */
export async function getTrackingWorkerStatus(
  prismaClient?: PrismaClient
): Promise<WorkerStatusSummary> {
  const db = prismaClient ?? defaultPrisma;

  try {
    const heartbeat = await db.workerHeartbeat.findUnique({
      where: { id: "singleton" },
    });

    if (!heartbeat) {
      return {
        isWorkerActive: false,
        workerId: null,
        lastHeartbeatAt: null,
        pollIntervalMinutes: resolvePollIntervalMinutes(),
        status: "UNAVAILABLE",
      };
    }

    const now = Date.now();
    const heartbeatAgeMs = now - heartbeat.lastHeartbeatAt.getTime();
    // Worker is considered active if status is RUNNING and heartbeat was updated within 90 seconds
    const isWorkerActive = heartbeat.status === "RUNNING" && heartbeatAgeMs < 90_000;

    return {
      isWorkerActive,
      workerId: heartbeat.workerId,
      lastHeartbeatAt: heartbeat.lastHeartbeatAt,
      pollIntervalMinutes: heartbeat.pollIntervalMin,
      status: isWorkerActive ? "RUNNING" : "STOPPED",
    };
  } catch {
    return {
      isWorkerActive: false,
      workerId: null,
      lastHeartbeatAt: null,
      pollIntervalMinutes: resolvePollIntervalMinutes(),
      status: "UNAVAILABLE",
    };
  }
}
