export interface YouTubeChannelSnapshot {
  handle: string;
  youtubeChannelId: string;
  title: string;
  uploadsPlaylistId: string;
  subscriberCount: number | null;
  totalViewCount: bigint | null;
  videoCount: number | null;
}

export interface YouTubeVideoSnapshot {
  youtubeVideoId: string;
  title: string;
  publishedAtUtc: string;
  duration: string | null;
  isShort: boolean;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

export interface FetchYouTubeChannelResult {
  channel: YouTubeChannelSnapshot;
  videos: YouTubeVideoSnapshot[];
  pagesFetched: number;
}

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * Normalizes and validates a YouTube channel handle (e.g. "@MogesMotors" -> "MogesMotors").
 */
export function normalizeYouTubeHandle(input: string): string {
  const cleaned = input.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(cleaned)) {
    throw new Error(`Invalid YouTube channel handle: "${input}".`);
  }
  return cleaned;
}

/**
 * Parses an ISO 8601 duration string into total seconds, or null if invalid.
 */
export function parseIsoDurationSeconds(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(iso.trim());
  if (!match) return null;

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Determines whether a YouTube video is a Short.
 * Videos longer than 200s cannot be Shorts (allows buffer for 3:00 Shorts reported as 3:01).
 * For <= 200s, checks `HEAD /shorts/{id}` with manual redirect (200 = Short, 3xx = regular video),
 * falling back to <= 60s on network failure.
 */
export async function detectIsYouTubeShort(
  videoId: string,
  durationIso: string | null | undefined,
  customFetch: typeof fetch = fetch
): Promise<boolean> {
  const seconds = parseIsoDurationSeconds(durationIso);
  if (seconds !== null && seconds > 200) {
    return false;
  }

  try {
    const res = await customFetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: "HEAD",
      redirect: "manual",
    });
    if (res.status === 200) return true;
    if (res.status >= 300 && res.status < 400) return false;
  } catch {
    // Fallback to duration heuristic if HEAD check fails
  }

  return seconds !== null && seconds <= 60;
}

/**
 * Converts an ISO 8601 duration string (e.g. "PT14M28S", "PT1H2M5S", "PT45S")
 * into a human-readable MM:SS or H:MM:SS string.
 */
export function formatIsoDuration(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(iso.trim());
  if (!match) return null;

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseInt(match[3], 10) : 0;

  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

function parseOptionalInt(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

function parseOptionalBigInt(val: unknown): bigint | null {
  if (val === null || val === undefined || val === "") return null;
  try {
    const str = String(val).trim();
    if (!/^\d+$/.test(str)) return null;
    return BigInt(str);
  } catch {
    return null;
  }
}

async function fetchJson(
  url: string,
  customFetch: typeof fetch = fetch
): Promise<Record<string, unknown>> {
  const res = await customFetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    // Never include the URL (which contains the API key) in error messages
    let apiMsg = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: { message?: string } };
      if (errBody?.error?.message) {
        apiMsg = `${apiMsg}: ${errBody.error.message}`;
      }
    } catch {
      // Ignore parse failures
    }
    throw new Error(`YouTube Data API error (${apiMsg}).`);
  }

  return (await res.json()) as Record<string, unknown>;
}

/**
 * Fetches channel metadata and recent videos via the official YouTube Data API v3.
 * Uses `forHandle` + `uploads` playlist + batched `videos.list` for minimal quota usage.
 */
