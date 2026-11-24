import { resolvePresetRange, PresetKey, DEFAULT_CHANNEL_TIMEZONE, ResolvedPeriod } from "./timezone";

export class ApiValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiValidationError";
    this.code = code;
  }
}

/**
 * Validates a channel identifier: accepts CUID or Telegram handle matching /^[a-zA-Z0-9_]{5,32}$/.
 */
export function validateChannelIdentifier(idInput: string | undefined | null): string {
  if (!idInput || typeof idInput !== "string") {
    throw new ApiValidationError("INVALID_IDENTIFIER", "Channel identifier is required.");
  }
  const trimmed = idInput.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(trimmed)) {
    throw new ApiValidationError(
      "INVALID_IDENTIFIER",
      `Invalid channel identifier: "${idInput}". Must be a valid channel ID or username.`
    );
  }
  return trimmed;
}

/**
 * Validates a post identifier: accepts CUID string or positive integer telegramMessageId.
 */
export function validatePostIdentifier(postIdInput: string | undefined | null): string | number {
  if (!postIdInput || typeof postIdInput !== "string") {
    throw new ApiValidationError("INVALID_IDENTIFIER", "Post identifier is required.");
  }
  const trimmed = postIdInput.trim();
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (num <= 0) {
      throw new ApiValidationError("INVALID_IDENTIFIER", "Telegram message ID must be a positive integer.");
    }
    return num;
  }
  if (!/^[a-zA-Z0-9_-]{5,64}$/.test(trimmed)) {
    throw new ApiValidationError("INVALID_IDENTIFIER", `Invalid post identifier: "${postIdInput}".`);
  }
  return trimmed;
}

/**
 * Validates pagination limit parameter within allowed bounds.
 */
export function parsePaginationLimit(
  limitParam: string | null | undefined,
  defaultLimit: number,
  maxLimit: number
): number {
  if (!limitParam) {
    return defaultLimit;
  }
  const trimmed = limitParam.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new ApiValidationError(
      "INVALID_PAGINATION_LIMIT",
      `Invalid pagination limit: "${limitParam}". Must be an integer between 1 and ${maxLimit}.`
    );
  }
  const num = parseInt(trimmed, 10);
  if (num < 1 || num > maxLimit) {
    throw new ApiValidationError(
      "INVALID_PAGINATION_LIMIT",
      `Pagination limit ${num} is out of bounds. Must be between 1 and ${maxLimit}.`
    );
  }
  return num;
}

/**
 * Validates boolean query parameter strictly ("true" | "false" | "1" | "0").
 */
export function parseBooleanParam(
  param: string | null | undefined,
  defaultValue = false
): boolean {
  if (param === null || param === undefined || param.trim() === "") {
    return defaultValue;
  }
  const normalized = param.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  throw new ApiValidationError(
    "INVALID_BOOLEAN_PARAMETER",
    `Invalid boolean parameter value: "${param}". Allowed values are "true" or "false".`
  );
}

export type RangePreset = PresetKey;

export interface DateRangeResult {
  fromUtc: Date;
  toUtc: Date;
  preset?: RangePreset;
}

/**
 * Validates date range parameters (from, to, range) with mutual exclusivity checks.
 */
export function validateDateRange(
  fromParam: string | null | undefined,
  toParam: string | null | undefined,
  rangeParam: string | null | undefined,
  timezone: string = DEFAULT_CHANNEL_TIMEZONE,
  referenceDateUtc: Date = new Date()
): DateRangeResult {
  const hasRange = Boolean(rangeParam && rangeParam.trim() !== "");
  const hasFrom = Boolean(fromParam && fromParam.trim() !== "");
  const hasTo = Boolean(toParam && toParam.trim() !== "");

  // Mutual exclusivity
  if (hasRange && (hasFrom || hasTo)) {
    throw new ApiValidationError(
      "AMBIGUOUS_RANGE_PARAMETERS",
      "Cannot combine preset 'range' parameter with explicit 'from' or 'to' timestamps."
    );
  }

  // Handle Preset range
  if (hasRange) {
    const rangeVal = rangeParam!.trim().toLowerCase();
    const validPresets: RangePreset[] = ["1d", "5d", "7d", "15d", "30d", "60d"];
    if (!validPresets.includes(rangeVal as RangePreset)) {
      throw new ApiValidationError(
        "INVALID_RANGE_PRESET",
        `Invalid range preset: "${rangeParam}". Allowed presets are "1d", "5d", "7d", "15d", "30d", or "60d".`
      );
    }
    const resolved: ResolvedPeriod = resolvePresetRange(
      rangeVal as RangePreset,
      referenceDateUtc,
      timezone
    );
    return {
      fromUtc: resolved.fromUtc,
      toUtc: resolved.toUtc,
      preset: rangeVal as RangePreset,
    };
  }

  // If neither range nor from/to provided, default to 30d
  if (!hasFrom && !hasTo) {
    const resolved: ResolvedPeriod = resolvePresetRange("30d", referenceDateUtc, timezone);
    return {
      fromUtc: resolved.fromUtc,
      toUtc: resolved.toUtc,
      preset: "30d",
    };
  }

  if (!hasFrom || !hasTo) {
    throw new ApiValidationError(
      "INCOMPLETE_DATE_RANGE",
      "Both 'from' and 'to' parameters must be provided when querying an explicit date range."
    );
  }

  // Validate ISO 8601 timestamps
  const fromDate = new Date(fromParam!.trim());
  if (Number.isNaN(fromDate.getTime())) {
    throw new ApiValidationError(
      "INVALID_DATE_FORMAT",
      `Invalid 'from' timestamp: "${fromParam}". Must be a valid ISO 8601 string.`
    );
  }

  const toDate = new Date(toParam!.trim());
  if (Number.isNaN(toDate.getTime())) {
    throw new ApiValidationError(
      "INVALID_DATE_FORMAT",
      `Invalid 'to' timestamp: "${toParam}". Must be a valid ISO 8601 string.`
    );
  }

  if (fromDate.getTime() >= toDate.getTime()) {
    throw new ApiValidationError(
      "INVALID_DATE_RANGE",
      "'from' timestamp must strictly precede 'to' timestamp."
    );
  }

  const spanDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  if (spanDays > 365) {
    throw new ApiValidationError(
      "RANGE_EXCEEDS_MAXIMUM",
      `Requested date range (${Math.round(spanDays)} days) exceeds the maximum allowed limit of 365 days.`
    );
  }

  return {
    fromUtc: fromDate,
    toUtc: toDate,
  };
}
