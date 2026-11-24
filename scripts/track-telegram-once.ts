import { runOneShotTracking } from "../src/server/tracking/tracking-worker.ts";
import { prisma } from "../src/server/db/client.ts";

async function main() {
  console.log("=================================================");
  console.log("  Metrik One-Shot Telegram Tracking Execution");
  console.log("=================================================");
  console.log(`Execution Mode   : One-Shot (Scheduled / GitHub Actions)`);
  console.log(`Process ID       : ${process.pid}`);
  console.log(`Started At       : ${new Date().toISOString()}`);
  console.log("=================================================\n");

  const startTime = Date.now();
  const summary = await runOneShotTracking({ prisma });
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n=================================================");
  console.log("  Execution Summary");
  console.log("=================================================");
  console.log(`Duration         : ${durationSec}s`);
  console.log(`Channels Total   : ${summary.channelsCount}`);
  console.log(`Succeeded        : ${summary.successCount}`);
  console.log(`Skipped          : ${summary.skippedCount}`);
  console.log(`Failed           : ${summary.failureCount}`);
  console.log("-------------------------------------------------");

  for (const r of summary.results) {
    const icon = r.status === "SUCCESS" ? "✓" : r.status === "SKIPPED" ? "○" : "✗";
    console.log(
      ` ${icon} @${r.telegramUsername.padEnd(20)} [${r.type}] ${r.status.padEnd(8)} (posts fetched: ${r.postsFetched ?? 0})`
    );
    if (r.errorMessage) {
      console.log(`     Note: ${r.errorMessage}`);
    }
  }
  console.log("=================================================\n");

  await prisma.$disconnect();

  // If every channel failed, exit with non-zero code to notify GitHub Actions
  if (summary.failureCount > 0 && summary.successCount === 0 && summary.channelsCount > 0) {
    console.error("One-shot tracking completed with terminal failures.");
    process.exit(1);
  }

  process.exit(0);
}

main().catch(async (err) => {
  console.error("One-shot tracking encountered fatal unhandled error:", err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