export async function fetchYouTubeChannelData(
  handleInput: string,
  options: {
    apiKey: string;
    maxPages?: number;
    customFetch?: typeof fetch;
  }
): Promise<FetchYouTubeChannelResult> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is required to fetch YouTube metrics.");
  }

  const handle = normalizeYouTubeHandle(handleInput);
  const maxPages = Math.min(Math.max(options.maxPages ?? 2, 1), 10);
  const customFetch = options.customFetch ?? fetch;

  // 1. Fetch channel details by handle (1 quota unit)
  const channelUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
  channelUrl.searchParams.set("part", "snippet,contentDetails,statistics");
  channelUrl.searchParams.set("forHandle", handle);
  channelUrl.searchParams.set("key", apiKey);

  const channelData = await fetchJson(channelUrl.toString(), customFetch);
  const items = Array.isArray(channelData.items) ? channelData.items : [];
  if (items.length === 0) {
    throw new Error(`YouTube channel "@${handle}" was not found.`);
  }

  const chItem = items[0] as {
    id: string;
    snippet?: { title?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
    statistics?: {
      subscriberCount?: string;
      hiddenSubscriberCount?: boolean;
      viewCount?: string;
      videoCount?: string;
    };
  };

  const uploadsPlaylistId = chItem.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error(`No uploads playlist found for YouTube channel "@${handle}".`);
  }

  const channel: YouTubeChannelSnapshot = {
    handle,
    youtubeChannelId: chItem.id,
    title: chItem.snippet?.title || `@${handle}`,
    uploadsPlaylistId,
    subscriberCount: chItem.statistics?.hiddenSubscriberCount
      ? null
      : parseOptionalInt(chItem.statistics?.subscriberCount),
    totalViewCount: parseOptionalBigInt(chItem.statistics?.viewCount),
    videoCount: parseOptionalInt(chItem.statistics?.videoCount),
  };

  // 2. Paginate uploads playlist for recent video IDs (1 quota unit per page)
  const videoIds: string[] = [];
  let nextPageToken: string | undefined;
  let pagesFetched = 0;

  for (let page = 0; page < maxPages; page++) {
    const playlistUrl = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
    playlistUrl.searchParams.set("part", "contentDetails");
    playlistUrl.searchParams.set("playlistId", uploadsPlaylistId);
    playlistUrl.searchParams.set("maxResults", "50");
    if (nextPageToken) {
      playlistUrl.searchParams.set("pageToken", nextPageToken);
    }
    playlistUrl.searchParams.set("key", apiKey);

    const playlistData = await fetchJson(playlistUrl.toString(), customFetch);
    pagesFetched++;

    const plItems = Array.isArray(playlistData.items) ? playlistData.items : [];
    for (const plItem of plItems) {
      const vid = (plItem as { contentDetails?: { videoId?: string } }).contentDetails?.videoId;
      if (vid && !videoIds.includes(vid)) {
        videoIds.push(vid);
      }
    }

    nextPageToken =
      typeof playlistData.nextPageToken === "string" && playlistData.nextPageToken
        ? playlistData.nextPageToken
        : undefined;

    if (!nextPageToken) break;
  }

  // 3. Batch-fetch video statistics in chunks of 50 (1 quota unit per batch)
  const videos: YouTubeVideoSnapshot[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const videosUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
    videosUrl.searchParams.set("part", "snippet,contentDetails,statistics");
    videosUrl.searchParams.set("id", chunk.join(","));
    videosUrl.searchParams.set("key", apiKey);

    const videosData = await fetchJson(videosUrl.toString(), customFetch);
    const vItems = Array.isArray(videosData.items) ? videosData.items : [];

    for (const rawVideo of vItems) {
      const v = rawVideo as {
        id: string;
        snippet?: { title?: string; publishedAt?: string };
        contentDetails?: { duration?: string };
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      };

      if (!v.id || !v.snippet?.publishedAt) continue;

      const publishedDate = new Date(v.snippet.publishedAt);
      if (Number.isNaN(publishedDate.getTime())) continue;

      const isShort = await detectIsYouTubeShort(
        v.id,
        v.contentDetails?.duration,
        customFetch
      );

      videos.push({
        youtubeVideoId: v.id,
        title: v.snippet.title || "Untitled Video",
        publishedAtUtc: publishedDate.toISOString(),
        duration: formatIsoDuration(v.contentDetails?.duration),
        isShort,
        viewCount: parseOptionalInt(v.statistics?.viewCount),
        likeCount: parseOptionalInt(v.statistics?.likeCount),
        commentCount: parseOptionalInt(v.statistics?.commentCount),
      });
    }
  }

  return {
    channel,
    videos,
    pagesFetched,
  };
}
