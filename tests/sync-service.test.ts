import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  syncPublicChannel,
  SyncExecutionError,
} from "../src/server/db/sync-service.ts";
import { SyncStatus, MetricType, MetricPrecision, type PrismaClient } from "@prisma/client";

// Sample public preview HTML fixture with 2 posts
const SAMPLE_HTML_PAGE_1 = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Test Channel Official">
</head>
<body>
  <div class="tgme_channel_info_header_title_wrap">
    <div class="tgme_channel_info_header_title">Test Channel Official</div>
  </div>
  <div class="tgme_widget_message_wrap">
    <div class="tgme_widget_message" data-post="testchannel/101">
      <div class="tgme_widget_message_text">First message in test channel</div>
      <span class="tgme_widget_message_views">98</span>
      <div class="tgme_widget_message_reactions">
        <span class="tgme_reaction">12</span>
      </div>
      <time datetime="2026-11-20T12:00:00+00:00"></time>
    </div>
  </div>
  <div class="tgme_widget_message_wrap">
    <div class="tgme_widget_message" data-post="testchannel/102">
      <div class="tgme_widget_message_text">Second message with high views</div>
      <span class="tgme_widget_message_views">1.2K</span>
      <time datetime="2026-11-21T15:30:00+00:00"></time>
    </div>
  </div>
</body>
</html>
`;

// Second sample with post 102 views updated to 1.5K and post 101 unchanged
const SAMPLE_HTML_PAGE_UPDATED = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Test Channel Official Renamed">
</head>
<body>
  <div class="tgme_channel_info_header_title_wrap">
    <div class="tgme_channel_info_header_title">Test Channel Official Renamed</div>
  </div>
  <div class="tgme_widget_message_wrap">
    <div class="tgme_widget_message" data-post="testchannel/101">
      <div class="tgme_widget_message_text">First message in test channel</div>
      <span class="tgme_widget_message_views">98</span>
      <div class="tgme_widget_message_reactions">
        <span class="tgme_reaction">12</span>
      </div>
      <time datetime="2026-11-20T12:00:00+00:00"></time>
    </div>
  </div>
  <div class="tgme_widget_message_wrap">
    <div class="tgme_widget_message" data-post="testchannel/102">
      <div class="tgme_widget_message_text">Second message with high views (edited)</div>
      <span class="tgme_widget_message_views">1.5K</span>
      <time datetime="2026-11-21T15:30:00+00:00"></time>
    </div>
  </div>
</body>
</html>
`;

function createMockFetch(html: string, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
  }) as unknown as typeof fetch;
}

interface MockChannel {
  id: string;
  telegramUsername: string;
  title: string | null;
  timezone: string;
}

interface MockPost {
  id: string;
  channelId: string;
  telegramMessageId: number;
  publishedAt: Date;
  text: string | null;
  deletedAt: Date | null;
}

interface MockObservation {
  id: string;
  postId: string;
  observedAt: Date;
  metricType: MetricType;
  rawValue: string | null;
  numericValue: number | null;
  precision: MetricPrecision;
}

interface MockSyncRun {
  id: string;
  channelId: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: SyncStatus;
  pagesFetched: number;
  postsFetched: number;
  errorMessage: string | null;
}

