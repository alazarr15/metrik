import { describe, it, expect } from "vitest";
import {
  normalizeYouTubeHandle,
  formatIsoDuration,
  parseIsoDurationSeconds,
  detectIsYouTubeShort,
  fetchYouTubeChannelData,
} from "../src/server/youtube/youtube-collector";

describe("YouTube Data API v3 Collector", () => {
  describe("normalizeYouTubeHandle", () => {
    it("strips leading @ and trims whitespace", () => {
      expect(normalizeYouTubeHandle("  @MogesMotors ")).toBe("MogesMotors");
      expect(normalizeYouTubeHandle("MogesMotors")).toBe("MogesMotors");
    });

    it("throws for invalid handles", () => {
      expect(() => normalizeYouTubeHandle("")).toThrow();
      expect(() => normalizeYouTubeHandle("ab")).toThrow();
      expect(() => normalizeYouTubeHandle("bad handle!")).toThrow();
    });
  });

  describe("formatIsoDuration", () => {
    it("formats ISO 8601 durations cleanly", () => {
      expect(formatIsoDuration("PT14M28S")).toBe("14:28");
      expect(formatIsoDuration("PT1H2M5S")).toBe("1:02:05");
      expect(formatIsoDuration("PT45S")).toBe("0:45");
      expect(formatIsoDuration("PT10M")).toBe("10:00");
    });

    it("returns null for missing or invalid durations", () => {
      expect(formatIsoDuration(null)).toBeNull();
      expect(formatIsoDuration(undefined)).toBeNull();
      expect(formatIsoDuration("invalid")).toBeNull();
    });
  });

  describe("parseIsoDurationSeconds & detectIsYouTubeShort", () => {
    it("parses total seconds accurately", () => {
      expect(parseIsoDurationSeconds("PT12M05S")).toBe(725);
      expect(parseIsoDurationSeconds("PT50S")).toBe(50);
    });

    it("detects Shorts via HEAD status 200 and regular videos via 303 or >180s", async () => {
      const mockHeadFetch: typeof fetch = async (input) => {
        const url = String(input);
        if (url.includes("shortId")) return new Response(null, { status: 200 });
        if (url.includes("regularId")) return new Response(null, { status: 303 });
        return new Response(null, { status: 404 });
      };

      expect(await detectIsYouTubeShort("shortId", "PT45S", mockHeadFetch)).toBe(true);
      expect(await detectIsYouTubeShort("shortId", "PT3M1S", mockHeadFetch)).toBe(true);
      expect(await detectIsYouTubeShort("regularId", "PT2M00S", mockHeadFetch)).toBe(false);
      // > 200s skips network and returns false
      expect(await detectIsYouTubeShort("shortId", "PT12M05S", mockHeadFetch)).toBe(false);
    });
  });

  describe("fetchYouTubeChannelData", () => {
    it("fetches channel metadata and video statistics without fabricating missing counts", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = String(input);
        if (url.includes("/shorts/vid2")) {
          return new Response(null, { status: 200 });
        }
        if (url.includes("/channels")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "UC1234567890",
                  snippet: { title: "Moges Motors" },
                  contentDetails: { relatedPlaylists: { uploads: "UU1234567890" } },
                  statistics: {
                    subscriberCount: "12500",
                    hiddenSubscriberCount: false,
                    viewCount: "980000",
                    videoCount: "42",
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }

        if (url.includes("/playlistItems")) {
          return new Response(
            JSON.stringify({
              items: [
                { contentDetails: { videoId: "vid1" } },
                { contentDetails: { videoId: "vid2" } },
              ],
            }),
            { status: 200 }
          );
        }

        if (url.includes("/videos")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "vid1",
                  snippet: {
                    title: "BYD Leopard 5 Review",
                    publishedAt: "2026-11-24T12:00:00Z",
                  },
                  contentDetails: { duration: "PT12M05S" },
                  statistics: {
                    viewCount: "1500",
                    likeCount: "120",
                    commentCount: "14",
                  },
                },
                {
                  id: "vid2",
                  snippet: {
                    title: "Video with disabled comments and 0 views",
                    publishedAt: "2026-11-25T06:00:00Z",
                  },
                  contentDetails: { duration: "PT0M50S" },
                  statistics: {
                    viewCount: "0",
                    likeCount: "0",
                    // commentCount omitted when disabled
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }

        return new Response("Not Found", { status: 404 });
      };

      const res = await fetchYouTubeChannelData("@MogesMotors", {
        apiKey: "test-api-key",
        maxPages: 1,
        customFetch: mockFetch,
      });

      expect(res.channel.handle).toBe("MogesMotors");
      expect(res.channel.youtubeChannelId).toBe("UC1234567890");
      expect(res.channel.subscriberCount).toBe(12500);
      expect(res.channel.totalViewCount).toBe(BigInt(980000));
      expect(res.videos).toHaveLength(2);

      expect(res.videos[0]).toEqual({
        youtubeVideoId: "vid1",
        title: "BYD Leopard 5 Review",
        publishedAtUtc: "2026-11-24T12:00:00.000Z",
        duration: "12:05",
        isShort: false,
        viewCount: 1500,
        likeCount: 120,
        commentCount: 14,
      });

      // True zero vs missing (disabled comments -> null) + Short detection
      expect(res.videos[1].isShort).toBe(true);
      expect(res.videos[1].viewCount).toBe(0);
      expect(res.videos[1].commentCount).toBeNull();
    });

    it("never leaks the API key in error messages", async () => {
      const secretKey = "SUPER_SECRET_YT_KEY_999";
      const failingFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({ error: { message: "API key not valid." } }),
          { status: 400 }
        );

      await expect(
        fetchYouTubeChannelData("MogesMotors", {
          apiKey: secretKey,
          customFetch: failingFetch,
        })
      ).rejects.toThrow("YouTube Data API error");

      try {
        await fetchYouTubeChannelData("MogesMotors", {
          apiKey: secretKey,
          customFetch: failingFetch,
        });
      } catch (err: unknown) {
        expect(err instanceof Error ? err.message : "").not.toContain(secretKey);
      }
    });
  });
});
