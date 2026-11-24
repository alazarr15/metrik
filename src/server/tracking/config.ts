export const DEFAULT_POLL_INTERVAL_MINUTES = 30;
export const MIN_POLL_INTERVAL_MINUTES = 5;
export const MAX_POLL_INTERVAL_MINUTES = 1440; // 24 hours

export class TrackingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackingConfigError";
  }
}

/**
 * Resolves and validates the continuous tracking polling interval in minutes.
 * - Defaults to 30 minutes if missing or empty.
 * - Rejects non-integer values.
 * - Rejects excessively aggressive values (< 5 minutes).
 * - Rejects excessive values (> 1440 minutes).
 */
export function resolvePollIntervalMinutes(envVal?: string): number {
  const val = envVal !== undefined && envVal !== "" ? envVal : process.env.TELEGRAM_POLL_INTERVAL_MINUTES;

  if (val === undefined || val === null || val === "") {
    return DEFAULT_POLL_INTERVAL_MINUTES;
  }

  const str = String(val).trim();
  const num = Number(str);

  if (!Number.isInteger(num)) {
    throw new TrackingConfigError(
      `Invalid TELEGRAM_POLL_INTERVAL_MINUTES: "${val}". Value must be a valid integer.`
    );
  }

  if (num < MIN_POLL_INTERVAL_MINUTES) {
    throw new TrackingConfigError(
      `Configured polling interval ${num} minutes is excessively aggressive. Minimum allowed interval is ${MIN_POLL_INTERVAL_MINUTES} minutes.`
    );
  }

  if (num > MAX_POLL_INTERVAL_MINUTES) {
    throw new TrackingConfigError(
      `Configured polling interval ${num} minutes exceeds maximum allowed limit of ${MAX_POLL_INTERVAL_MINUTES} minutes (24 hours).`
    );
  }

  return num;
}

/**
 * Returns the resolved polling interval in milliseconds.
 */
export function resolvePollIntervalMs(envVal?: string): number {
  return resolvePollIntervalMinutes(envVal) * 60 * 1000;
}
