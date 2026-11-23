import { describe, it, expect } from "vitest";
import {
  parseDisplayCounter,
  calculateCounterDelta,
} from "../src/lib/counter-precision.ts";
import {
  validateChannelUsername,
  buildPublicPreviewUrl,
  parsePublicChannelHtml,
  fetchPublicChannelPage,
  fetchPublicChannelPosts,
  PublicChannelNotFoundError,
  PublicChannelRedirectError,
  PublicChannelRateLimitError,
  PublicChannelError,
} from "../src/server/public-channel-collector.ts";

const SAMPLE_HTML_FIXTURE = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Telegram: Contact @mogesmotor">
</head>
<body>
  <div class="tgme_channel_info_header_title_wrap">
    <div class="tgme_channel_info_header_title"><span dir="auto">Moges Motors™️</span></div>
  </div>
  <div class="tgme_widget_message_centered js-messages_more_wrap">
    <a href="/s/mogesmotor?before=32147" class="tme_messages_more js-messages_more" data-before="32147"></a>
  </div>
  <!-- Post 1: Exact integer views -->
  <div class="tgme_widget_message_wrap js-widget_message_wrap">
    <div class="tgme_widget_message js-widget_message" data-post="mogesmotor/32147">
      <div class="tgme_widget_message_text js-message_text">2023 Toyota Corolla for sale. Clean condition.</div>
      <div class="tgme_widget_message_footer">
        <span class="tgme_widget_message_views">98</span>
        <span class="tgme_widget_message_meta">
          <time datetime="2026-11-19T18:08:24+00:00" class="time">18:08</time>
        </span>
      </div>
    </div>
  </div>
  <!-- Post 2: Rounded K views and reactions -->
  <div class="tgme_widget_message_wrap js-widget_message_wrap">
    <div class="tgme_widget_message js-widget_message" data-post="mogesmotor/32150">
      <div class="tgme_widget_message_text js-message_text">Special end of year discount announcement!</div>
      <div class="tgme_widget_message_reactions">
        <span class="tgme_reaction">15</span>
        <span class="tgme_reaction">1.2K</span>
      </div>
      <div class="tgme_widget_message_footer">
        <span class="tgme_widget_message_views">14.5K</span>
        <span class="tgme_widget_message_meta">
          <time datetime="2026-11-20T10:00:00+00:00" class="time">10:00</time>
        </span>
      </div>
    </div>
  </div>
  <!-- Post 3: Rounded M views -->
  <div class="tgme_widget_message_wrap js-widget_message_wrap">
    <div class="tgme_widget_message js-widget_message" data-post="mogesmotor/32160">
      <div class="tgme_widget_message_text js-message_text">Viral video showcase</div>
      <div class="tgme_widget_message_footer">
        <span class="tgme_widget_message_views">1.74M</span>
        <span class="tgme_widget_message_meta">
          <time datetime="2026-11-21T12:30:00+00:00" class="time">12:30</time>
        </span>
      </div>
    </div>
  </div>
  <!-- Post 4: Missing views -->
  <div class="tgme_widget_message_wrap js-widget_message_wrap">
    <div class="tgme_widget_message js-widget_message" data-post="mogesmotor/32165">
      <div class="tgme_widget_message_text js-message_text">Pinned message without view count element</div>
      <div class="tgme_widget_message_footer">
        <span class="tgme_widget_message_meta">
          <time datetime="2026-11-22T08:00:00+00:00" class="time">08:00</time>
        </span>
      </div>
    </div>
  </div>
