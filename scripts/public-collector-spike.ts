import {
  fetchPublicChannelPosts,
  validateChannelUsername,
} from "../src/server/public-channel-collector.ts";

async function main(): Promise<void> {
  console.log("==================================================");
  console.log(" Metrik Public Telegram Channel Collector");
  console.log(" (Login-Free Public Preview Ingestion)");
  console.log("==================================================\n");

  const rawChannel =
    process.env.TELEGRAM_CHANNEL_USERNAME?.trim() ||
    process.env.TELEGRAM_CHANNEL_ID?.trim() ||
    "mogesmotor";

  let username: string;
  try {
    username = validateChannelUsername(rawChannel);
  } catch (err) {
    console.error("Invalid channel username configured:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`[Collector] Target Channel: @${username}`);
  console.log("[Collector] Fetching public channel preview (bounded to 2 pages max)...\n");

  try {
    const result = await fetchPublicChannelPosts(username, { maxPages: 2 });

    console.log("--------------------------------------------------");
    console.log(` Channel: "${result.channelTitle}" (@${result.channelUsername})`);
    console.log(` Total Posts Retrieved: ${result.posts.length}`);
    console.log(` Pages Fetched: ${result.pagesFetched}`);
    console.log(` Has More History: ${result.hasMore}`);
    console.log(` Newest Post ID: ${result.newestPostId ?? "none"}`);
    console.log(` Oldest Post ID in Batch: ${result.oldestPostId ?? "none"}`);
    console.log("--------------------------------------------------\n");

    console.log("Latest Posts Summary:");
    for (const post of result.posts.slice(0, 5)) {
      const viewsDisplay =
        post.views.precision === "exact"
          ? `${post.views.rawText} (exact integer)`
          : post.views.precision === "rounded"
            ? `${post.views.rawText} (~${post.views.numericValue?.toLocaleString()} rounded)`
            : "UNAVAILABLE";

      console.log(`- Post #${post.id} [${post.publishedAtUtc}]`);
      console.log(`  Views: ${viewsDisplay}`);
      if (post.reactionsCount.numericValue !== null) {
        console.log(`  Reactions: ${post.reactionsCount.rawText} (${post.reactionsCount.precision})`);
      }
      const previewText = post.text.slice(0, 80).replace(/\n/g, " ");
      if (previewText) {
        console.log(`  Text: "${previewText}..."`);
      }
    }

    console.log("\n==================================================");
    console.log(" Public Collection Completed Successfully (No Login Required)");
    console.log("==================================================");
  } catch (err) {
    console.error("[Collector Error]:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

void main();
