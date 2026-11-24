import { TrackingWorker } from "../src/server/tracking/tracking-worker.ts";
import { resolvePollIntervalMinutes } from "../src/server/tracking/config.ts";
import { prisma } from "../src/server/db/client.ts";

async function main() {
  const pollIntervalMinutes = resolvePollIntervalMinutes();
  const pollsPerDay = Math.round(1440 / pollIntervalMinutes);

  console.log("=================================================");
  console.log("  Metrik Continuous Telegram Tracking Worker");
  console.log("=================================================");
  console.log(`Polling Interval  : ${pollIntervalMinutes} minutes (${pollsPerDay} polls/day/channel)`);
  console.log(`Process ID        : ${process.pid}`);
  console.log(`Environment       : ${process.env.NODE_ENV || "development"}`);
  console.log("=================================================\n");

  const worker = new TrackingWorker({
    prisma,
    pollIntervalMinutes,
  });

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Initiating graceful shutdown...`);
    await worker.stop();
    await prisma.$disconnect();
    console.log("Tracking worker stopped cleanly.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log("Starting tracking worker engine...");
  await worker.start();
  console.log("Worker is active and polling channels in the background.");
  console.log(`Next poll cycle in approximately ${pollIntervalMinutes} minutes.`);
  console.log("Press Ctrl+C to stop.\n");
}

main().catch(async (err) => {
  console.error("Tracking worker crashed with fatal error:", err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
