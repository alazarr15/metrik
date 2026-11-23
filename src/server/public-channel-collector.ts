import * as cheerio from "cheerio";
import {
  parseDisplayCounter,
  type ParsedCounter,
} from "../lib/counter-precision.ts";

export interface PublicPost {
  id: number;
  channelUsername: string;
  publishedAtUtc: string; // ISO 8601 UTC
  publishedTimestamp: number; // Unix epoch ms
  text: string;
  views: ParsedCounter;
  reactionsCount: ParsedCounter;
  commentsCount: ParsedCounter;
}

export interface PublicChannelPage {
  channelUsername: string;
  channelTitle: string;
  posts: PublicPost[];
  hasMore: boolean;
  beforeId: number | null;
}

export interface BoundedFetchResult {
  channelUsername: string;
  channelTitle: string;
  posts: PublicPost[];
  pagesFetched: number;
  hasMore: boolean;
  oldestPostId: number | null;
  newestPostId: number | null;
}

export class PublicChannelError extends Error {
  readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = "PublicChannelError";
  }
}

export class PublicChannelNotFoundError extends PublicChannelError {
  constructor(username: string) {
    super(`Channel '${username}' was not found on Telegram (404).`, 404);
    this.name = "PublicChannelNotFoundError";
  }
}

export class PublicChannelRedirectError extends PublicChannelError {
  constructor(username: string) {
    super(`Channel '${username}' was redirected. Groups and private chats do not support public web previews.`, 302);
    this.name = "PublicChannelRedirectError";
  }
}

export class PublicChannelRateLimitError extends PublicChannelError {
  constructor() {
    super("Telegram public preview rate limit encountered (HTTP 429).", 429);
    this.name = "PublicChannelRateLimitError";
  }
}

/**
 * Validates and sanitizes a Telegram public channel username.
 * Accepts: "channel", "@channel", "https://t.me/channel", "https://t.me/s/channel"
 */
