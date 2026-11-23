import React, { useState, useEffect, useCallback } from "react";
import {
  ExternalLinkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  MessageSquareIcon,
  HeartIcon,
  AlertCircleIcon,
  ClockIcon,
} from "../ui/icons";
import { PrecisionBadge, PrecisionType } from "../ui/badge";
import { PostObservationModal } from "./post-observation-modal";

export interface PostMetricSnapshot {
  rawValue: string | null;
  numericValue: number | null;
  precision: PrecisionType;
  observedAt: string | null;
}

export interface PostItem {
  id: string;
  telegramMessageId: number;
  publishedAt: string;
  text: string | null;
  deletedAt: string | null;
  metrics: {
    views: PostMetricSnapshot;
    reactions: PostMetricSnapshot;
    comments: PostMetricSnapshot;
  };
  observationsCount: number;
}

interface PostsTableProps {
  channelId: string;
  telegramUsername: string;
}

export function PostsTable({ channelId, telegramUsername }: PostsTableProps) {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostItem | null>(null);

  // Pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);

  const fetchPosts = useCallback(
    async (cursor?: string) => {
      setErrorMessage(null);

      try {
        const params = new URLSearchParams();
        params.set("limit", "15");
        if (includeDeleted) params.set("includeDeleted", "true");
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(
          `/api/channels/${encodeURIComponent(channelId)}/posts?${params.toString()}`
        );

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || "Failed to load channel posts.");
        }

        const data = await res.json();
        setPosts(data.posts || []);
        setNextCursor(data.pagination?.nextCursor || null);
        setTotalCount(data.pagination?.totalCount || 0);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Error fetching posts");
      } finally {
        setIsLoading(false);
      }
    },
    [channelId, includeDeleted]
  );

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const params = new URLSearchParams();
        params.set("limit", "15");
        if (includeDeleted) params.set("includeDeleted", "true");

        const res = await fetch(
          `/api/channels/${encodeURIComponent(channelId)}/posts?${params.toString()}`
        );

        if (ignore) return;

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || "Failed to load channel posts.");
        }

        const data = await res.json();
        if (!ignore) {
          setPosts(data.posts || []);
          setNextCursor(data.pagination?.nextCursor || null);
          setTotalCount(data.pagination?.totalCount || 0);
          setCursorHistory([]);
          setCurrentCursor(undefined);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : "Error fetching posts");
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [channelId, includeDeleted]);

  function handleNextPage() {
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, currentCursor || ""]);
    setCurrentCursor(nextCursor);
    fetchPosts(nextCursor);
  }

  function handlePrevPage() {
    if (cursorHistory.length === 0) return;
    const prevHistory = [...cursorHistory];
    const prevCursor = prevHistory.pop();
    setCursorHistory(prevHistory);
    setCurrentCursor(prevCursor || undefined);
    fetchPosts(prevCursor || undefined);
  }

  return (
    <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
      {/* Table Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Channel Posts & Latest Metrics
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Deterministic keyset pagination sorted by publication date descending
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="rounded border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500"
            />
            <span>Include Deleted Posts</span>
          </label>
        </div>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="my-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircleIcon className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => fetchPosts(currentCursor)}
            className="ml-auto underline hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table Content */}
      <div className="overflow-x-auto my-2">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-3 font-medium">Post ID</th>
              <th className="py-3 px-3 font-medium">Published</th>
              <th className="py-3 px-3 font-medium max-w-xs">Text Preview</th>
              <th className="py-3 px-3 font-medium">Views</th>
              <th className="py-3 px-3 font-medium">Reactions</th>
              <th className="py-3 px-3 font-medium">Comments</th>
              <th className="py-3 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {isLoading && posts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-400">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Loading channel posts...</span>
                  </div>
                </td>
              </tr>
            ) : posts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-500 italic">
                  No posts found for this channel.
                </td>
              </tr>
            ) : (
              posts.map((post) => {
                const tgUrl = `https://t.me/${telegramUsername}/${post.telegramMessageId}`;
                const isDeleted = post.deletedAt !== null;

                return (
                  <tr
                    key={post.id}
                    className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors ${
                      isDeleted ? "opacity-60 bg-zinc-50/50 dark:bg-zinc-900/50" : ""
                    }`}
                  >
                    {/* Message ID */}
                    <td className="py-3 px-3 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={tgUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center gap-1 text-blue-600 dark:text-blue-400"
                        >
                          #{post.telegramMessageId}
                          <ExternalLinkIcon className="w-3 h-3 opacity-60" />
                        </a>
                        {isDeleted && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/10 text-rose-500">
                            DELETED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Published Date */}
                    <td className="py-3 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-[11px]">
                        <ClockIcon className="w-3 h-3 text-zinc-400" />
                        <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
                      </div>
                    </td>

                    {/* Text Preview */}
                    <td className="py-3 px-3 max-w-xs text-zinc-700 dark:text-zinc-300">
                      <div
                        className="truncate max-w-xs font-sans text-xs"
                        title={post.text || "No text content"}
                      >
                        {post.text || <span className="text-zinc-400 italic">Media post</span>}
                      </div>
                    </td>

                    {/* Views */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <EyeIcon className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">
                          {post.metrics.views.numericValue !== null ? (
                            post.metrics.views.numericValue.toLocaleString()
                          ) : (
                            <span className="font-normal text-zinc-400 italic">null</span>
                          )}
                        </span>
                        <PrecisionBadge precision={post.metrics.views.precision} />
                      </div>
                    </td>

                    {/* Reactions */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <HeartIcon className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {post.metrics.reactions.numericValue !== null
                            ? post.metrics.reactions.numericValue.toLocaleString()
                            : "—"}
                        </span>
                        {post.metrics.reactions.precision !== "UNAVAILABLE" && (
                          <PrecisionBadge precision={post.metrics.reactions.precision} />
                        )}
                      </div>
                    </td>

                    {/* Comments */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <MessageSquareIcon className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {post.metrics.comments.numericValue !== null
                            ? post.metrics.comments.numericValue.toLocaleString()
                            : "—"}
                        </span>
                        {post.metrics.comments.precision !== "UNAVAILABLE" && (
                          <PrecisionBadge precision={post.metrics.comments.precision} />
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedPost(post)}
                        className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        Inspect ({post.observationsCount})
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
        <div>
          <span>
            Total: <strong className="font-semibold text-zinc-700 dark:text-zinc-300">{totalCount}</strong> posts
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={cursorHistory.length === 0 || isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeftIcon className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={!nextCursor || isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <span>Next</span>
            <ChevronRightIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Post Observation Modal */}
      {selectedPost && (
        <PostObservationModal
          channelId={channelId}
          telegramUsername={telegramUsername}
          postId={selectedPost.id}
          telegramMessageId={selectedPost.telegramMessageId}
          publishedAt={selectedPost.publishedAt}
          postText={selectedPost.text}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
