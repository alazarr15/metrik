export type FacebookItemKind = "POST" | "REEL";

export interface FacebookPageSnapshot {
  facebookPageId: string;
  name: string;
  followersCount: number | null;
  fanCount: number | null;
}

export interface FacebookItemSnapshot {
  facebookItemId: string;
  itemType: FacebookItemKind;
  message: string | null;
  permalinkUrl: string | null;
  publishedAtUtc: string;
  viewsCount: number | null;
  reachCount: number | null;
  reactionsCount: number | null;
  commentsCount: number | null;
  sharesCount: number | null;
}

export interface FetchFacebookPageResult {
  page: FacebookPageSnapshot;
  items: FacebookItemSnapshot[];
}

const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";

function parseOptionalInt(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

async function fetchGraphJson(
  url: string,
  accessToken: string,
  customFetch: typeof fetch = fetch
): Promise<Record<string, unknown>> {
  const res = await customFetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    let apiMsg = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as {
        error?: { message?: string; code?: number };
      };
      if (errBody?.error?.message) {
        apiMsg = `${apiMsg}: ${errBody.error.message}`;
      }
    } catch {
      // Ignore parse failures
    }
    throw new Error(`Facebook Graph API error (${apiMsg}).`);
  }

  return (await res.json()) as Record<string, unknown>;
}

function extractInsightValue(
  insights: unknown,
  metricName: string
): number | null {
  if (!insights || typeof insights !== "object") return null;
  const data = (insights as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;

  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as {
      name?: string;
      values?: Array<{ value?: unknown }>;
    };
    if (item.name === metricName && Array.isArray(item.values) && item.values[0]) {
      return parseOptionalInt(item.values[0].value);
    }
  }
  return null;
}

/**
 * Fetches Facebook Page metadata, feed Posts, and Reels via Meta Graph API.
 */
