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

export interface ChannelPollResult {
  channelId: string;
  telegramUsername: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  type: "BOOTSTRAP" | "SYNC";
  postsFetched: number;
  postsCreated?: number;
  observationsCreated?: number;
  errorMessage?: string;
}

export interface PollCycleResult {
  channelsCount: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  results: ChannelPollResult[];
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
  public async runPollCycle(): Promise<PollCycleResult> {
    const results: ChannelPollResult[] = [];
    if (this.isShuttingDown) {
      return {
        channelsCount: 0,
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
        results,
      };
    }

    let channels = await this.db.channel.findMany({
      select: {
        id: true,
        telegramUsername: true,
        bootstrapStatus: true,
        lastSyncedAt: true,
      },
    });

    // Auto-initialize channel from TELEGRAM_CHANNEL_USERNAME if database has zero channels
    if (channels.length === 0 && process.env.TELEGRAM_CHANNEL_USERNAME) {
      const defaultUsername = process.env.TELEGRAM_CHANNEL_USERNAME.trim().replace(/^@/, "");
      if (defaultUsername) {
        const created = await this.db.channel.upsert({
          where: { telegramUsername: defaultUsername },
          create: {
            telegramUsername: defaultUsername,
            timezone: process.env.APP_TIMEZONE || "Africa/Addis_Ababa",
          },
          update: {},
          select: {
            id: true,
            telegramUsername: true,
            bootstrapStatus: true,
            lastSyncedAt: true,
          },
        });
        channels = [created];
      }
    }

    const now = Date.now();

    for (const channel of channels) {
      if (this.isShuttingDown) break;

      // 1. Prevent overlapping synchronization within this process
      if (this.inFlightChannels.has(channel.id)) {
        results.push({
          channelId: channel.id,
          telegramUsername: channel.telegramUsername,
          status: "SKIPPED",
          type: channel.bootstrapStatus !== "COMPLETED" ? "BOOTSTRAP" : "SYNC",
          postsFetched: 0,
          errorMessage: "Channel is already in-flight in this process.",
        });
        continue;
      }

      // 2. Prevent cross-process overlapping synchronization (database-level check for active running sync)
      const activeSyncRun = await this.db.syncRun.findFirst({
        where: {
          channelId: channel.id,
          status: "RUNNING",
          startedAt: { gte: new Date(now - 10 * 60 * 1000) },
        },
      });

      if (activeSyncRun) {
        results.push({
          channelId: channel.id,
          telegramUsername: channel.telegramUsername,
          status: "SKIPPED",
          type: channel.bootstrapStatus !== "COMPLETED" ? "BOOTSTRAP" : "SYNC",
          postsFetched: 0,
          errorMessage: `Another sync run (${activeSyncRun.id}) is actively in progress.`,
        });
        continue;
      }

      // 3. Check backoff for rate-limited channels
      const backoffUntil = this.channelBackoffs.get(channel.id);
      if (backoffUntil && now < backoffUntil) {
        results.push({
          channelId: channel.id,
          telegramUsername: channel.telegramUsername,
          status: "SKIPPED",
          type: channel.bootstrapStatus !== "COMPLETED" ? "BOOTSTRAP" : "SYNC",
          postsFetched: 0,
          errorMessage: `Channel rate-limit backoff in effect until ${new Date(backoffUntil).toISOString()}.`,
        });
        continue;
      }

      // 4. Lock channel
      this.inFlightChannels.add(channel.id);

      try {
        if (channel.bootstrapStatus !== "COMPLETED") {
          // Step A: If channel has not completed initial 7-day bootstrap, run bootstrap first
          const bootstrapResult = await runChannelBootstrap(channel.telegramUsername, {
            prisma: this.db,
            maxPages: 10,
          });

          const nextPollAt = new Date(Date.now() + this.pollIntervalMs);
          await this.db.channel.update({
            where: { id: channel.id },
            data: {
              lastSyncedAt: new Date(),
              nextPollAt,
            },
          });

          results.push({
            channelId: channel.id,
            telegramUsername: channel.telegramUsername,
            status: bootstrapResult.success ? "SUCCESS" : "FAILED",
            type: "BOOTSTRAP",
            postsFetched: bootstrapResult.postsFetched,
            postsCreated: bootstrapResult.postsCreated,
            observationsCreated: bootstrapResult.observationsCreated,
            errorMessage: bootstrapResult.errorMessage,
          });
        } else {
          // Step B: Continuous tracking sync (recent 2 pages)
          const syncResult = await syncPublicChannel(channel.telegramUsername, {
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

          results.push({
            channelId: channel.id,
            telegramUsername: channel.telegramUsername,
            status: "SUCCESS",
            type: "SYNC",
            postsFetched: syncResult.postsFetched,
            postsCreated: syncResult.postsCreated,
            observationsCreated: syncResult.observationsCreated,
          });
        }

        // Clear any prior backoff on success
        this.channelBackoffs.delete(channel.id);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);

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

        results.push({
          channelId: channel.id,
          telegramUsername: channel.telegramUsername,
          status: "FAILED",
          type: channel.bootstrapStatus !== "COMPLETED" ? "BOOTSTRAP" : "SYNC",
          postsFetched: 0,
          errorMessage: errMsg,
        });
      } finally {
        this.inFlightChannels.delete(channel.id);
      }
    }

    return {
      channelsCount: channels.length,
      successCount: results.filter((r) => r.status === "SUCCESS").length,
      failureCount: results.filter((r) => r.status === "FAILED").length,
      skippedCount: results.filter((r) => r.status === "SKIPPED").length,
      results,
    };
  }

  /**
   * Updates the worker heartbeat row in the database.
   */
  public async updateHeartbeat(status: "RUNNING" | "STOPPED"): Promise<void> {
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

/**
 * Executes a one-shot tracking cycle across eligible channels.
 * Designed for scheduled execution (e.g. GitHub Actions every 30 minutes).
 *
 * - Does not start recurring background timers or infinite loops.
 * - Records WorkerHeartbeat during execution.
 * - Runs 7-day bootstrap first if channel is incomplete.
 * - Runs 2-page incremental sync if bootstrap is complete.
 * - Safely coordinates with concurrent runs via database and memory locks.
 * - Returns structured PollCycleResult.
 */
export async function runOneShotTracking(options?: {
  prisma?: PrismaClient;
  workerId?: string;
  pollIntervalMinutes?: number;
}): Promise<PollCycleResult> {
  const worker = new TrackingWorker({
    prisma: options?.prisma,
    workerId: options?.workerId ?? `oneshot-${process.pid}-${Date.now()}`,
    pollIntervalMinutes: options?.pollIntervalMinutes,
  });

  await worker.updateHeartbeat("RUNNING");
  try {
    const result = await worker.runPollCycle();
    return result;
  } finally {
    try {
      await worker.updateHeartbeat("STOPPED");
    } catch {
      // Non-fatal
    }
  }
}
