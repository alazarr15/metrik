import { describe, it, expect, vi } from "vitest";
import { fetchPublicChannelPosts } from "../src/server/public-channel-collector.ts";

function createMockTelegramHtml(posts: Array<{ id: number; datetime: string; views: string }>) {
  const postsHtml = posts
    .map(
      (p) => `
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message" data-post="testchannel/${p.id}">
        <div class="tgme_widget_message_bubble">
          <div class="tgme_widget_message_text">Post ${p.id}</div>
          <div class="tgme_widget_message_footer">
            <span class="tgme_widget_message_views">${p.views}</span>
            <a class="tgme_widget_message_date" href="https://t.me/testchannel/${p.id}">
              <time datetime="${p.datetime}"></time>
            </a>
          </div>
        </div>
      </div>
    </div>
  `
    )
    .join("\n");

  const beforeId = posts.length > 0 ? posts[0].id : null;
  const loadMoreHtml = beforeId
    ? `<a href="/s/testchannel?before=${beforeId}" class="tme_messages_more" data-before="${beforeId}"></a>`
    : "";

  return `
    <html>
      <head>
        <title>Telegram: Contact @testchannel</title>
        <meta property="og:title" content="Test Channel Title">
      </head>
      <body>
        ${loadMoreHtml}
        ${postsHtml}
      </body>
    </html>
  `;
}

describe("Collector stopBeforeDate Bounded Pagination", () => {
  it("stops fetching pages when a page's oldest post precedes stopBeforeDate", async () => {
    // Reference date: 2026-11-24T12:00:00Z
    // 7-day cutoff: 2026-11-17T21:00:00Z
    const stopBeforeDate = new Date("2026-11-17T21:00:00.000Z");

    // Page 1: Posts from Nov 23 (newer than cutoff)
    const page1Html = createMockTelegramHtml([
      { id: 20, datetime: "2026-11-23T15:00:00+00:00", views: "100" },
      { id: 19, datetime: "2026-11-23T10:00:00+00:00", views: "120" },
    ]);

    // Page 2: Posts from Nov 15 (older than cutoff -> oldest is Nov 15, should trigger stop)
    const page2Html = createMockTelegramHtml([
      { id: 18, datetime: "2026-11-16T12:00:00+00:00", views: "80" },
      { id: 17, datetime: "2026-11-15T10:00:00+00:00", views: "70" },
    ]);

    // Page 3: Would be older (should NOT be called)
    const page3Html = createMockTelegramHtml([
      { id: 16, datetime: "2026-11-10T10:00:00+00:00", views: "60" },
    ]);

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(page1Html, { status: 200 }))
      .mockResolvedValueOnce(new Response(page2Html, { status: 200 }))
      .mockResolvedValueOnce(new Response(page3Html, { status: 200 }));

    const result = await fetchPublicChannelPosts("testchannel", {
      maxPages: 10,
      customFetch: mockFetch,
      stopBeforeDate,
    });

    // Should have fetched only 2 pages, not all 10
    expect(result.pagesFetched).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.posts.length).toBe(4);
    expect(result.posts[0].id).toBe(20);
    expect(result.posts[result.posts.length - 1].id).toBe(17);
  });
});
