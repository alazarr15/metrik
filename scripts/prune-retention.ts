import { pruneHistoricalObservations, DEFAULT_RETENTION_DAYS } from "../src/server/db/retention-service.ts";
import { prisma } from "../src/server/db/client.ts";

async function main() {
  const channelArg = process.argv[2];
  const daysArg = process.argv[3];

  let channelUsername: string | undefined;
  if (channelArg && channelArg.toLowerCase() !== "all") {
    channelUsername = channelArg;
  }

  let retentionDays = DEFAULT_RETENTION_DAYS;
  if (daysArg) {
    const parsedDays = parseInt(daysArg, 10);
    if (Number.isNaN(parsedDays) || parsedDays < 1) {
      console.error("==========================================");
      console.error("  Error: Invalid Retention Days");
      console.error("==========================================");
      console.error(`Retention days must be a positive integer. Received: "${daysArg}"`);
      console.error("Usage: pnpm retention:prune [channel_username | all] [retention_days]");
      console.error("Example: pnpm retention:prune mogesmotor 60");
      console.error("==========================================\n");
      process.exit(1);
    }
    retentionDays = parsedDays;
  }

  console.log("==========================================");
  console.log("  Metrik — Rolling Retention Maintenance");
  console.log("==========================================");
  console.log(`Target Channel(s) : ${channelUsername ? `@${channelUsername.replace(/^@/, "")}` : "All tracked channels"}`);
  console.log(`Retention Window  : ${retentionDays} calendar days`);
  console.log(`Execution Time    : ${new Date().toISOString()} (UTC)\n`);

  const startTime = Date.now();
  try {
    const result = await pruneHistoricalObservations({
      channelUsername,
      retentionDays,
    });
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("==========================================");
    console.log("  Retention Pruning Summary");
    console.log("==========================================");
    console.log(`Channels Processed    : ${result.channelsProcessed}`);
    console.log(`Obs Before Boundary   : ${result.totalObservationsExamined}`);
    console.log(`Anchors Preserved     : ${result.totalAnchorsPreserved}`);
    console.log(`Observations Pruned   : ${result.totalObservationsPruned}`);
    console.log(`Posts Intact (DB)     : ${result.totalPostsPreserved}`);
    console.log(`SyncRuns Intact (DB)  : ${result.totalSyncRunsPreserved}`);
    console.log(`Duration              : ${elapsedSec}s`);
    console.log("==========================================\n");

    if (result.channelSummaries.length > 0) {
      console.log("Channel Breakdown:");
      for (const summary of result.channelSummaries) {
        console.log(`  - @${summary.telegramUsername}:`);
        console.log(`      Boundary UTC : ${summary.retentionBoundaryUtc.toISOString()}`);
        console.log(`      Pruned       : ${summary.observationsPruned}`);
        console.log(`      Anchors Kept : ${summary.anchorsPreserved}`);
      }
      console.log("");
    }
  } catch (err: unknown) {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error("==========================================");
    console.error("  Retention Pruning FAILED");
    console.error("==========================================");
    console.error(err instanceof Error ? err.message : String(err));
    console.error(`Duration: ${elapsedSec}s`);
    console.error("==========================================\n");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error("Fatal error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
