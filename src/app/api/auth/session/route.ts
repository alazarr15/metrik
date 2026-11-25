import { NextResponse } from "next/server";
import { validateApiAccess } from "@/server/auth/guard";

export async function GET(request: Request) {
  const auth = validateApiAccess(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  return NextResponse.json({
    authenticated: true,
    role: auth.role ?? "admin",
  });
}