export async function fetchFacebookPageData(
  pageIdInput: string,
  options: {
    accessToken: string;
    limit?: number;
    customFetch?: typeof fetch;
  }
): Promise<FetchFacebookPageResult> {
  const pageId = pageIdInput.trim();
  const accessToken = options.accessToken?.trim();
  if (!pageId) {
    throw new Error("FACEBOOK_PAGE_ID is required.");
  }
  if (!accessToken) {
    throw new Error("FACEBOOK_ACCESS_TOKEN is required.");
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const customFetch = options.customFetch ?? fetch;

  // 1. Page metadata
  const pageUrl = new URL(`${META_GRAPH_BASE}/${encodeURIComponent(pageId)}`);
  pageUrl.searchParams.set("fields", "id,name,followers_count,fan_count");
  const pageRaw = await fetchGraphJson(pageUrl.toString(), accessToken, customFetch);

  const page: FacebookPageSnapshot = {
    facebookPageId: String(pageRaw.id || pageId),
    name: typeof pageRaw.name === "string" && pageRaw.name ? pageRaw.name : pageId,
    followersCount: parseOptionalInt(pageRaw.followers_count),
    fanCount: parseOptionalInt(pageRaw.fan_count),
  };

  const itemsById = new Map<string, FacebookItemSnapshot>();

  // 2. Fetch Page Reels first (if endpoint is available)
  try {
    const reelsUrl = new URL(
      `${META_GRAPH_BASE}/${encodeURIComponent(pageId)}/video_reels`
    );
    reelsUrl.searchParams.set(
      "fields",
      "id,description,created_time,permalink_url,views,likes.summary(total_count).limit(0),comments.summary(total_count).limit(0)"
    );
    reelsUrl.searchParams.set("limit", String(limit));

    const reelsRaw = await fetchGraphJson(reelsUrl.toString(), accessToken, customFetch);
    const reelsData = Array.isArray(reelsRaw.data) ? reelsRaw.data : [];

    for (const raw of reelsData) {
      const r = raw as {
        id?: string;
        description?: string;
        created_time?: string;
        permalink_url?: string;
        views?: unknown;
        likes?: { summary?: { total_count?: unknown } };
        comments?: { summary?: { total_count?: unknown } };
      };
      if (!r.id || !r.created_time) continue;
      const pub = new Date(r.created_time);
      if (Number.isNaN(pub.getTime())) continue;

      let viewsCount = parseOptionalInt(r.views);
      const reachCount: number | null = null;

      // Best-effort video_insights for Reel plays/views (v21.0+)
      try {
        const insightUrl = new URL(
          `${META_GRAPH_BASE}/${encodeURIComponent(r.id)}/video_insights`
        );
        insightUrl.searchParams.set("metric", "fb_reels_total_plays");
        const insRaw = await fetchGraphJson(insightUrl.toString(), accessToken, customFetch);
        const insViews = extractInsightValue(insRaw, "fb_reels_total_plays");
        if (insViews !== null) viewsCount = insViews;
      } catch {
        // Insights optional if permission or metric is unavailable for this reel
      }

      const permalink = r.permalink_url
        ? r.permalink_url.startsWith("http")
          ? r.permalink_url
          : `https://www.facebook.com${r.permalink_url}`
        : `https://www.facebook.com/reel/${r.id}`;

      itemsById.set(r.id, {
        facebookItemId: r.id,
        itemType: "REEL",
        message: r.description ? r.description.trim() : null,
        permalinkUrl: permalink,
        publishedAtUtc: pub.toISOString(),
        viewsCount,
        reachCount,
        reactionsCount: parseOptionalInt(r.likes?.summary?.total_count),
        commentsCount: parseOptionalInt(r.comments?.summary?.total_count),
        sharesCount: null,
      });
    }
  } catch {
    // video_reels may be empty or unsupported for pages without Reels; continue to /posts
  }

  // 3. Fetch Page Feed Posts (try with post_media_view insights first, fallback without insights)
  const postsFieldsWithInsights =
    "id,message,created_time,permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),insights.metric(post_media_view)";
  const postsFieldsBasic =
    "id,message,created_time,permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)";

  let postsRaw: Record<string, unknown>;
  try {
    const postsUrl = new URL(
      `${META_GRAPH_BASE}/${encodeURIComponent(pageId)}/posts`
    );
    postsUrl.searchParams.set("fields", postsFieldsWithInsights);
    postsUrl.searchParams.set("limit", String(limit));
    postsRaw = await fetchGraphJson(postsUrl.toString(), accessToken, customFetch);
  } catch {
    const postsUrl = new URL(
      `${META_GRAPH_BASE}/${encodeURIComponent(pageId)}/posts`
    );
    postsUrl.searchParams.set("fields", postsFieldsBasic);
    postsUrl.searchParams.set("limit", String(limit));
    postsRaw = await fetchGraphJson(postsUrl.toString(), accessToken, customFetch);
  }

  const postsData = Array.isArray(postsRaw.data) ? postsRaw.data : [];
  for (const raw of postsData) {
    const p = raw as {
      id?: string;
      message?: string;
      created_time?: string;
      permalink_url?: string;
      shares?: { count?: unknown };
      reactions?: { summary?: { total_count?: unknown } };
      comments?: { summary?: { total_count?: unknown } };
      insights?: unknown;
    };
    if (!p.id || !p.created_time) continue;
    const pub = new Date(p.created_time);
    if (Number.isNaN(pub.getTime())) continue;

    // Avoid overwriting if already captured as a Reel (or if permalink points to /reel/)
    const isReelUrl = Boolean(p.permalink_url && p.permalink_url.includes("/reel/"));
    const firstUnderscore = p.id.indexOf("_");
    const shortObjectId = firstUnderscore !== -1 ? p.id.slice(firstUnderscore + 1) : p.id;
    if (itemsById.has(p.id) || itemsById.has(shortObjectId)) {
      continue;
    }

    itemsById.set(p.id, {
      facebookItemId: p.id,
      itemType: isReelUrl ? "REEL" : "POST",
      message: p.message ? p.message.trim() : null,
      permalinkUrl: p.permalink_url || null,
      publishedAtUtc: pub.toISOString(),
      viewsCount: extractInsightValue(p.insights, "post_media_view"),
      reachCount: null,
      reactionsCount: parseOptionalInt(p.reactions?.summary?.total_count),
      commentsCount: parseOptionalInt(p.comments?.summary?.total_count),
      sharesCount: parseOptionalInt(p.shares?.count),
    });
  }

  return {
    page,
    items: Array.from(itemsById.values()),
  };
}
