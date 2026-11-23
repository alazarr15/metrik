/**
 * Counter precision and interpretation utilities.
 *
 * Telegram's public web preview displays view counters as:
 * - Integers for values < 1,000 (e.g. "98", "450") -> exact
 * - Metric suffixes for values >= 1,000 (e.g. "1.2K", "37.9K", "1.74M") -> rounded
 *
 * Hard Rules (from AGENTS.md & Project Spec):
 * - Never claim rounded values are exact.
 * - Never calculate exact view deltas from rounded counters.
 * - Do not treat missing data as zero.
 * - If a counter cannot be safely interpreted, preserve raw text and mark numericValue as null.
 */

export type CounterPrecision = "exact" | "rounded" | "unavailable";

export interface ParsedCounter {
  rawText: string;
  numericValue: number | null;
  precision: CounterPrecision;
}

export interface CounterDeltaResult {
  delta: number | null;
  isExact: boolean;
  reason?: string;
}

/**
 * Parses raw displayed counter text (e.g. "98", "1.2K", "1.74M")
 * into a structured ParsedCounter with precision classification.
 */
export function parseDisplayCounter(rawText: string | null | undefined): ParsedCounter {
  if (rawText === null || rawText === undefined) {
    return {
      rawText: "",
      numericValue: null,
      precision: "unavailable",
    };
  }

  const trimmed = rawText.trim();
  if (trimmed === "" || trimmed === "-" || trimmed.toLowerCase() === "unavailable") {
    return {
      rawText: trimmed,
      numericValue: null,
      precision: "unavailable",
    };
  }

  // Exact integer (e.g. "0", "98", "450")
  if (/^\d+$/.test(trimmed)) {
    const val = parseInt(trimmed, 10);
    return {
      rawText: trimmed,
      numericValue: val,
      precision: "exact",
    };
  }

  // Thousands suffix (e.g. "1.2K", "37K", "37.9K")
  const kMatch = /^([\d.]+)K$/i.exec(trimmed);
  if (kMatch) {
    const base = parseFloat(kMatch[1]);
    if (!Number.isNaN(base)) {
      return {
        rawText: trimmed,
        numericValue: Math.round(base * 1000),
        precision: "rounded",
      };
    }
  }

  // Millions suffix (e.g. "1.74M", "5M")
  const mMatch = /^([\d.]+)M$/i.exec(trimmed);
  if (mMatch) {
    const base = parseFloat(mMatch[1]);
    if (!Number.isNaN(base)) {
      return {
        rawText: trimmed,
        numericValue: Math.round(base * 1_000_000),
        precision: "rounded",
      };
    }
  }

  // Fallback for unparseable or unrecognized text
  return {
    rawText: trimmed,
    numericValue: null,
    precision: "unavailable",
  };
}

/**
 * Calculates view growth between two observations of the same post.
 * Strictly prevents false exact delta calculation if either counter is rounded or unavailable.
 */
export function calculateCounterDelta(
  earlier: ParsedCounter,
  later: ParsedCounter
): CounterDeltaResult {
  if (earlier.precision === "unavailable" || later.precision === "unavailable") {
    return {
      delta: null,
      isExact: false,
      reason: "One or both observations are unavailable",
    };
  }

  if (earlier.precision === "rounded" || later.precision === "rounded") {
    return {
      delta: null,
      isExact: false,
      reason: "Cannot calculate exact delta from rounded/approximate counter values",
    };
  }

  if (earlier.numericValue === null || later.numericValue === null) {
    return {
      delta: null,
      isExact: false,
      reason: "Missing numeric values",
    };
  }

  const delta = later.numericValue - earlier.numericValue;
  return {
    delta,
    isExact: true,
  };
}
