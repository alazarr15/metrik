import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET as getChannels } from "../src/app/api/channels/route.ts";
import { GET as getChannelById } from "../src/app/api/channels/[id]/route.ts";
import { GET as getChannelPosts } from "../src/app/api/channels/[id]/posts/route.ts";
import { GET as getChannelAnalytics } from "../src/app/api/channels/[id]/analytics/route.ts";
import { GET as getPostObservations } from "../src/app/api/channels/[id]/posts/[postId]/observations/route.ts";

describe("Phase 4 Read-Only API Route Handlers", () => {
  const TEST_PASSWORD = "test-dashboard-admin-password";
  const originalEnv = process.env.DASHBOARD_ADMIN_PASSWORD;

  beforeAll(() => {
    process.env.DASHBOARD_ADMIN_PASSWORD = TEST_PASSWORD;
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.DASHBOARD_ADMIN_PASSWORD = originalEnv;
    } else {
      delete process.env.DASHBOARD_ADMIN_PASSWORD;
    }
  });

  const authHeaders = {
    authorization: `Bearer ${TEST_PASSWORD}`,
  };

  describe("Security Guard Integration across endpoints", () => {
    it("returns 503 when DASHBOARD_ADMIN_PASSWORD is missing on server", async () => {
      delete process.env.DASHBOARD_ADMIN_PASSWORD;

      const req = new Request("http://localhost:3000/api/channels", {
        headers: { authorization: `Bearer ${TEST_PASSWORD}` },
      });
      const res = await getChannels(req);
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json.error.code).toBe("SERVER_MISCONFIGURED");

      process.env.DASHBOARD_ADMIN_PASSWORD = TEST_PASSWORD;
    });

    it("returns 401 when request lacks authorization headers", async () => {
      const req = new Request("http://localhost:3000/api/channels");
      const res = await getChannels(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 when request provides invalid credentials", async () => {
      const req = new Request("http://localhost:3000/api/channels", {
        headers: { authorization: "Bearer invalid-password" },
      });
      const res = await getChannels(req);
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/channels", () => {
    it("returns list of channels with postsCount and latestSync", async () => {
      const req = new Request("http://localhost:3000/api/channels", {
        headers: authHeaders,
      });
      const res = await getChannels(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("channels");
      expect(Array.isArray(data.channels)).toBe(true);

      if (data.channels.length > 0) {
        const channel = data.channels[0];
        expect(channel).toHaveProperty("id");
        expect(channel).toHaveProperty("telegramUsername");
        expect(channel).toHaveProperty("postsCount");
        expect(typeof channel.postsCount).toBe("number");
      }
    });
  });

  describe("GET /api/channels/[id]", () => {
    it("returns 404 for nonexistent channel", async () => {
      const req = new Request("http://localhost:3000/api/channels/nonexistent_channel", {
        headers: authHeaders,
      });
      const res = await getChannelById(req, {
        params: Promise.resolve({ id: "nonexistent_channel" }),
      });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("returns 400 for malformed channel identifier", async () => {
      const req = new Request("http://localhost:3000/api/channels/bad$id", {
        headers: authHeaders,
      });
      const res = await getChannelById(req, {
        params: Promise.resolve({ id: "bad$id" }),
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error.code).toBe("INVALID_IDENTIFIER");
    });

    it("returns channel details and summary for existing channel handle", async () => {
      const req = new Request("http://localhost:3000/api/channels/mogesmotor", {
        headers: authHeaders,
      });
      const res = await getChannelById(req, {
        params: Promise.resolve({ id: "mogesmotor" }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.channel.telegramUsername).toBe("mogesmotor");
      expect(data.summary.reach).toEqual({
        status: "UNAVAILABLE",
        value: null,
        reason: "Reach is unavailable on Telegram broadcast channels",
      });
      expect(typeof data.summary.postsPublishedTotal).toBe("number");
    });
  });

  describe("GET /api/channels/[id]/posts", () => {
    it("returns 400 for invalid pagination limit", async () => {
      const req = new Request("http://localhost:3000/api/channels/mogesmotor/posts?limit=500", {
        headers: authHeaders,
      });
      const res = await getChannelPosts(req, {
        params: Promise.resolve({ id: "mogesmotor" }),
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error.code).toBe("INVALID_PAGINATION_LIMIT");
    });

    it("returns paginated posts with latest metrics", async () => {
      const req = new Request("http://localhost:3000/api/channels/mogesmotor/posts?limit=5", {
        headers: authHeaders,
      });
      const res = await getChannelPosts(req, {
        params: Promise.resolve({ id: "mogesmotor" }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.posts)).toBe(true);
      expect(data).toHaveProperty("pagination");
      expect(data.pagination).toHaveProperty("totalCount");

      if (data.posts.length > 0) {
        const post = data.posts[0];
        expect(post).toHaveProperty("id");
        expect(post).toHaveProperty("telegramMessageId");
        expect(post).toHaveProperty("publishedAt");
        expect(post.metrics).toHaveProperty("views");
        expect(post.metrics).toHaveProperty("reactions");
        expect(post.metrics).toHaveProperty("comments");
      }
    });
  });

  describe("GET /api/channels/[id]/analytics", () => {
    it("returns 400 for invalid range preset", async () => {
      const req = new Request(
        "http://localhost:3000/api/channels/mogesmotor/analytics?range=14d",
        { headers: authHeaders }
      );
      const res = await getChannelAnalytics(req, {
        params: Promise.resolve({ id: "mogesmotor" }),
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error.code).toBe("INVALID_RANGE_PRESET");
    });

    it("rejects discontinued 90d preset with 400 INVALID_RANGE_PRESET", async () => {
      const req = new Request(
        "http://localhost:3000/api/channels/mogesmotor/analytics?range=90d",
        { headers: authHeaders }
      );
      const res = await getChannelAnalytics(req, {
        params: Promise.resolve({ id: "mogesmotor" }),
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error.code).toBe("INVALID_RANGE_PRESET");
    });

    it("returns analytics report for 60d rolling retention window", async () => {
      const req = new Request(
        "http://localhost:3000/api/channels/mogesmotor/analytics?range=60d",
        { headers: authHeaders }
      );
      const res = await getChannelAnalytics(req, {
        params: Promise.resolve({ id: "mogesmotor" }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("period");
      expect(data.postsPublished.daily.length).toBe(60);
    });

    it("returns analytics report adhering to specification", async () => {
      const req = new Request(
        "http://localhost:3000/api/channels/mogesmotor/analytics?range=30d",
        { headers: authHeaders }
      );
      const res = await getChannelAnalytics(req, {
        params: Promise.resolve({ id: "mogesmotor" }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("period");
      expect(data.period.timezone).toBe("Africa/Addis_Ababa");

      expect(data).toHaveProperty("postsPublished");
      expect(Array.isArray(data.postsPublished.daily)).toBe(true);

      expect(data).toHaveProperty("lifetimeViews");
      expect(data.lifetimeViews).toHaveProperty("totalEstimate");
      expect(data.lifetimeViews).toHaveProperty("exactSum");
      expect(data.lifetimeViews).toHaveProperty("roundedEstimate");
      expect(data.lifetimeViews).toHaveProperty("isExact");

      expect(data).toHaveProperty("observedViewsGrowth");
      expect(data.observedViewsGrowth).toHaveProperty("label");
      expect(data.observedViewsGrowth).toHaveProperty("coverage");
      expect(Array.isArray(data.observedViewsGrowth.daily)).toBe(true);

      expect(data.reach).toEqual({
        status: "UNAVAILABLE",
        value: null,
        reason: "Reach is unavailable on Telegram broadcast channels",
      });
    });
  });

  describe("GET /api/channels/[id]/posts/[postId]/observations", () => {
    it("returns 404 for nonexistent post", async () => {
      const req = new Request(
        "http://localhost:3000/api/channels/mogesmotor/posts/999999/observations",
        { headers: authHeaders }
      );
      const res = await getPostObservations(req, {
        params: Promise.resolve({ id: "mogesmotor", postId: "999999" }),
      });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("returns 400 for invalid metricType filter", async () => {
      const req = new Request(
        "http://localhost:3000/api/channels/mogesmotor/posts/32171/observations?metricType=SHARES",
        { headers: authHeaders }
      );
      const res = await getPostObservations(req, {
        params: Promise.resolve({ id: "mogesmotor", postId: "32171" }),
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error.code).toBe("INVALID_METRIC_TYPE");
    });

    it("returns observation history for existing post", async () => {
      // Message ID 32171 was synchronized in Phase 3
      const req = new Request(
        "http://localhost:3000/api/channels/mogesmotor/posts/32171/observations",
        { headers: authHeaders }
      );
      const res = await getPostObservations(req, {
        params: Promise.resolve({ id: "mogesmotor", postId: "32171" }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.telegramMessageId).toBe(32171);
      expect(Array.isArray(data.observations)).toBe(true);
      expect(data.pagination).toHaveProperty("totalCount");
      if (data.observations.length > 0) {
        expect(data.observations[0]).toHaveProperty("metricType");
        expect(data.observations[0]).toHaveProperty("precision");
      }
    });
  });
});