export function validateChannelUsername(input: string): string {
  if (!input || typeof input !== "string") {
    throw new PublicChannelError("Channel username must be a non-empty string.");
  }

  let cleaned = input.trim();

  // Strip full URL prefixes if pasted
  cleaned = cleaned.replace(/^https?:\/\/t\.me\/s\//i, "");
  cleaned = cleaned.replace(/^https?:\/\/t\.me\//i, "");
  cleaned = cleaned.replace(/^@/, "");

  // Remove trailing slashes
  cleaned = cleaned.replace(/\/+$/, "");

  // Telegram username requirements: 5-32 alphanumeric characters and underscores
  const usernameRegex = /^[a-zA-Z0-9_]{5,32}$/;
  if (!usernameRegex.test(cleaned)) {
    throw new PublicChannelError(
      `Invalid Telegram username '${cleaned}'. Channel usernames must be 5-32 characters long containing only letters, numbers, and underscores.`
    );
  }

  return cleaned.toLowerCase();
}

/**
 * Constructs the public Telegram web preview URL.
 */
export function buildPublicPreviewUrl(username: string, beforeId?: number): string {
  const clean = validateChannelUsername(username);
  let url = `https://t.me/s/${clean}`;
  if (typeof beforeId === "number" && beforeId > 0) {
    url += `?before=${beforeId}`;
  }
  return url;
}

/**
 * Pure parser for Telegram public web preview HTML.
 */
export function parsePublicChannelHtml(html: string, fallbackUsername = ""): PublicChannelPage {
  if (!html || typeof html !== "string") {
    return {
      channelUsername: fallbackUsername,
      channelTitle: "",
      posts: [],
      hasMore: false,
      beforeId: null,
    };
  }

  const $ = cheerio.load(html);

  // Extract channel title
  let channelTitle = $(".tgme_channel_info_header_title span").first().text().trim();
  if (!channelTitle) {
    channelTitle = $(".tgme_channel_info_header_title").first().text().trim();
  }
  if (!channelTitle) {
    const ogTitle = $('meta[property="og:title"]').attr("content");
    if (ogTitle) {
      channelTitle = ogTitle.replace(/^Telegram:\s*Contact\s*@?/i, "").trim();
    }
  }

  // Extract pagination
  let beforeId: number | null = null;
  const moreLink = $("a.tme_messages_more, a.js-messages_more").first();
  if (moreLink.length > 0) {
    const rawBefore = moreLink.attr("data-before") ?? moreLink.attr("href")?.split("before=")[1];
    if (rawBefore) {
      const parsedBefore = parseInt(rawBefore, 10);
      if (!Number.isNaN(parsedBefore) && parsedBefore > 0) {
        beforeId = parsedBefore;
      }
    }
  }

  const posts: PublicPost[] = [];

  $(".tgme_widget_message_wrap").each((_, wrap) => {
    const $wrap = $(wrap);
    const $msg = $wrap.find(".tgme_widget_message").first();
    const dataPost = $msg.attr("data-post");
    if (!dataPost) return;

    const parts = dataPost.split("/");
    if (parts.length < 2) return;

    const postUsername = parts[0] || fallbackUsername;
    const postId = parseInt(parts[1], 10);
    if (Number.isNaN(postId) || postId <= 0) return;

    // Publication time
    const $time = $wrap.find("time[datetime]").first();
    const rawDateTime = $time.attr("datetime");
    let publishedAtUtc = "";
    let publishedTimestamp = 0;

    if (rawDateTime) {
      const parsedDate = new Date(rawDateTime);
      if (!Number.isNaN(parsedDate.getTime())) {
        publishedAtUtc = parsedDate.toISOString();
        publishedTimestamp = parsedDate.getTime();
      }
    }

    // Message text
    const text = $wrap.find(".tgme_widget_message_text").text().trim();

    // Views
    const $views = $wrap.find(".tgme_widget_message_views");
    const viewsRawText = $views.length > 0 ? $views.text().trim() : null;
    const views = parseDisplayCounter(viewsRawText);

    // Reactions (sum of displayed counts)
    let totalReactions = 0;
    let hasReactions = false;
    let isReactionsRounded = false;

    $wrap.find(".tgme_reaction").each((__, reaction) => {
      hasReactions = true;
      const reactionText = $(reaction).text().trim();
      const parsed = parseDisplayCounter(reactionText);
      if (parsed.numericValue !== null) {
        totalReactions += parsed.numericValue;
      }
      if (parsed.precision === "rounded") {
        isReactionsRounded = true;
      }
    });

    const reactionsCount: ParsedCounter = hasReactions
      ? {
          rawText: String(totalReactions),
          numericValue: totalReactions,
          precision: isReactionsRounded ? "rounded" : "exact",
        }
      : {
          rawText: "",
          numericValue: null,
          precision: "unavailable",
        };

    // Comments count (if rendered)
    const $comments = $wrap.find(".tgme_widget_message_comments, a[href*='comment']");
    const commentsRawText = $comments.length > 0 ? $comments.text().trim() : null;
    const commentsCount = parseDisplayCounter(commentsRawText);

    posts.push({
      id: postId,
      channelUsername: postUsername,
      publishedAtUtc,
      publishedTimestamp,
      text,
      views,
      reactionsCount,
      commentsCount,
    });
  });

  return {
    channelUsername: fallbackUsername,
    channelTitle,
    posts,
    hasMore: beforeId !== null,
    beforeId,
  };
}

/**
 * Fetches a single public channel web preview page.
 */
export async function fetchPublicChannelPage(
  username: string,
  beforeId?: number,
  customFetch: typeof fetch = fetch
): Promise<PublicChannelPage> {
  const cleanUsername = validateChannelUsername(username);
  const targetUrl = buildPublicPreviewUrl(cleanUsername, beforeId);

  const response = await customFetch(targetUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "manual",
  });

  if (response.status === 404) {
    throw new PublicChannelNotFoundError(cleanUsername);
  }

  if (response.status === 429) {
    throw new PublicChannelRateLimitError();
  }

  // Telegram redirects discussion groups and invalid preview URLs with 302
  if (response.status === 302 || response.status === 301) {
    throw new PublicChannelRedirectError(cleanUsername);
  }

  if (!response.ok) {
    throw new PublicChannelError(`HTTP request failed with status ${response.status}`, response.status);
  }

  const html = await response.text();
  return parsePublicChannelHtml(html, cleanUsername);
}

/**
 * Bounded public channel collector.
 * Retrieves posts from Telegram public preview up to maxPages.
 */
export async function fetchPublicChannelPosts(
  username: string,
  options?: {
    maxPages?: number;
    customFetch?: typeof fetch;
  }
): Promise<BoundedFetchResult> {
  const cleanUsername = validateChannelUsername(username);
  const maxPages = Math.min(Math.max(options?.maxPages ?? 1, 1), 10);
  const customFetch = options?.customFetch ?? fetch;

  let currentBeforeId: number | undefined;
  let pagesFetched = 0;
  let channelTitle = "";
  const postMap = new Map<number, PublicPost>();
  let hasMore = false;

  while (pagesFetched < maxPages) {
    const page = await fetchPublicChannelPage(cleanUsername, currentBeforeId, customFetch);
    pagesFetched++;

    if (!channelTitle && page.channelTitle) {
      channelTitle = page.channelTitle;
    }

    for (const post of page.posts) {
      postMap.set(post.id, post);
    }

    hasMore = page.hasMore;
    if (!page.hasMore || page.beforeId === null) {
      break;
    }

    // Stop if beforeId did not decrease
    if (currentBeforeId !== undefined && page.beforeId >= currentBeforeId) {
      break;
    }

    currentBeforeId = page.beforeId;
  }

  const allPosts = Array.from(postMap.values()).sort((a, b) => b.id - a.id);
  const newestPostId = allPosts.length > 0 ? allPosts[0].id : null;
  const oldestPostId = allPosts.length > 0 ? allPosts[allPosts.length - 1].id : null;

  return {
    channelUsername: cleanUsername,
    channelTitle,
    posts: allPosts,
    pagesFetched,
    hasMore,
    newestPostId,
    oldestPostId,
  };
}
