import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export interface AuthCheckResult {
  authorized: boolean;
  response?: NextResponse;
}

/**
 * Compares two strings using constant-time comparison.
 * Safely handles strings with differing byte lengths without throwing RangeError.
 */
export function safeCompareSecret(provided: string, expected: string): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") {
    return false;
  }

  const provBuf = Buffer.from(provided, "utf-8");
  const expBuf = Buffer.from(expected, "utf-8");

  if (provBuf.length !== expBuf.length) {
    // Perform constant-time comparison against expected buffer to mitigate timing variance
    timingSafeEqual(expBuf, expBuf);
    return false;
  }

  return timingSafeEqual(provBuf, expBuf);
}

/**
 * Extracts the client credential from Request headers.
 * Accepts:
 * - Authorization: Bearer <password>
 * - x-admin-password: <password>
 */
export function extractClientCredential(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      return parts[1];
    }
  }

  const customHeader = request.headers.get("x-admin-password");
  if (customHeader) {
    return customHeader.trim();
  }

  return null;
}

/**
 * Centralized API Security Guard.
 * Enforces mandatory DASHBOARD_ADMIN_PASSWORD for every request.
 *
 * Rules:
 * - Server password missing/empty: 503 SERVER_MISCONFIGURED
 * - Client credential missing/invalid: 401 UNAUTHORIZED
 * - Timing-safe comparison without logging secrets
 */
export function validateApiAccess(
  request: Request,
  serverPasswordOverride?: string
): AuthCheckResult {
  const serverPassword =
    serverPasswordOverride !== undefined
      ? serverPasswordOverride
      : process.env.DASHBOARD_ADMIN_PASSWORD;

  // 1. Missing or unconfigured server password fails closed
  if (!serverPassword || serverPassword.trim() === "") {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: {
            code: "SERVER_MISCONFIGURED",
            message:
              "DASHBOARD_ADMIN_PASSWORD is not configured on this server. Configure an admin password to enable API access.",
          },
        },
        { status: 503 }
      ),
    };
  }

  // 2. Extract credential from client headers
  const clientCredential = extractClientCredential(request);
  if (!clientCredential) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message:
              "Valid administration credentials are required to access this resource.",
          },
        },
        { status: 401 }
      ),
    };
  }

  // 3. Constant-time comparison
  const isValid = safeCompareSecret(clientCredential, serverPassword.trim());
  if (!isValid) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message:
              "Valid administration credentials are required to access this resource.",
          },
        },
        { status: 401 }
      ),
    };
  }

  return { authorized: true };
}
