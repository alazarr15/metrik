import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";

export async function POST() {
  const isProd = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ success: true, message: "Logged out successfully." });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: isProd,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
