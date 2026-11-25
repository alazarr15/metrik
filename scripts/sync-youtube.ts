import { syncYouTubeChannel } from "../src/server/youtube/youtube-sync-service.ts";
import { prisma } from "../src/server/db/client.ts";

async function main() {
  const handleArg = process.argv[2] || process.env.YOUTUBE_CHANNEL_HANDLE || "MogesMotors";
  const maxPagesArg = parseInt(process.argv[3] || process.env.YOUTUBE_SYNC_MAX_PAGES || "2", 10);

  if (!process.env.YOUTUBE_API_KEY) {
    console.error("Error: YOUTUBE_API_KEY environment variable is not set.");
    process.exit(1);
  }

  console.log(`Starting YouTube synchronization for @${handleArg.replace(/^@/, "")} (maxPages=${maxPagesArg})...`);

  const result = await syncYouTubeChannel(handleArg, {
    maxPages: Number.isNaN(maxPagesArg) ? 2 : maxPagesArg,
    prisma,
  });

  console.log("==========================================");
  console.log("  YouTube Channel Synchronization Summary");
  console.log("==========================================");
  console.log(`Channel Handle   : @${result.handle}`);
  console.log(`Channel ID (DB)  : ${result.channelId}`);
  console.log(`SyncRun ID (DB)  : ${result.syncRunId}`);
  console.log(`Status           : ${result.status}`);
  console.log(`Videos Fetched   : ${result.videosFetched}`);
  console.log(`Videos Created   : ${result.videosCreated}`);
  console.log(`Videos Updated   : ${result.videosUpdated}`);
  console.log(`Obs Created      : ${result.observationsCreated}`);
  if (result.errorMessage) {
    console.log(`Error            : ${result.errorMessage}`);
  }
  console.log("==========================================");

  await prisma.$disconnect();
  if (result.status !== "SUCCESS") {
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("YouTube sync failed:", err instanceof Error ? err.message : err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
