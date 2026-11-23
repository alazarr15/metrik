import { formatLocalDate, getCalendarDaysBetween } from "./timezone";

export interface ViewsObservationRecord {
  id: string;
  postId: string;
  observedAt: Date;
  numericValue: number | null;
  precision: "EXACT" | "ROUNDED" | "UNAVAILABLE";
}

export interface PostWithViewsObservations {
  postId: string;
  observations: ViewsObservationRecord[]; // All VIEWS observations for this post
}

export interface ViewsGrowthCoverage {
  totalPosts: number;
  eligiblePostsCount: number;
  excludedNoBaseline: number;
  excludedNoSubsequentObservation: number;
  excludedRoundedOrUnavailable: number;
  excludedNegativeDelta: number;
}

export interface DailyObservedGrowth {
  date: string;
  observedGrowth: number | null;
  isExact?: boolean;
  reason?: string;
}

export interface ObservedViewsGrowthResult {
  value: number | null;
  isExact: boolean;
  label: string;
  description: string;
  coverage: ViewsGrowthCoverage;
  daily: DailyObservedGrowth[];
}

export const VIEWS_GROWTH_LABEL = "Observed change between observations";
export const VIEWS_GROWTH_DESCRIPTION =
  "Calculated strictly between exact observations of posts with a verified baseline at or before the period start, uninterrupted exact intermediate observations, and verified non-negative consecutive transitions. First observations per post and counter anomalies are excluded.";

/**
 * Calculates Observed Views Growth according to the approved algorithm.
 * Guarantees that:
 * - A post's first observation has no prior baseline and is not counted as views generated that day.
 * - Exact deltas are never calculated from rounded or unavailable counters.
 * - All intermediate observations in the baseline-to-comparison sequence are inspected.
 * - Every consecutive step in the sequence is inspected: any negative step classifies the post as EXCLUDED_NEGATIVE_DELTA.
 * - Negative growth is isolated, never silently returned or coerced to zero.
 */
export function calculateObservedViewsGrowth(
  posts: PostWithViewsObservations[],
  fromUtc: Date,
  toUtc: Date,
  timezone: string,
  localFromDate: string,
  localToDate: string
): ObservedViewsGrowthResult {
  const fromMs = fromUtc.getTime();
  const toMs = toUtc.getTime();

  let eligiblePostsCount = 0;
  let excludedNoBaseline = 0;
  let excludedNoSubsequentObservation = 0;
  let excludedRoundedOrUnavailable = 0;
  let excludedNegativeDelta = 0;

  let totalGrowthSum = 0;

  // Track daily growth increments and day activity
  const dailyGrowthMap = new Map<string, number>();
  const daysWithAnyObservation = new Set<string>();
  const daysWithBaselineOnly = new Set<string>();

  for (const post of posts) {
    // Sort observations chronologically ascending
    const sortedObs = [...post.observations].sort(
      (a, b) => a.observedAt.getTime() - b.observedAt.getTime()
    );

    // Track observation days for calendar reporting
    for (const obs of sortedObs) {
      const obsMs = obs.observedAt.getTime();
      if (obsMs >= fromMs && obsMs < toMs) {
        const localDay = formatLocalDate(obs.observedAt, timezone);
        daysWithAnyObservation.add(localDay);
      }
    }

    // Step A: Baseline observation (latest with observedAt <= fromUtc)
    const baselineCandidates = sortedObs.filter((o) => o.observedAt.getTime() <= fromMs);
    if (baselineCandidates.length === 0) {
      excludedNoBaseline++;
      // Check if an initial observation occurred within [fromUtc, toUtc)
      const firstInWindow = sortedObs.find(
        (o) => o.observedAt.getTime() >= fromMs && o.observedAt.getTime() < toMs
      );
      if (firstInWindow) {
        const localDay = formatLocalDate(firstInWindow.observedAt, timezone);
        daysWithBaselineOnly.add(localDay);
      }
      continue;
    }
    const baselineObs = baselineCandidates[baselineCandidates.length - 1];

    // Step B: Comparison observation (latest with observedAt < toUtc AND observedAt > baseline.observedAt)
    const subsequentCandidates = sortedObs.filter(
      (o) =>
        o.observedAt.getTime() < toMs &&
        o.observedAt.getTime() > baselineObs.observedAt.getTime()
    );
    if (subsequentCandidates.length === 0) {
      excludedNoSubsequentObservation++;
      continue;
    }
    const comparisonObs = subsequentCandidates[subsequentCandidates.length - 1];

    // Step C: Intermediate Observation Path Inspection
    // All observations between baseline and comparison (inclusive)
    const pathObs = sortedObs.filter(
      (o) =>
        o.observedAt.getTime() >= baselineObs.observedAt.getTime() &&
        o.observedAt.getTime() <= comparisonObs.observedAt.getTime()
    );

    const hasBrokenPrecision = pathObs.some(
      (o) => o.precision !== "EXACT" || o.numericValue === null
    );
    if (hasBrokenPrecision) {
      excludedRoundedOrUnavailable++;
      continue;
    }

    // Step D: Consecutive Pair Inspection & Anomaly Handling
    let hasNegativeDelta = false;
    for (let k = 0; k < pathObs.length - 1; k++) {
      const currentVal = pathObs[k].numericValue!;
      const nextVal = pathObs[k + 1].numericValue!;
      if (nextVal < currentVal) {
        hasNegativeDelta = true;
        break;
      }
    }

    if (hasNegativeDelta) {
      excludedNegativeDelta++;
      continue;
    }

    // Post is ELIGIBLE
    eligiblePostsCount++;
    const postGrowth = comparisonObs.numericValue! - baselineObs.numericValue!;
    totalGrowthSum += postGrowth;

    // Daily attribution: each subsequent observation within [fromUtc, toUtc)
    for (let k = 0; k < pathObs.length - 1; k++) {
      const prevObs = pathObs[k];
      const currObs = pathObs[k + 1];
      const currMs = currObs.observedAt.getTime();

      // Only attribute if currObs falls into the requested query window [fromUtc, toUtc)
      if (currMs >= fromMs && currMs < toMs) {
        const delta = currObs.numericValue! - prevObs.numericValue!;
        const localDay = formatLocalDate(currObs.observedAt, timezone);
        dailyGrowthMap.set(localDay, (dailyGrowthMap.get(localDay) ?? 0) + delta);
      }
    }
  }

  // Build daily report for all calendar days
  const allDays = getCalendarDaysBetween(localFromDate, localToDate);
  const daily: DailyObservedGrowth[] = allDays.map((date) => {
    if (dailyGrowthMap.has(date)) {
      return {
        date,
        observedGrowth: dailyGrowthMap.get(date)!,
        isExact: true,
      };
    }

    if (daysWithBaselineOnly.has(date)) {
      return {
        date,
        observedGrowth: null,
        reason: "Baseline establishment only",
      };
    }

    if (daysWithAnyObservation.has(date)) {
      return {
        date,
        observedGrowth: null,
        reason: "Baseline establishment only",
      };
    }

    return {
      date,
      observedGrowth: null,
      reason: "No sync event recorded",
    };
  });

  const value = eligiblePostsCount > 0 ? totalGrowthSum : null;
  const isExact = eligiblePostsCount > 0;

  return {
    value,
    isExact,
    label: VIEWS_GROWTH_LABEL,
    description: VIEWS_GROWTH_DESCRIPTION,
    coverage: {
      totalPosts: posts.length,
      eligiblePostsCount,
      excludedNoBaseline,
      excludedNoSubsequentObservation,
      excludedRoundedOrUnavailable,
      excludedNegativeDelta,
    },
    daily,
  };
}