function createInMemoryPrisma() {
  const channels = new Map<string, MockChannel>();
  const posts = new Map<string, MockPost>();
  const observations: MockObservation[] = [];
  const syncRuns = new Map<string, MockSyncRun>();

  let idCounter = 1;
  const nextId = (prefix: string) => `${prefix}_${idCounter++}`;

  const mockPrisma = {
    channel: {
      upsert: vi.fn().mockImplementation(async ({ where, create, update }) => {
        let ch = channels.get(where.telegramUsername);
        if (!ch) {
          ch = {
            id: nextId("chan"),
            telegramUsername: create.telegramUsername,
            title: create.title ?? null,
            timezone: create.timezone ?? "Africa/Addis_Ababa",
          };
          channels.set(ch.telegramUsername, ch);
        } else if (Object.keys(update).length > 0) {
          Object.assign(ch, update);
        }
        return { ...ch };
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const ch = Array.from(channels.values()).find((c) => c.id === where.id);
        if (!ch) throw new Error("Channel not found");
        Object.assign(ch, data);
        return { ...ch };
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        if (where.telegramUsername) {
          return channels.get(where.telegramUsername) ?? null;
        }
        return Array.from(channels.values()).find((c) => c.id === where.id) ?? null;
      }),
    },
    post: {
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        const key = `${where.channelId_telegramMessageId.channelId}_${where.channelId_telegramMessageId.telegramMessageId}`;
        const p = posts.get(key);
        return p ? { ...p } : null;
      }),
      create: vi.fn().mockImplementation(async ({ data }) => {
        const key = `${data.channelId}_${data.telegramMessageId}`;
        const p: MockPost = {
          id: nextId("post"),
          channelId: data.channelId,
          telegramMessageId: data.telegramMessageId,
          publishedAt: data.publishedAt,
          text: data.text ?? null,
          deletedAt: data.deletedAt ?? null,
        };
        posts.set(key, p);
        return { ...p };
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const p = Array.from(posts.values()).find((x) => x.id === where.id);
        if (!p) throw new Error("Post not found");
        Object.assign(p, data);
        return { ...p };
      }),
    },
    postMetricObservation: {
      findFirst: vi.fn().mockImplementation(async ({ where }) => {
        const matches = observations.filter(
          (o) => o.postId === where.postId && o.metricType === where.metricType
        );
        if (matches.length === 0) return null;
        // sorted desc
        matches.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
        return { ...matches[0] };
      }),
      create: vi.fn().mockImplementation(async ({ data }) => {
        const obs: MockObservation = {
          id: nextId("obs"),
          postId: data.postId,
          observedAt: data.observedAt ?? new Date(),
          metricType: data.metricType,
          rawValue: data.rawValue ?? null,
          numericValue: data.numericValue ?? null,
          precision: data.precision,
        };
        observations.push(obs);
        return { ...obs };
      }),
    },
    syncRun: {
      create: vi.fn().mockImplementation(async ({ data }) => {
        const run: MockSyncRun = {
          id: nextId("run"),
          channelId: data.channelId,
          startedAt: data.startedAt ?? new Date(),
          finishedAt: null,
          status: data.status ?? SyncStatus.RUNNING,
          pagesFetched: data.pagesFetched ?? 0,
          postsFetched: data.postsFetched ?? 0,
          errorMessage: null,
        };
        syncRuns.set(run.id, run);
        return { ...run };
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const run = syncRuns.get(where.id);
        if (!run) throw new Error("SyncRun not found");
        Object.assign(run, data);
        return { ...run };
      }),
    },
  };

  return {
    prisma: mockPrisma as unknown as PrismaClient,
    channels,
    posts,
    observations,
    syncRuns,
  };
}

