import { describe, it, expect } from "vitest";
import { fetchFacebookPageData } from "../src/server/facebook/facebook-collector";

describe("Facebook Graph API Collector", () => {
  it("fetches Page metadata, Posts, and Reels separately without fabricating missing metrics", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);

      if (url.includes("/video_reels")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "reel_1",
                description: "BYD Leopard 5 Walkaround",
                created_time: "2026-11-24T15:00:00+0000",
                permalink_url: "/reel/reel_1/",
                views: 4200,
                likes: { summary: { total_count: 310 } },
                comments: { summary: { total_count: 18 } },
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (url.includes("/reel_1/video_insights")) {
        return new Response(
          JSON.stringify({
            data: [{ name: "fb_reels_total_plays", values: [{ value: 4250 }] }],
          }),
          { status: 200 }
        );
      }

      if (url.includes("/posts")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "12345_post_1",
                message: "2025 BYD Sealion 06 EV",
                created_time: "2026-11-23T12:00:00+0000",
                permalink_url: "https://www.facebook.com/12345/posts/post_1",
                shares: { count: 12 },
                reactions: { summary: { total_count: 85 } },
                comments: { summary: { total_count: 9 } },
                insights: {
                  data: [{ name: "post_media_view", values: [{ value: 1450 }] }],
                },
              },
              {
                // Duplicate of reel_1 appearing in /posts should be deduplicated
                id: "12345_reel_1",
                message: "BYD Leopard 5 Walkaround",
                created_time: "2026-11-24T15:00:00+0000",
                permalink_url: "https://www.facebook.com/reel/reel_1/",
              },
              {
                id: "12345_post_2",
                message: "Post with 0 reactions and no insights",
                created_time: "2026-11-22T10:00:00+0000",
                reactions: { summary: { total_count: 0 } },
              },
            ],
          }),
          { status: 200 }
        );
      }

      // Page endpoint
      return new Response(
        JSON.stringify({
          id: "12345",
          name: "Moges Motors",
          followers_count: 54000,
          fan_count: 52000,
        }),
        { status: 200 }
      );
    };

    const res = await fetchFacebookPageData("12345", {
      accessToken: "test-fb-token",
      customFetch: mockFetch,
    });

    expect(res.page).toEqual({
      facebookPageId: "12345",
      name: "Moges Motors",
      followersCount: 54000,
      fanCount: 52000,
    });

    // reel_1 + post_1 + post_2 = 3 unique items (duplicate 12345_reel_1 skipped)
    expect(res.items).toHaveLength(3);

    const reel = res.items.find((i) => i.facebookItemId === "reel_1");
    expect(reel?.itemType).toBe("REEL");
    expect(reel?.viewsCount).toBe(4250);
    expect(reel?.reactionsCount).toBe(310);

    const post1 = res.items.find((i) => i.facebookItemId === "12345_post_1");
    expect(post1?.itemType).toBe("POST");
    expect(post1?.viewsCount).toBe(1450);
    expect(post1?.sharesCount).toBe(12);

    const post2 = res.items.find((i) => i.facebookItemId === "12345_post_2");
    expect(post2?.reactionsCount).toBe(0);
    expect(post2?.viewsCount).toBeNull();
  });

  it("never leaks access token in error messages", async () => {
    const secretToken = "EAAB_SUPER_SECRET_TOKEN_XYZ";
    const failingFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: { message: "Invalid OAuth access token." } }),
        { status: 401 }
      );

    try {
      await fetchFacebookPageData("12345", {
        accessToken: secretToken,
        customFetch: failingFetch,
      });
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      expect(msg).toContain("Facebook Graph API error");
      expect(msg).not.toContain(secretToken);
    }
  });
});