</body>
</html>
`;

describe("Username validation and URL construction", () => {
  it("sanitizes various username formats to lowercase clean string", () => {
    expect(validateChannelUsername("mogesmotor")).toBe("mogesmotor");
    expect(validateChannelUsername("@mogesmotor")).toBe("mogesmotor");
    expect(validateChannelUsername("https://t.me/mogesmotor")).toBe("mogesmotor");
    expect(validateChannelUsername("https://t.me/s/MogesMotor/")).toBe("mogesmotor");
  });

  it("throws for invalid usernames", () => {
    expect(() => validateChannelUsername("")).toThrow(PublicChannelError);
    expect(() => validateChannelUsername("abc")).toThrow(PublicChannelError); // too short
    expect(() => validateChannelUsername("user with spaces")).toThrow(PublicChannelError);
    expect(() => validateChannelUsername("invalid$char!")).toThrow(PublicChannelError);
  });

  it("builds correct public preview URLs with and without before parameter", () => {
    expect(buildPublicPreviewUrl("mogesmotor")).toBe("https://t.me/s/mogesmotor");
    expect(buildPublicPreviewUrl("mogesmotor", 32147)).toBe("https://t.me/s/mogesmotor?before=32147");
  });
});

describe("Counter precision classification and delta calculation", () => {
  it("correctly identifies exact integer counters", () => {
    const parsed = parseDisplayCounter("98");
    expect(parsed.rawText).toBe("98");
    expect(parsed.numericValue).toBe(98);
    expect(parsed.precision).toBe("exact");
  });

  it("correctly classifies thousands (K) as rounded", () => {
    const parsed = parseDisplayCounter("14.5K");
    expect(parsed.rawText).toBe("14.5K");
    expect(parsed.numericValue).toBe(14500);
    expect(parsed.precision).toBe("rounded");
  });

  it("correctly classifies millions (M) as rounded", () => {
    const parsed = parseDisplayCounter("1.74M");
    expect(parsed.rawText).toBe("1.74M");
    expect(parsed.numericValue).toBe(1740000);
    expect(parsed.precision).toBe("rounded");
  });

  it("marks missing or empty counters as unavailable", () => {
    expect(parseDisplayCounter(null).precision).toBe("unavailable");
    expect(parseDisplayCounter("").precision).toBe("unavailable");
    expect(parseDisplayCounter("   ").precision).toBe("unavailable");
    expect(parseDisplayCounter("-").precision).toBe("unavailable");
  });

  it("calculates exact deltas only when both counters are exact", () => {
    const c1 = parseDisplayCounter("100");
    const c2 = parseDisplayCounter("150");
    const result = calculateCounterDelta(c1, c2);
    expect(result.isExact).toBe(true);
    expect(result.delta).toBe(50);
  });

  it("refuses to calculate exact view deltas from rounded counters", () => {
    const exact = parseDisplayCounter("950");
    const rounded = parseDisplayCounter("1.2K");
    const result = calculateCounterDelta(exact, rounded);
    expect(result.delta).toBeNull();
    expect(result.isExact).toBe(false);
    expect(result.reason).toContain("rounded");
  });

  it("refuses to calculate delta when an observation is unavailable", () => {
    const exact = parseDisplayCounter("950");
    const missing = parseDisplayCounter(null);
    const result = calculateCounterDelta(exact, missing);
    expect(result.delta).toBeNull();
    expect(result.isExact).toBe(false);
  });
});

describe("HTML parsing on local fixture", () => {
  it("extracts channel title, posts, timestamps, views, and pagination", () => {
    const page = parsePublicChannelHtml(SAMPLE_HTML_FIXTURE, "mogesmotor");

    expect(page.channelTitle).toBe("Moges Motors™️");
    expect(page.hasMore).toBe(true);
    expect(page.beforeId).toBe(32147);
    expect(page.posts).toHaveLength(4);

    // Post 1: Exact views
    const p1 = page.posts[0];
    expect(p1.id).toBe(32147);
    expect(p1.text).toBe("2023 Toyota Corolla for sale. Clean condition.");
    expect(p1.publishedAtUtc).toBe("2026-11-19T18:08:24.000Z");
    expect(p1.views.precision).toBe("exact");
    expect(p1.views.numericValue).toBe(98);

    // Post 2: Rounded views and reactions
    const p2 = page.posts[1];
    expect(p2.id).toBe(32150);
    expect(p2.views.precision).toBe("rounded");
    expect(p2.views.numericValue).toBe(14500);
    expect(p2.reactionsCount.precision).toBe("rounded"); // contains 1.2K
    expect(p2.reactionsCount.numericValue).toBe(1215);

    // Post 3: Millions rounded
    const p3 = page.posts[2];
    expect(p3.id).toBe(32160);
    expect(p3.views.precision).toBe("rounded");
    expect(p3.views.numericValue).toBe(1740000);

    // Post 4: Missing views
    const p4 = page.posts[3];
    expect(p4.id).toBe(32165);
    expect(p4.views.precision).toBe("unavailable");
    expect(p4.views.numericValue).toBeNull();
  });

  it("handles malformed or empty HTML gracefully without throwing", () => {
    const emptyResult = parsePublicChannelHtml("", "unknown");
    expect(emptyResult.posts).toHaveLength(0);
    expect(emptyResult.hasMore).toBe(false);
    expect(emptyResult.channelTitle).toBe("");

    const malformedResult = parsePublicChannelHtml("<div>random incomplete tags", "test");
    expect(malformedResult.posts).toHaveLength(0);
  });
});

describe("HTTP client and error handling", () => {
  it("handles 404 channel not found", async () => {
    const mockFetch = async () => new Response("Not Found", { status: 404 });
    await expect(fetchPublicChannelPage("nonexistent_channel", undefined, mockFetch as unknown as typeof fetch))
      .rejects.toThrow(PublicChannelNotFoundError);
  });

  it("handles 302 redirects (e.g. groups without public preview)", async () => {
    const mockFetch = async () => new Response("", { status: 302 });
    await expect(fetchPublicChannelPage("discussion_group", undefined, mockFetch as unknown as typeof fetch))
      .rejects.toThrow(PublicChannelRedirectError);
  });

  it("handles 429 rate limiting safely", async () => {
    const mockFetch = async () => new Response("Too Many Requests", { status: 429 });
    await expect(fetchPublicChannelPage("active_channel", undefined, mockFetch as unknown as typeof fetch))
      .rejects.toThrow(PublicChannelRateLimitError);
  });

  it("executes bounded pagination using mock fetch without infinite loop", async () => {
    let callCount = 0;
    const mockFetch = async (url: RequestInfo | URL) => {
      callCount++;
      const urlStr = String(url);
      if (urlStr.includes("before=32147")) {
        // Page 2: no more link
        return new Response(`
          <div class="tgme_channel_info_header_title"><span>Moges Motors</span></div>
          <div class="tgme_widget_message_wrap">
            <div class="tgme_widget_message" data-post="mogesmotor/32140">
              <div class="tgme_widget_message_text">Older car post</div>
              <time datetime="2026-11-18T10:00:00+00:00"></time>
              <span class="tgme_widget_message_views">50</span>
            </div>
          </div>
        `, { status: 200 });
      }
      // Page 1: returns SAMPLE_HTML_FIXTURE with before=32147
      return new Response(SAMPLE_HTML_FIXTURE, { status: 200 });
    };

    const result = await fetchPublicChannelPosts("mogesmotor", {
      maxPages: 3,
      customFetch: mockFetch as unknown as typeof fetch,
    });

    expect(callCount).toBe(2);
    expect(result.pagesFetched).toBe(2);
    expect(result.posts.length).toBe(5); // 4 from page 1 + 1 from page 2
    expect(result.hasMore).toBe(false);
  });
});
