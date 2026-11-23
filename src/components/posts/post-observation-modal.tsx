import React, { useEffect, useState, useCallback } from "react";
import { XIcon, ExternalLinkIcon, ClockIcon, AlertCircleIcon } from "../ui/icons";
import { PrecisionBadge, PrecisionType } from "../ui/badge";

export interface ObservationItem {
  id: string;
  observedAt: string;
  metricType: "VIEWS" | "REACTIONS" | "COMMENTS";
  rawValue: string | null;
  numericValue: number | null;
  precision: PrecisionType;
}

interface PostObservationModalProps {
  channelId: string;
  telegramUsername: string;
  postId: string;
  telegramMessageId: number;
  publishedAt: string;
  postText: string | null;
  onClose: () => void;
}

export function PostObservationModal({
  channelId,
  telegramUsername,
  postId,
  telegramMessageId,
  publishedAt,
  postText,
  onClose,
}: PostObservationModalProps) {
  const [observations, setObservations] = useState<ObservationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metricFilter, setMetricFilter] = useState<string>("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);

  const fetchObservations = useCallback(
    async (cursor?: string) => {
      setErrorMessage(null);

      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (metricFilter) params.set("metricType", metricFilter);
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(
          `/api/channels/${encodeURIComponent(channelId)}/posts/${encodeURIComponent(
            postId
          )}/observations?${params.toString()}`
        );

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || "Failed to load observations.");
        }

        const data = await res.json();
        setObservations(data.observations || []);
        setNextCursor(data.pagination?.nextCursor || null);
        setTotalCount(data.pagination?.totalCount || 0);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Error fetching observations");
      } finally {
        setIsLoading(false);
      }
    },
    [channelId, postId, metricFilter]
  );

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (metricFilter) params.set("metricType", metricFilter);

        const res = await fetch(
          `/api/channels/${encodeURIComponent(channelId)}/posts/${encodeURIComponent(
            postId
          )}/observations?${params.toString()}`
        );

        if (ignore) return;

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || "Failed to load observations.");
        }

        const data = await res.json();
        if (!ignore) {
          setObservations(data.observations || []);
          setNextCursor(data.pagination?.nextCursor || null);
          setTotalCount(data.pagination?.totalCount || 0);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : "Error fetching observations");
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [channelId, postId, metricFilter]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const telegramUrl = `https://t.me/${telegramUsername}/${telegramMessageId}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-post-title"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="modal-post-title"
                className="text-base font-bold text-zinc-900 dark:text-zinc-100"
              >
                Post #{telegramMessageId} Observation History
              </h2>
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>Open in Telegram</span>
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              <ClockIcon className="w-3.5 h-3.5" />
              <span>Published: {new Date(publishedAt).toLocaleString()} (UTC: {publishedAt})</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Post Text Preview */}
        {postText && (
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {postText}
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-zinc-500">Metric Type:</span>
            <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 p-0.5">
              {[
                { label: "All", value: "" },
                { label: "Views", value: "VIEWS" },
                { label: "Reactions", value: "REACTIONS" },
                { label: "Comments", value: "COMMENTS" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMetricFilter(opt.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    metricFilter === opt.value
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-zinc-500">
            Total records: <strong className="font-semibold text-zinc-700 dark:text-zinc-300">{totalCount}</strong>
          </div>
        </div>

        {/* Modal Body / Observations Table */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && observations.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-400 text-xs gap-2">
              <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span>Loading observation audit records...</span>
            </div>
          ) : errorMessage ? (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircleIcon className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : observations.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 italic">
              No observation records match this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="pb-2.5 font-medium">Observed At (UTC)</th>
                    <th className="pb-2.5 font-medium">Metric</th>
                    <th className="pb-2.5 font-medium">Displayed Text</th>
                    <th className="pb-2.5 font-medium">Parsed Value</th>
                    <th className="pb-2.5 font-medium">Precision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {observations.map((obs) => (
                    <tr
                      key={obs.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-2.5 pr-3 text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
                        {new Date(obs.observedAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold text-zinc-800 dark:text-zinc-200">
                        {obs.metricType}
                      </td>
                      <td className="py-2.5 pr-3 text-zinc-600 dark:text-zinc-400 font-mono">
                        {obs.rawValue ?? <span className="text-zinc-400 italic">none</span>}
                      </td>
                      <td className="py-2.5 pr-3 font-bold text-zinc-900 dark:text-zinc-100">
                        {obs.numericValue !== null ? (
                          obs.numericValue.toLocaleString()
                        ) : (
                          <span className="text-zinc-400 font-normal italic">null</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <PrecisionBadge precision={obs.precision} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer / Pagination */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs bg-zinc-50/50 dark:bg-zinc-900/50">
          <span className="text-zinc-500">
            Showing {observations.length} of {totalCount} observations
          </span>
          {nextCursor && (
            <button
              type="button"
              onClick={() => fetchObservations(nextCursor)}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Load Older Observations
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
