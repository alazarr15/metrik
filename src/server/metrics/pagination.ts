import { ApiValidationError } from "./validation";

export interface PostsCursorPayload {
  publishedAt: string; // ISO 8601 UTC string
  id: string;
}

export interface ObservationsCursorPayload {
  observedAt: string; // ISO 8601 UTC string
  id: string;
}

/**
 * Encodes a posts keyset cursor to opaque base64 token.
 */
export function encodePostsCursor(publishedAt: Date, id: string): string {
  const payload: PostsCursorPayload = {
    publishedAt: publishedAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

/**
 * Decodes and validates a posts keyset cursor from opaque base64 token.
 */
export function decodePostsCursor(cursorStr: string): { publishedAt: Date; id: string } {
  try {
    const jsonStr = Buffer.from(cursorStr, "base64").toString("utf-8");
    const parsed = JSON.parse(jsonStr) as Partial<PostsCursorPayload>;

    if (!parsed || typeof parsed.id !== "string" || typeof parsed.publishedAt !== "string") {
      throw new Error("Missing required cursor fields");
    }

    const publishedAt = new Date(parsed.publishedAt);
    if (Number.isNaN(publishedAt.getTime())) {
      throw new Error("Invalid publishedAt date in cursor");
    }

    if (parsed.id.trim() === "") {
      throw new Error("Empty id in cursor");
    }

    return { publishedAt, id: parsed.id };
  } catch {
    throw new ApiValidationError("INVALID_CURSOR", "Invalid pagination cursor.");
  }
}

/**
 * Builds Prisma keyset where clause for posts pagination.
 */
export function buildPostsKeysetWhere(cursor: { publishedAt: Date; id: string }) {
  return {
    OR: [
      { publishedAt: { lt: cursor.publishedAt } },
      {
        publishedAt: cursor.publishedAt,
        id: { lt: cursor.id },
      },
    ],
  };
}

/**
 * Encodes an observations keyset cursor to opaque base64 token.
 */
export function encodeObservationsCursor(observedAt: Date, id: string): string {
  const payload: ObservationsCursorPayload = {
    observedAt: observedAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

/**
 * Decodes and validates an observations keyset cursor from opaque base64 token.
 */
export function decodeObservationsCursor(cursorStr: string): { observedAt: Date; id: string } {
  try {
    const jsonStr = Buffer.from(cursorStr, "base64").toString("utf-8");
    const parsed = JSON.parse(jsonStr) as Partial<ObservationsCursorPayload>;

    if (!parsed || typeof parsed.id !== "string" || typeof parsed.observedAt !== "string") {
      throw new Error("Missing required cursor fields");
    }

    const observedAt = new Date(parsed.observedAt);
    if (Number.isNaN(observedAt.getTime())) {
      throw new Error("Invalid observedAt date in cursor");
    }

    if (parsed.id.trim() === "") {
      throw new Error("Empty id in cursor");
    }

    return { observedAt, id: parsed.id };
  } catch {
    throw new ApiValidationError("INVALID_CURSOR", "Invalid pagination cursor.");
  }
}

/**
 * Builds Prisma keyset where clause for observations pagination.
 */
export function buildObservationsKeysetWhere(cursor: { observedAt: Date; id: string }) {
  return {
    OR: [
      { observedAt: { lt: cursor.observedAt } },
      {
        observedAt: cursor.observedAt,
        id: { lt: cursor.id },
      },
    ],
  };
}