describe("Sync Service: Public Channel Database Synchronization", () => {
  let inMem: ReturnType<typeof createInMemoryPrisma>;

  beforeEach(() => {
    inMem = createInMemoryPrisma();
  });

  it("normalizes username, creates channel, and persists initial posts and observations", async () => {
    const customFetch = createMockFetch(SAMPLE_HTML_PAGE_1);
    const result = await syncPublicChannel("@testchannel", {
      customFetch,
      prisma: inMem.prisma,
    });

    expect(result.success).toBe(true);
    expect(result.channelUsername).toBe("testchannel");
    expect(result.channelTitle).toBe("Test Channel Official");
    expect(result.status).toBe(SyncStatus.SUCCESS);
    expect(result.postsFetched).toBe(2);
    expect(result.postsCreated).toBe(2);
    expect(result.postsUpdated).toBe(0);

    // Each post has 3 metrics: VIEWS, REACTIONS, COMMENTS => 6 observations created
    expect(result.observationsCreated).toBe(6);
    expect(result.observationsSkippedUnchanged).toBe(0);

    // Verify channel timezone default
    const channel = inMem.channels.get("testchannel");
    expect(channel?.timezone).toBe("Africa/Addis_Ababa");

    // Verify post records
    expect(inMem.posts.size).toBe(2);

    // Verify observations: Post 101 has exact views (98) and exact reactions (12)
    const post101 = Array.from(inMem.posts.values()).find((p) => p.telegramMessageId === 101);
    const post101Views = inMem.observations.find(
      (o) => o.postId === post101?.id && o.metricType === MetricType.VIEWS
    );
    expect(post101Views?.precision).toBe(MetricPrecision.EXACT);
    expect(post101Views?.numericValue).toBe(98);
    expect(post101Views?.rawValue).toBe("98");

    // Post 102 has rounded views (1.2K -> 1200)
    const post102 = Array.from(inMem.posts.values()).find((p) => p.telegramMessageId === 102);
    const post102Views = inMem.observations.find(
      (o) => o.postId === post102?.id && o.metricType === MetricType.VIEWS
    );
    expect(post102Views?.precision).toBe(MetricPrecision.ROUNDED);
    expect(post102Views?.numericValue).toBe(1200);
    expect(post102Views?.rawValue).toBe("1.2K");

    // Post 102 has unavailable comments (numericValue is null, never 0)
    const post102Comments = inMem.observations.find(
      (o) => o.postId === post102?.id && o.metricType === MetricType.COMMENTS
    );
    expect(post102Comments?.precision).toBe(MetricPrecision.UNAVAILABLE);
    expect(post102Comments?.numericValue).toBeNull();

    // Verify SyncRun completed with SUCCESS
    const syncRun = inMem.syncRuns.get(result.syncRunId);
    expect(syncRun?.status).toBe(SyncStatus.SUCCESS);
    expect(syncRun?.postsFetched).toBe(2);
    expect(syncRun?.errorMessage).toBeNull();
  });

  it("prevents duplicate posts on repeated sync and skips unchanged observations", async () => {
    const customFetch = createMockFetch(SAMPLE_HTML_PAGE_1);

    // First sync
    const firstResult = await syncPublicChannel("testchannel", {
      customFetch,
      prisma: inMem.prisma,
    });
    expect(firstResult.postsCreated).toBe(2);
    expect(firstResult.observationsCreated).toBe(6);

    // Second sync with identical data
    const secondResult = await syncPublicChannel("testchannel", {
      customFetch,
      prisma: inMem.prisma,
    });

    // Posts are NOT duplicated
    expect(secondResult.postsCreated).toBe(0);
    expect(secondResult.postsUpdated).toBe(0);
    expect(inMem.posts.size).toBe(2);

    // Unchanged observations are skipped to prevent redundant rows
    expect(secondResult.observationsCreated).toBe(0);
    expect(secondResult.observationsSkippedUnchanged).toBe(6);
    expect(inMem.observations.length).toBe(6);
  });

  it("updates post text, updates channel title, and appends new observations when metrics change", async () => {
    // Initial sync
    await syncPublicChannel("testchannel", {
      customFetch: createMockFetch(SAMPLE_HTML_PAGE_1),
      prisma: inMem.prisma,
    });

    // Second sync with updated title, edited text on post 102, and view count changed from 1.2K to 1.5K
    const updateResult = await syncPublicChannel("testchannel", {
      customFetch: createMockFetch(SAMPLE_HTML_PAGE_UPDATED),
      prisma: inMem.prisma,
    });

    expect(updateResult.channelTitle).toBe("Test Channel Official Renamed");
    expect(updateResult.postsCreated).toBe(0);
    expect(updateResult.postsUpdated).toBe(1); // Post 102 text was updated

    // 1 metric changed: Post 102 VIEWS (1.2K -> 1.5K)
    // 5 metrics remained unchanged (Post 101 VIEWS, REACTIONS, COMMENTS, and Post 102 REACTIONS, COMMENTS)
    expect(updateResult.observationsCreated).toBe(1);
    expect(updateResult.observationsSkippedUnchanged).toBe(5);

    // Verify historical append-only: previous 1.2K observation is preserved, new 1.5K observation is added
    const post102 = Array.from(inMem.posts.values()).find((p) => p.telegramMessageId === 102);
    const post102Observations = inMem.observations.filter(
      (o) => o.postId === post102?.id && o.metricType === MetricType.VIEWS
    );
    expect(post102Observations.length).toBe(2);
    expect(post102Observations[0].rawValue).toBe("1.2K");
    expect(post102Observations[0].numericValue).toBe(1200);
    expect(post102Observations[1].rawValue).toBe("1.5K");
    expect(post102Observations[1].numericValue).toBe(1500);
  });

  it("handles incomplete collection safely without marking absent posts as deleted", async () => {
    // Initial sync with both posts 101 and 102
    await syncPublicChannel("testchannel", {
      customFetch: createMockFetch(SAMPLE_HTML_PAGE_1),
      prisma: inMem.prisma,
    });

    // Incomplete sync containing only post 102 (e.g. recent batch only)
    const incompleteHtml = `
      <!DOCTYPE html>
      <html><body>
        <div class="tgme_channel_info_header_title_wrap">
          <div class="tgme_channel_info_header_title">Test Channel Official</div>
        </div>
        <div class="tgme_widget_message_wrap">
          <div class="tgme_widget_message" data-post="testchannel/102">
            <div class="tgme_widget_message_text">Second message only</div>
            <time datetime="2026-11-21T15:30:00+00:00"></time>
            <span class="tgme_widget_message_views">1.2K</span>
          </div>
        </div>
      </body></html>
    `;

    await syncPublicChannel("testchannel", {
      customFetch: createMockFetch(incompleteHtml),
      prisma: inMem.prisma,
    });

    // Post 101 was not in the batch, but its deletedAt MUST remain null
    const post101 = Array.from(inMem.posts.values()).find((p) => p.telegramMessageId === 101);
    expect(post101?.deletedAt).toBeNull();
  });

  it("records SyncRun FAILED and sanitizes errors without corrupting existing records", async () => {
    // Initial successful sync
    await syncPublicChannel("testchannel", {
      customFetch: createMockFetch(SAMPLE_HTML_PAGE_1),
      prisma: inMem.prisma,
    });

    // Subsequent sync fails with HTTP 500 containing sensitive tokens
    const failingFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal server error with token=super_secret_token_12345",
    }) as unknown as typeof fetch;

    await expect(
      syncPublicChannel("testchannel", {
        customFetch: failingFetch,
        prisma: inMem.prisma,
      })
    ).rejects.toThrow(SyncExecutionError);

    // Verify the latest SyncRun has status FAILED
    const allRuns = Array.from(inMem.syncRuns.values());
    const failedRun = allRuns[allRuns.length - 1];
    expect(failedRun.status).toBe(SyncStatus.FAILED);
    expect(failedRun.errorMessage).not.toContain("super_secret_token_12345");
    expect(failedRun.errorMessage).toContain("HTTP request failed with status 500");

    // Existing data from first sync is unaffected
    expect(inMem.posts.size).toBe(2);
    expect(inMem.observations.length).toBe(6);
  });

  it("handles database persistence failure safely and records SyncRun FAILED", async () => {
    // Database throws an unexpected error during post upsert/creation
    inMem.prisma.post.findUnique = vi.fn().mockRejectedValue(new Error("Database write lock conflict or disk error"));

    await expect(
      syncPublicChannel("testchannel", {
        customFetch: createMockFetch(SAMPLE_HTML_PAGE_1),
        prisma: inMem.prisma,
      })
    ).rejects.toThrow(SyncExecutionError);

    // Verify latest SyncRun recorded status FAILED
    const allRuns = Array.from(inMem.syncRuns.values());
    const failedRun = allRuns[allRuns.length - 1];
    expect(failedRun.status).toBe(SyncStatus.FAILED);
    expect(failedRun.errorMessage).toContain("Database write lock conflict or disk error");
  });
});
