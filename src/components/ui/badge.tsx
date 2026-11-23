import React from "react";

export type PrecisionType = "EXACT" | "ROUNDED" | "UNAVAILABLE";
export type SyncStatusType = "SUCCESS" | "RUNNING" | "FAILED";

interface PrecisionBadgeProps {
  precision: PrecisionType | string;
  className?: string;
}

export function PrecisionBadge({ precision, className = "" }: PrecisionBadgeProps) {
  const norm = precision.toUpperCase();

  if (norm === "EXACT") {
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium tracking-tight bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 ${className}`}
        title="Exact count retrieved directly from channel post"
      >
        EXACT
      </span>
    );
  }

  if (norm === "ROUNDED") {
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium tracking-tight bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 ${className}`}
        title="Approximate count with metric suffix (e.g. 1.2K). Not exact."
      >
        ROUNDED
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium tracking-tight bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/20 ${className}`}
      title="Counter unavailable or missing on post"
    >
      UNAVAILABLE
    </span>
  );
}

interface SyncStatusBadgeProps {
  status: SyncStatusType | string;
  className?: string;
}

export function SyncStatusBadge({ status, className = "" }: SyncStatusBadgeProps) {
  const norm = status.toUpperCase();

  if (norm === "SUCCESS") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Synced
      </span>
    );
  }

  if (norm === "RUNNING") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        Syncing
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
      Failed
    </span>
  );
}
