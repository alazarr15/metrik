import React, { useEffect, useState } from "react";
import { XIcon, ExternalLinkIcon, ClockIcon, AlertCircleIcon, EyeIcon } from "../ui/icons";
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
  const [latestView, setLatestView] = useState<ObservationItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadLatestView() {
      try {
        const params = new URLSearchParams({
          limit: "1",
          metricType: "VIEWS",
        });

        const res = await fetch(
          `/api/channels/${encodeURIComponent(channelId)}/posts/${encodeURIComponent(
            postId
          )}/observations?${params.toString()}`
        );

        if (ignore) return;

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || "Failed to load latest view.");
        }

        const data = await res.json();
        if (!ignore) {
          const items: ObservationItem[] = data.observations || [];
          setLatestView(items[0] || null);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : "Error fetching view count");
          setIsLoading(false);
        }
      }
    }

    loadLatestView();
    return () => {
      ignore = true;
    };
  }, [channelId, postId]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-[#E5E7EB] bg-white shadow-xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-post-title"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b border-[#E5E7EB] bg-white">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="modal-post-title"
                className="text-base font-bold text-[#111827] tracking-tight"
              >
                Post #{telegramMessageId}
              </h2>
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline font-medium"
              >
                <span>Open in Telegram</span>
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-[#667085]">
              <ClockIcon className="w-3.5 h-3.5" />
              <span>Published: {new Date(publishedAt).toLocaleString()}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#667085] hover:text-[#111827] hover:bg-[#F7F8FA] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Post Content & Latest View */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">
          {/* Latest View Summary */}
          <div className="p-4 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]">
                <EyeIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#667085]">
                  Latest Views
                </div>
                {isLoading ? (
                  <div className="text-xs text-[#667085] mt-0.5">Loading...</div>
                ) : errorMessage ? (
                  <div className="text-xs text-rose-600 flex items-center gap-1 mt-0.5">
                    <AlertCircleIcon className="w-3.5 h-3.5" />
                    <span>{errorMessage}</span>
                  </div>
                ) : latestView ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xl font-bold text-[#111827] tabular-nums">
                      {latestView.numericValue !== null
                        ? latestView.numericValue.toLocaleString()
                        : "—"}
                    </span>
                    <PrecisionBadge precision={latestView.precision} />
                  </div>
                ) : (
                  <div className="text-xs text-[#667085] italic mt-0.5">No views recorded</div>
                )}
              </div>
            </div>

            {latestView && (
              <div className="text-[11px] text-[#667085]">
                Updated {new Date(latestView.observedAt).toLocaleString()}
              </div>
            )}
          </div>

          {/* Post Text Preview with hover bounce/lift */}
          {postText ? (
            <div className="p-4 rounded-xl border border-[#E5E7EB] bg-white text-[13px] text-[#111827] whitespace-pre-wrap leading-relaxed font-sans shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D1D5DB]">
              {postText}
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-[#E5E7EB] bg-[#F7F8FA] text-xs text-[#667085] italic text-center">
              Media post (no text caption).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
