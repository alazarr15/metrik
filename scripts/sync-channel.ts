import {
  syncPublicChannel,
  resolveSyncMaxPages,
  DEFAULT_SYNC_MAX_PAGES,
  MAX_ALLOWED_SYNC_PAGES,
} from "../src/server/db/sync-service.ts";
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
    console.error("Usage: pnpm sync:telegram [channel_username] [max_pages]");
    console.error("Example: pnpm sync:telegram mogesmotor 2");
    console.error("==========================================\n");
    process.exit(1);
  }

  let maxPages: number;
  try {
    maxPages = resolveSyncMaxPages(process.argv[3], process.env.SYNC_MAX_PAGES);
  } catch (err) {
    console.error("==========================================");
    console.error("  Configuration Error: Invalid Page Count");
    console.error("==========================================");
    console.error(err instanceof Error ? err.message : String(err));
    console.error(`Page count must be a positive integer between 1 and ${MAX_ALLOWED_SYNC_PAGES} (default: ${DEFAULT_SYNC_MAX_PAGES}).`);
    console.error("Usage: pnpm sync:telegram [channel_username] [max_pages]");
    console.error("Example: pnpm sync:telegram mogesmotor 2");
    console.error("==========================================\n");
    process.exit(1);
  }

  console.log(`Starting synchronization for public channel: @${targetChannel.replace(/^@/, "")}`);
  console.log(`Pagination limit: ${maxPages} page(s)\n`);

  const startTime = Date.now();
  try {
    const result = await syncPublicChannel(targetChannel, { maxPages });
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("==========================================");
    console.log("  Telegram Channel Synchronization Summary");
    console.log("==========================================");
    console.log(`Channel Username : @${result.channelUsername}`);
    console.log(`Channel Title    : ${result.channelTitle || "(unassigned)"}`);
    console.log(`Channel ID (DB)  : ${result.channelId}`);
    console.log(`SyncRun ID (DB)  : ${result.syncRunId}`);
    console.log(`Status           : ${result.status}`);
    console.log(`Pages Fetched    : ${result.pagesFetched}`);
    console.log(`Posts Fetched    : ${result.postsFetched}`);
    console.log(`Posts Created    : ${result.postsCreated}`);
    console.log(`Posts Updated    : ${result.postsUpdated}`);
    console.log(`Obs Created      : ${result.observationsCreated}`);
    console.log(`Obs Skipped (Eq) : ${result.observationsSkippedUnchanged}`);
    console.log(`More Available   : ${result.hasMore ? "Yes" : "No"}`);
    console.log(`Duration         : ${elapsedSec}s`);
    console.log("==========================================\n");
  } catch (err: unknown) {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error("==========================================");
    console.error("  Synchronization FAILED");
    console.error("==========================================");
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error("Unknown error occurred during synchronization");
    }
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
