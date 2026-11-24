export const DEFAULT_CHANNEL_TIMEZONE = "Africa/Addis_Ababa";

/**
 * Formats a Date object or UTC timestamp into 'YYYY-MM-DD' in the given IANA timezone.
 */
export function formatLocalDate(date: Date, timezone: string = DEFAULT_CHANNEL_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/**
 * Returns the offset in milliseconds between UTC and the local timezone at a given instant:
 * localTime = utcTime + offsetMs
 */
function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const findPart = (type: string) => {
    const val = parts.find((p) => p.type === type)?.value;
    return val ? parseInt(val, 10) : 0;
  };

  const year = findPart("year");
  const month = findPart("month") - 1;
  const day = findPart("day");
  let hour = findPart("hour");
  if (hour === 24) hour = 0;
  const minute = findPart("minute");
  const second = findPart("second");

  const localAsUtc = Date.UTC(year, month, day, hour, minute, second);
  return localAsUtc - date.getTime();
}

/**
 * Converts a calendar date string (YYYY-MM-DD) at local midnight 00:00:00.000
 * to its exact UTC Date instant in the specified timezone (DST-aware).
 */
export function localMidnightToUtc(dateStr: string, timezone: string = DEFAULT_CHANNEL_TIMEZONE): Date {
  const [yStr, mStr, dStr] = dateStr.split("-");
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10) - 1;
  const day = parseInt(dStr, 10);

  // Target local midnight timestamp interpreted as UTC
  const targetLocalTime = Date.UTC(year, month, day, 0, 0, 0, 0);

  // Initial estimate
  let guessTime = targetLocalTime;
  for (let i = 0; i < 3; i++) {
    const offset = getTimezoneOffsetMs(new Date(guessTime), timezone);
    const resolvedUtc = targetLocalTime - offset;
    if (resolvedUtc === guessTime) {
      break;
    }
    guessTime = resolvedUtc;
  }

  return new Date(guessTime);
}

/**
 * Returns an array of consecutive YYYY-MM-DD date strings between start and end (both inclusive).
 */
export function getCalendarDaysBetween(startLocalDate: string, endLocalDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${startLocalDate}T00:00:00Z`);
  const end = new Date(`${endLocalDate}T00:00:00Z`);

  while (current <= end) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, "0");
    const d = String(current.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export type PresetKey = "1d" | "5d" | "7d" | "15d" | "30d" | "60d";

export const PRESET_DAYS_MAP: Record<PresetKey, number> = {
  "1d": 1,
  "5d": 5,
  "7d": 7,
  "15d": 15,
  "30d": 30,
  "60d": 60,
};

export interface ResolvedPeriod {
  fromUtc: Date;
  toUtc: Date;
  timezone: string;
  localFromDate: string;
  localToDate: string;
}

/**
 * Resolves a preset range ("1d", "5d", "7d", "15d", "30d", "60d")
 * relative to a reference UTC instant in the channel's timezone.
 *
 * "1d": covers today (1 calendar day).
 * "5d": covers today and the preceding 4 calendar days (5 calendar days).
 * "7d": covers today and the preceding 6 calendar days (7 calendar days).
 * "15d": covers today and the preceding 14 calendar days (15 calendar days).
 * "30d": covers today and the preceding 29 calendar days (30 calendar days).
 * "60d": covers today and the preceding 59 calendar days (60 calendar days).
 *
 * Interval: [fromUtc, toUtc) where toUtc is next local midnight (00:00:00 of tomorrow).
 */
export function resolvePresetRange(
  preset: PresetKey,
  referenceDateUtc: Date = new Date(),
  timezone: string = DEFAULT_CHANNEL_TIMEZONE
): ResolvedPeriod {
  const localToday = formatLocalDate(referenceDateUtc, timezone);

  const daysCount = PRESET_DAYS_MAP[preset] ?? 30;

  // Compute start date: localToday - (daysCount - 1) days
  const todayDateObj = new Date(`${localToday}T00:00:00Z`);
  const startDateObj = new Date(todayDateObj.getTime());
  startDateObj.setUTCDate(startDateObj.getUTCDate() - (daysCount - 1));

  const y = startDateObj.getUTCFullYear();
  const m = String(startDateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(startDateObj.getUTCDate()).padStart(2, "0");
  const localFromDate = `${y}-${m}-${d}`;
  const localToDate = localToday;

  // Next local midnight: localToday + 1 day
  const tomorrowObj = new Date(todayDateObj.getTime());
  tomorrowObj.setUTCDate(tomorrowObj.getUTCDate() + 1);
  const tomY = tomorrowObj.getUTCFullYear();
  const tomM = String(tomorrowObj.getUTCMonth() + 1).padStart(2, "0");
  const tomD = String(tomorrowObj.getUTCDate()).padStart(2, "0");
  const localTomorrowDate = `${tomY}-${tomM}-${tomD}`;

  const fromUtc = localMidnightToUtc(localFromDate, timezone);
  const toUtc = localMidnightToUtc(localTomorrowDate, timezone);

  return {
    fromUtc,
    toUtc,
    timezone,
    localFromDate,
    localToDate,
  };
}

/**
 * Resolves an explicit [fromUtc, toUtc) range into local calendar dates in the channel timezone.
 */
export function resolveExplicitPeriod(
  fromUtc: Date,
  toUtc: Date,
  timezone: string = DEFAULT_CHANNEL_TIMEZONE
): ResolvedPeriod {
  const localFromDate = formatLocalDate(fromUtc, timezone);
  // For exclusive toUtc boundary:
  // If toUtc is exactly on midnight, the covered range ends on toUtc - 1ms's day
  const endInstantForCoveredDay = new Date(toUtc.getTime() - 1);
  const localToDate = formatLocalDate(endInstantForCoveredDay, timezone);

  return {
    fromUtc,
    toUtc,
    timezone,
    localFromDate,
    localToDate,
  };
}
