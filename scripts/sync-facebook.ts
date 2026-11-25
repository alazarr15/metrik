import { syncFacebookPage } from "../src/server/facebook/facebook-sync-service.ts";
import { prisma } from "../src/server/db/client.ts";

async function main() {
  const pageIdArg = process.argv[2] || process.env.FACEBOOK_PAGE_ID || "";
  const limitArg = parseInt(process.argv[3] || process.env.FACEBOOK_SYNC_LIMIT || "50", 10);

  if (!pageIdArg || !process.env.FACEBOOK_ACCESS_TOKEN) {
    console.error("Error: FACEBOOK_PAGE_ID and FACEBOOK_ACCESS_TOKEN are required.");
    process.exit(1);
  }

  console.log(`Starting Facebook synchronization for Page ID: ${pageIdArg}...`);

  const result = await syncFacebookPage(pageIdArg, {
    limit: Number.isNaN(limitArg) ? 50 : limitArg,
    prisma,
  });

  console.log("==========================================");
  console.log("  Facebook Page Synchronization Summary");
  console.log("==========================================");
  console.log(`Page Name        : ${result.name}`);
  console.log(`Facebook Page ID : ${result.facebookPageId}`);
  console.log(`SyncRun ID (DB)  : ${result.syncRunId}`);
  console.log(`Status           : ${result.status}`);
  console.log(`Items Fetched    : ${result.itemsFetched}`);
  console.log(`Items Created    : ${result.itemsCreated}`);
  console.log(`Items Updated    : ${result.itemsUpdated}`);
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
  console.error("Facebook sync failed:", err instanceof Error ? err.message : err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
