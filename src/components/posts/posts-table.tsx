import React, { useState, useEffect, useCallback } from "react";
import {
  ExternalLinkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  AlertCircleIcon,
  ClockIcon,
} from "../ui/icons";
import { PrecisionType } from "../ui/badge";
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
    <div className="p-6 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all">
      {/* Table Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E5E7EB]">
        <div>
          <h3 className="text-base font-bold text-[#111827] tracking-tight">
            Channel Posts & Latest Metrics
          </h3>
          <p className="text-xs text-[#667085] mt-0.5 line-clamp-2">
            Published channel posts with point-in-time lifetime counters.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-[#667085] cursor-pointer select-none hover:text-[#111827] transition-colors">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="rounded-md border-[#E5E7EB] text-[#2563EB] focus:ring-[#2563EB] transition-colors cursor-pointer"
            />
            <span>Include Deleted Posts</span>
          </label>
        </div>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="my-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircleIcon className="w-4 h-4 shrink-0" />
          <span className="line-clamp-2">{errorMessage}</span>
          <button
            type="button"
            onClick={() => fetchPosts(currentCursor)}
            className="ml-auto font-semibold underline hover:opacity-80 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table Content */}
      <div className="overflow-x-auto my-2">
        <table className="w-full text-left text-xs sm:min-w-[640px]">
          <thead>
            <tr className="border-b border-[#E5E7EB] text-[#667085] font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-3 font-semibold hidden sm:table-cell">Post ID</th>
              <th className="py-3 px-2.5 sm:px-3 font-semibold">Published</th>
              <th className="py-3 px-2.5 sm:px-3 font-semibold">Text Preview</th>
              <th className="py-3 px-2.5 sm:px-3 font-semibold">Views</th>
              <th className="py-3 px-3 font-semibold text-right hidden sm:table-cell">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]/70">
            {isLoading && posts.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-[#667085]">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
                    <span>Loading channel posts...</span>
                  </div>
                </td>
              </tr>
            ) : posts.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-[#667085] italic">
                  No posts found for this channel.
                </td>
              </tr>
            ) : (
              posts.map((post) => {
                const tgUrl = `https://t.me/${telegramUsername}/${post.telegramMessageId}`;
                const isDeleted = post.deletedAt !== null;
                const cleanText = post.text ? post.text.replace(/\s+/g, " ").trim() : "";
                const shortPreview =
                  cleanText.length > 15 ? `${cleanText.slice(0, 15)}...` : cleanText;

                return (
                  <tr
                    key={post.id}
                    onClick={() => setSelectedPost(post)}
                    className={`group/row hover:bg-gradient-to-r hover:from-[#EFF6FF]/60 hover:to-transparent transition-colors cursor-pointer ${
                      isDeleted ? "opacity-60 bg-[#F7F8FA]" : "even:bg-[#FAFAFA]/60"
                    }`}
                  >
                    {/* Message ID (Desktop only) */}
                    <td className="py-3.5 px-3 font-mono font-semibold text-[#111827] hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={tgUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline flex items-center gap-1 text-[#2563EB] font-medium"
                        >
                          #{post.telegramMessageId}
                          <ExternalLinkIcon className="w-3 h-3 opacity-70" />
                        </a>
                        {isDeleted && (
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/10 text-rose-600">
                            DELETED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Published Date */}
                    <td className="py-3.5 px-2.5 sm:px-3 text-[#667085] whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <ClockIcon className="w-3 h-3 text-[#667085] shrink-0" />
                        <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
                      </div>
                    </td>

                    {/* Text Preview (12-15 chars) */}
                    <td className="py-3.5 px-2.5 sm:px-3 text-[#111827]">
                      <div
                        className="font-sans text-xs whitespace-nowrap"
                        title={post.text || "No text content"}
                      >
                        {shortPreview || <span className="text-[#667085] italic">Media post</span>}
                      </div>
                    </td>

                    {/* Views */}
                    <td className="py-3.5 px-2.5 sm:px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <EyeIcon className="w-3.5 h-3.5 text-[#667085] shrink-0" />
                        <span className="font-bold text-[#111827] tabular-nums">
                          {post.metrics.views.numericValue !== null ? (
                            post.metrics.views.numericValue.toLocaleString()
                          ) : (
                            <span className="font-normal text-[#667085] italic">null</span>
                          )}
                        </span>
                      </div>
                    </td>

                    {/* Actions (Desktop only) */}
                    <td className="py-3.5 px-3 text-right hidden sm:table-cell">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPost(post);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-[#E5E7EB] bg-white text-[11px] font-semibold text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] hover:bg-[#EFF6FF] hover:text-[#2563EB] hover:border-[#DBEAFE] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer"
                      >
                        View Post
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
      <div className="pt-4 border-t border-[#E5E7EB] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#667085]">
        <div>
          <span>
            Total: <strong className="font-semibold text-[#111827]">{totalCount}</strong> posts
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={cursorHistory.length === 0 || isLoading}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-[#E5E7EB] bg-white text-xs font-medium text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] hover:bg-[#F7F8FA] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeftIcon className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={!nextCursor || isLoading}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-[#E5E7EB] bg-white text-xs font-medium text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] hover:bg-[#F7F8FA] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-all"
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
