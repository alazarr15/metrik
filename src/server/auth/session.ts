import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "metrik_session";
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type AuthRole = "admin" | "client";

export interface SessionPayload {
  iat: number; // Issued at (Unix timestamp ms)
  exp: number; // Expiry (Unix timestamp ms)
  sid: string; // Random session nonce
  role?: AuthRole; // Defaults to "admin" for backwards compatibility
}

/**
 * Derives a secure signing key for session tokens.
 * Uses SESSION_SECRET if configured, otherwise derives a dedicated key
 * from DASHBOARD_ADMIN_PASSWORD using HMAC-SHA256 with a project salt.
 */
export function getSessionSigningKey(adminPassword?: string): Buffer {
  const configuredSecret = process.env.SESSION_SECRET;
  if (configuredSecret && configuredSecret.trim().length >= 16) {
    return Buffer.from(configuredSecret.trim(), "utf-8");
  }

  const password = adminPassword || process.env.DASHBOARD_ADMIN_PASSWORD || "";
  if (!password || password.trim() === "") {
    throw new Error("Cannot derive session key: DASHBOARD_ADMIN_PASSWORD is not configured.");
  }

  return createHmac("sha256", "metrik-session-key-salt-v1")
    .update(password.trim())
    .digest();
}

/**
 * Creates a signed session token.
 * Format: <payloadBase64Url>.<signatureHex>
 */
export function createSessionToken(
  maxAgeSeconds = DEFAULT_SESSION_MAX_AGE_SECONDS,
  signingKey?: Buffer,
  role: AuthRole = "admin"
): string {
  const now = Date.now();
  const payload: SessionPayload = {
    iat: now,
    exp: now + maxAgeSeconds * 1000,
    sid: randomBytes(16).toString("hex"),
    role,
  };

  const key = signingKey || getSessionSigningKey();
  const payloadEncoded = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const signature = createHmac("sha256", key).update(payloadEncoded).digest("hex");

  return `${payloadEncoded}.${signature}`;
}

/**
 * Verifies and parses a signed session token.
 * Returns the validated SessionPayload, or null if invalid, expired, or tampered.
 */
export function verifySessionToken(
  token: string | null | undefined,
  signingKey?: Buffer
): SessionPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.trim().split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadEncoded, signature] = parts;
  if (!payloadEncoded || !signature) {
    return null;
  }

  let key: Buffer;
  try {
    key = signingKey || getSessionSigningKey();
  } catch {
    return null;
  }

  // Verify HMAC signature in constant time
  const expectedSignature = createHmac("sha256", key).update(payloadEncoded).digest("hex");
  const expectedBuf = Buffer.from(expectedSignature, "utf-8");
  const providedBuf = Buffer.from(signature, "utf-8");

  if (expectedBuf.length !== providedBuf.length) {
    timingSafeEqual(expectedBuf, expectedBuf);
    return null;
  }

  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  // Parse and validate payload
  try {
    const jsonStr = Buffer.from(payloadEncoded, "base64url").toString("utf-8");
    const payload = JSON.parse(jsonStr) as Partial<SessionPayload>;

    if (
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      typeof payload.sid !== "string"
    ) {
      return null;
    }

    // Check expiration
    if (Date.now() >= payload.exp) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Extracts a cookie value by name from standard Cookie header string.
 */
export function extractCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawKey, ...valParts] = cookie.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(valParts.join("="));
    }
  }
  return null;
}

/**
 * Validates request origin against the Host header to protect against CSRF on state-changing requests.
 */
export function validateSameOrigin(request: Request): boolean {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");

  if (!origin) {
    // Some browsers or local tools might only send referer
    const referer = request.headers.get("referer");
    if (!referer) return true; // Non-browser or direct call
    try {
      const parsedReferer = new URL(referer);
      return !host || parsedReferer.host === host;
    } catch {
      return false;
    }
  }

  try {
    const parsedOrigin = new URL(origin);
    return !host || parsedOrigin.host === host;
  } catch {
    return false;
  }
}
