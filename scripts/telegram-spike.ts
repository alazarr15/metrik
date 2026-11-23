import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient, Api, sessions } from "teleproto";
import {
  normalizeTelegramPost,
  summarizePostMetrics,
  type NormalizedTelegramPost,
} from "../src/lib/telegram-data";

const SESSION_DIR = path.resolve(process.cwd(), ".sessions");
const SESSION_FILE = path.join(SESSION_DIR, "telegram.session");

async function main(): Promise<void> {
  console.log("==================================================");
  console.log(" Metrik Telegram Access Spike (Technical Feasibility)");
  console.log("==================================================\n");

  const rawApiId = process.env.TELEGRAM_API_ID?.trim();
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  const channelIdentifier = process.env.TELEGRAM_CHANNEL_ID?.trim();

  if (!rawApiId || !apiHash) {
    console.error("ERROR: Missing TELEGRAM_API_ID or TELEGRAM_API_HASH environment variables.");
    console.error("Please configure them in .env before running this spike.");
    process.exit(1);
  }

  const apiId = Number(rawApiId);
  if (!Number.isInteger(apiId) || apiId <= 0) {
    console.error("ERROR: TELEGRAM_API_ID must be a positive integer.");
    process.exit(1);
  }

  if (!channelIdentifier) {
    console.error("ERROR: Missing TELEGRAM_CHANNEL_ID in environment variables.");
    console.error("Please specify the target test channel username (e.g. '@mychannel') or channel ID.");
    process.exit(1);
  }

  // Ensure session directory exists
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  let sessionString = "";
  if (fs.existsSync(SESSION_FILE)) {
    try {
      sessionString = fs.readFileSync(SESSION_FILE, "utf-8").trim();
      console.log("[Auth] Found existing session file. Attempting session reuse...");
    } catch {
      console.warn("[Auth] Could not read existing session file. Proceeding with clean session.");
    }
  } else {
    console.log("[Auth] No existing session found at .sessions/telegram.session.");
  }

  const session = new sessions.StringSession(sessionString);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  const rl = readline.createInterface({ input, output });

  try {
    console.log("[Auth] Connecting to Telegram MTProto gateway...");
    await client.connect();

    const isAuthorized = await client.isUserAuthorized();
    if (isAuthorized) {
      console.log("[Auth] Existing session is valid and authorized.");
    } else {
      console.log("[Auth] Session not authorized. Starting interactive authentication.");
      console.log("Please enter your phone number, code, and 2FA password (if enabled) directly.\n");

      await client.start({
        phoneNumber: async () => {
          const phone = await rl.question("Enter phone number (international format e.g. +1...): ");
          return phone.trim();
        },
        password: async () => {
          const pass = await rl.question("Enter 2FA password (if applicable): ");
          return pass.trim();
        },
        phoneCode: async () => {
          const code = await rl.question("Enter Telegram verification code received: ");
          return code.trim();
        },
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[Auth Error]:", message);
        },
      });

      // Persist authenticated session
      const saved = client.session.save();
      fs.writeFileSync(SESSION_FILE, saved, { encoding: "utf-8", mode: 0o600 });
      console.log("\n[Auth] Authentication successful! Session persisted to .sessions/telegram.session (git-ignored).");
    }

    const me = await client.getMe();
    if (me instanceof Api.User) {
      console.log(`[Auth] Authenticated as: ${me.firstName ?? ""} ${me.lastName ?? ""} (@${me.username ?? "no_username"}, ID: ${me.id})`);
    }

    // Step B: Resolve target channel
    console.log(`\n[Channel] Resolving target channel: ${channelIdentifier}...`);
    const channelEntity = await client.getEntity(channelIdentifier);

    if (!(channelEntity instanceof Api.Channel)) {
      console.error(`ERROR: Entity '${channelIdentifier}' is not a Telegram channel (className: ${channelEntity.className}).`);
      process.exit(1);
    }

    console.log(`[Channel] Found channel: "${channelEntity.title}"`);
    console.log(`  - ID: ${channelEntity.id}`);
    console.log(`  - Username: ${channelEntity.username ? `@${channelEntity.username}` : "none (private)"}`);
    console.log(`  - Is Broadcast Channel: ${Boolean(channelEntity.broadcast)}`);
    console.log(`  - Is Megagroup / Supergroup: ${Boolean(channelEntity.megagroup)}`);

    // Verify administrative rights
    console.log("\n[Channel] Verifying administrator permissions...");
    try {
      const participantResult = await client.invoke(
        new Api.channels.GetParticipant({
          channel: channelEntity,
          participant: "me",
        })
      );

      const p = participantResult.participant;
      if (p instanceof Api.ChannelParticipantCreator) {
        console.log("  - Role: CREATOR / OWNER (full administrative rights confirmed)");
      } else if (p instanceof Api.ChannelParticipantAdmin) {
        console.log("  - Role: ADMINISTRATOR");
        console.log(`  - Can post messages: ${Boolean(p.adminRights.postMessages)}`);
        console.log(`  - Can edit messages: ${Boolean(p.adminRights.editMessages)}`);
        console.log(`  - Can delete messages: ${Boolean(p.adminRights.deleteMessages)}`);
      } else {
        console.warn(`  - Warning: Account is a regular participant (${p.className}), not an administrator.`);
      }
    } catch (err) {
      console.warn("  - Could not retrieve participant details:", err instanceof Error ? err.message : String(err));
    }

    // Step C: Retrieve latest 50 posts
    console.log("\n[Posts] Fetching up to 50 latest messages...");
    const rawMessages = await client.getMessages(channelEntity, { limit: 50 });
    console.log(`[Posts] Retrieved ${rawMessages.length} total messages from channel.`);

    const normalizedPosts: NormalizedTelegramPost[] = [];
    for (const msg of rawMessages) {
      if (msg instanceof Api.Message) {
        const normalized = normalizeTelegramPost({
          id: msg.id,
          date: msg.date,
          views: typeof msg.views === "number" ? msg.views : undefined,
          forwards: typeof msg.forwards === "number" ? msg.forwards : undefined,
          post: Boolean(msg.post),
        });
        normalizedPosts.push(normalized);
      }
    }

    console.log(`[Posts] Processed ${normalizedPosts.length} standard message objects.`);

    if (normalizedPosts.length > 0) {
      const newest = normalizedPosts[0];
      const oldest = normalizedPosts[normalizedPosts.length - 1];

      console.log(`  - Newest post ID: ${newest.id} (Published UTC: ${newest.publishedAtUtc})`);
      console.log(`  - Oldest post in batch ID: ${oldest.id} (Published UTC: ${oldest.publishedAtUtc})`);

      const summary = summarizePostMetrics(normalizedPosts);
      console.log(`  - Posts with view counts available: ${summary.totalPosts - summary.postsWithMissingViews}`);
      console.log(`  - Posts with missing/unavailable views: ${summary.postsWithMissingViews}`);
      if (summary.totalLifetimeViewsOfPosts !== null) {
        console.log(`  - Sum of Lifetime Views for these ${summary.totalPosts} posts: ${summary.totalLifetimeViewsOfPosts}`);
      } else {
        console.log(`  - Sum of Lifetime Views: Incomplete (some posts have missing views)`);
      }

      // Sample first 5 posts inspect
      console.log("\n[Sample Posts (Latest 5)]:");
      for (const p of normalizedPosts.slice(0, 5)) {
        console.log(`  Post #${p.id} | Date: ${p.publishedAtUtc} | Views: ${p.views !== null ? p.views : "UNAVAILABLE"} | Forwards: ${p.forwards !== null ? p.forwards : "UNAVAILABLE"}`);
      }

      // Bounded historical pagination test
      console.log(`\n[Pagination] Testing pagination backwards from post ID ${oldest.id}...`);
      const pageMessages = await client.getMessages(channelEntity, {
        limit: 10,
        offsetId: oldest.id,
      });
      console.log(`[Pagination] Successfully retrieved ${pageMessages.length} older messages.`);
      if (pageMessages.length > 0) {
        const nextOldest = pageMessages[pageMessages.length - 1];
        console.log(`  - Next batch oldest ID: ${nextOldest.id} (Published: ${new Date(nextOldest.date * 1000).toISOString()})`);
      }
    } else {
      console.log("[Posts] Channel has no published posts yet.");
    }

    // Step D: Channel Statistics Spike
    console.log("\n[Statistics] Inspecting channel statistics capability (`stats.getBroadcastStats`)...");
    try {
      const fullChat = await client.invoke(
        new Api.channels.GetFullChannel({
          channel: channelEntity,
        })
      );

      const fullChannel = fullChat.fullChat;
      if (fullChannel instanceof Api.ChannelFull) {
        console.log(`  - Subscribers count: ${fullChannel.participantsCount ?? "unknown"}`);
        console.log(`  - canViewStats flag: ${Boolean(fullChannel.canViewStats)}`);
        console.log(`  - statsDc: ${fullChannel.statsDc ?? "none (default)"}`);

        if (fullChannel.canViewStats) {
          console.log("[Statistics] Channel is eligible for broadcast statistics. Invoking `stats.getBroadcastStats`...");
          try {
            const stats = await client.invoke(
              new Api.stats.GetBroadcastStats({
                channel: channelEntity,
              }),
              fullChannel.statsDc
            );

            if (stats instanceof Api.stats.BroadcastStats) {
              console.log("[Statistics] Successfully retrieved BroadcastStats!");
              console.log("  - Period:", stats.period ? `${new Date(stats.period.minDate * 1000).toISOString()} to ${new Date(stats.period.maxDate * 1000).toISOString()}` : "none");
              console.log("  - Followers current:", stats.followers?.current, "previous:", stats.followers?.previous);
              console.log("  - Views per post (average) current:", stats.viewsPerPost?.current, "previous:", stats.viewsPerPost?.previous);
              console.log("  - Shares per post (average) current:", stats.sharesPerPost?.current, "previous:", stats.sharesPerPost?.previous);
              console.log("  - Reactions per post current:", stats.reactionsPerPost?.current, "previous:", stats.reactionsPerPost?.previous);
              console.log("  - Growth graph type:", stats.growthGraph?.className);
              console.log("  - Followers graph type:", stats.followersGraph?.className);
              console.log("  - Interactions graph type:", stats.interactionsGraph?.className);
              console.log("  - Views by source graph type:", stats.viewsBySourceGraph?.className);
              console.log("  - Recent posts interactions count:", stats.recentPostsInteractions?.length ?? 0);
            } else {
              const unknownStats = stats as unknown as { className?: string };
              console.log(`[Statistics] Unexpected stats response class: ${unknownStats.className ?? "unknown"}`);
            }
          } catch (statsErr) {
            console.warn("[Statistics] `stats.getBroadcastStats` invocation failed:", statsErr instanceof Error ? statsErr.message : String(statsErr));
          }
        } else {
          console.log("[Statistics] Channel does NOT meet Telegram eligibility for broadcast statistics (`canViewStats: false`).");
          console.log("  Note: Telegram typically requires channels to reach at least 50-100 subscribers before statistics become active.");
        }
      }
    } catch (fullErr) {
      console.warn("[Statistics] Could not retrieve ChannelFull:", fullErr instanceof Error ? fullErr.message : String(fullErr));
    }

    console.log("\n==================================================");
    console.log(" Telegram Access Spike Completed Successfully");
    console.log("==================================================");
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("FLOOD_WAIT")) {
      console.error(`\n[Rate Limit] Telegram FLOOD_WAIT encountered: ${err.message}. Do not retry aggressively.`);
    } else {
      console.error("\n[Error]:", err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  } finally {
    rl.close();
    await client.disconnect();
  }
}

void main();
