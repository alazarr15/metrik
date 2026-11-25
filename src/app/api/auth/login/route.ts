import { NextResponse } from "next/server";
import { safeCompareSecret } from "@/server/auth/guard";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  validateSameOrigin,
  AuthRole,
} from "@/server/auth/session";
import { recordVisit } from "@/server/activity/visit-logger";

export async function POST(request: Request) {
  // 1. Origin validation against CSRF
  if (!validateSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Cross-origin login requests are rejected." } },
      { status: 403 }
    );
  }

  // 2. Server password configuration check
  const serverPassword = process.env.DASHBOARD_ADMIN_PASSWORD;
  if (!serverPassword || serverPassword.trim() === "") {
    return NextResponse.json(
      {
        error: {
          code: "SERVER_MISCONFIGURED",
          message:
            "DASHBOARD_ADMIN_PASSWORD is not configured on this server. Configure an admin password to enable API access.",
        },
      },
      { status: 503 }
    );
  }

  // 3. Parse input safely
  let submittedPassword = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") {
      submittedPassword = body.password;
    }
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid JSON request body." } },
      { status: 400 }
    );
  }

  if (!submittedPassword) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Admin password is required." } },
      { status: 401 }
    );
  }

  // 4. Timing-safe verification (admin or optional client password)
  let role: AuthRole | null = null;
  if (safeCompareSecret(submittedPassword, serverPassword.trim())) {
    role = "admin";
  } else {
    const clientPassword = process.env.CLIENT_ACCESS_PASSWORD;
    if (
      clientPassword &&
      clientPassword.trim() !== "" &&
      safeCompareSecret(submittedPassword, clientPassword.trim())
    ) {
      role = "client";
    }
  }

  if (!role) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid password." } },
      { status: 401 }
    );
  }

  // 5. Log login event without blocking the auth response
  void recordVisit({
    role,
    event: "login",
    userAgent: request.headers.get("user-agent"),
  });

  // 6. Create signed session token and attach HTTP-only cookie
  const sessionToken = createSessionToken(DEFAULT_SESSION_MAX_AGE_SECONDS, undefined, role);
  const isProd = process.env.NODE_ENV === "production";

  const response = NextResponse.json({
    success: true,
    role,
    message: "Authenticated successfully.",
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    sameSite: "strict",
    secure: isProd,
    path: "/",
    maxAge: DEFAULT_SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
