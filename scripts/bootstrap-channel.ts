import { runChannelBootstrap } from "../src/server/db/bootstrap-service.ts";
import { prisma } from "../src/server/db/client.ts";

async function main() {
  const channelArg = process.argv[2];
  const channelFromEnv = process.env.TELEGRAM_CHANNEL_USERNAME;
  const targetChannel = channelArg || channelFromEnv;

  if (!targetChannel) {
    console.error("==========================================");
    console.error("  Error: No Channel Configured");
    console.error("==========================================");
    console.error("Provide a channel username as an argument or set TELEGRAM_CHANNEL_USERNAME in .env");
    console.error("Usage: pnpm bootstrap:telegram [channel_username] [max_pages]");
    console.error("Example: pnpm bootstrap:telegram mogesmotor 10");
    console.error("==========================================\n");
    process.exit(1);
  }

  const maxPagesArg = process.argv[3] ? parseInt(process.argv[3], 10) : 10;
  const maxPages = Number.isInteger(maxPagesArg) && maxPagesArg >= 1 ? Math.min(maxPagesArg, 10) : 10;

  console.log("==========================================");
  console.log("  Metrik Historical 7-Day Channel Bootstrap");
  console.log("==========================================");
  console.log(`Target Channel   : @${targetChannel.replace(/^@/, "")}`);
  console.log(`Max Pages Bound  : ${maxPages}`);
  console.log("");

  const startTime = Date.now();
  const result = await runChannelBootstrap(targetChannel, { maxPages });
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("==========================================");
  console.log("  Bootstrap Execution Summary");
  console.log("==========================================");
  console.log(`Channel Username : @${result.channelUsername}`);
  console.log(`Channel ID (DB)  : ${result.channelId}`);
  console.log(`Bootstrap Status : ${result.status}`);
  console.log(`Target Window    : ${result.windowStartLocalDate} to ${result.windowEndLocalDate}`);
  console.log(`Cutoff Date UTC  : ${result.cutoffDateUtc.toISOString()}`);
  console.log(`Cutoff Reached   : ${result.cutoffReached ? "YES (Complete)" : "NO (Incomplete)"}`);
  console.log(`Oldest Stored    : ${result.oldestPostPublishedAt?.toISOString() || "(none)"}`);
  console.log(`Pages Fetched    : ${result.pagesFetched}`);
  console.log(`Posts Fetched    : ${result.postsFetched}`);
  console.log(`Posts Created    : ${result.postsCreated}`);
  console.log(`Obs Created      : ${result.observationsCreated}`);
  console.log(`Duration         : ${elapsedSec}s`);
  if (result.errorMessage) {
    console.error(`Error            : ${result.errorMessage}`);
  }
  console.log("==========================================\n");

  if (!result.success || result.status === "FAILED") {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Bootstrap execution failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
