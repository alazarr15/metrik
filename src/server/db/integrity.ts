import {
  MetricType,
  MetricPrecision,
  type Prisma,
} from "@prisma/client";
import { type ParsedCounter } from "../../lib/counter-precision.ts";

export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataIntegrityError";
  }
}

export interface MetricObservationInput {
  postId: string;
  metricType: MetricType;
  rawValue: string | null;
  numericValue: number | null;
  precision: MetricPrecision;
  observedAt?: Date;
}

/**
 * Validates database metric observation inputs against project data integrity rules:
 * 1. UNAVAILABLE must have numericValue = null.
 * 2. EXACT and ROUNDED must have non-null numericValue.
 * 3. numericValue must never be negative.
 * 4. Missing counters must never be stored as zero.
 */
export function validateMetricObservation(
  input: MetricObservationInput
): Prisma.PostMetricObservationUncheckedCreateInput {
  if (!input.postId || typeof input.postId !== "string") {
    throw new DataIntegrityError("Observation must be linked to a valid postId string.");
  }

  if (!Object.values(MetricType).includes(input.metricType)) {
    throw new DataIntegrityError(`Invalid metricType: ${String(input.metricType)}`);
  }

  if (!Object.values(MetricPrecision).includes(input.precision)) {
    throw new DataIntegrityError(`Invalid precision: ${String(input.precision)}`);
  }

  if (input.precision === MetricPrecision.UNAVAILABLE) {
    if (input.numericValue !== null) {
      throw new DataIntegrityError(
        `UNAVAILABLE metric must have numericValue = null. Missing data must never be stored as ${input.numericValue} or 0.`
      );
    }
  } else {
    // EXACT or ROUNDED
    if (input.numericValue === null || input.numericValue === undefined) {
      throw new DataIntegrityError(
        `${input.precision} metric must have a non-null numericValue.`
      );
    }

    if (typeof input.numericValue !== "number" || Number.isNaN(input.numericValue)) {
      throw new DataIntegrityError(
        `${input.precision} metric numericValue must be a valid number.`
      );
    }

    if (input.numericValue < 0) {
      throw new DataIntegrityError(
        `numericValue must never be negative, received: ${input.numericValue}`
      );
    }
  }

  return {
    postId: input.postId,
    metricType: input.metricType,
    rawValue: input.rawValue,
    numericValue: input.numericValue,
    precision: input.precision,
    ...(input.observedAt ? { observedAt: input.observedAt } : {}),
  };
}

/**
 * Converts a ParsedCounter from the public preview collector
 * into a validated, database-ready metric observation input.
 */
export function createObservationFromParsedCounter(
  postId: string,
  metricType: MetricType,
  parsed: ParsedCounter,
  observedAt?: Date
): Prisma.PostMetricObservationUncheckedCreateInput {
  let precision: MetricPrecision;
  switch (parsed.precision) {
    case "exact":
      precision = MetricPrecision.EXACT;
      break;
    case "rounded":
      precision = MetricPrecision.ROUNDED;
      break;
    case "unavailable":
    default:
      precision = MetricPrecision.UNAVAILABLE;
      break;
  }

  const rawValue = parsed.rawText ? parsed.rawText : null;
  const numericValue = precision === MetricPrecision.UNAVAILABLE ? null : parsed.numericValue;

  return validateMetricObservation({
    postId,
    metricType,
    rawValue,
    numericValue,
    precision,
    observedAt,
  });
}

/**
 * Sanitizes external or execution errors for storage in SyncRun.
 * Ensures credentials, tokens, or raw system paths are not exposed.
 */
export function sanitizeSyncRunError(error: unknown): string {
  if (!error) {
    return "Unknown sync failure";
  }

  let message = "";
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    message = String(error);
  }

  // Redact potential secret patterns (api keys, hashes, bot tokens)
  message = message.replace(/(?:key|token|hash|secret|password|session)[=:]\s*([a-zA-Z0-9_\-]{8,})/gi, "[REDACTED]");

  // Max 500 characters for database storage
  return message.slice(0, 500);
}
