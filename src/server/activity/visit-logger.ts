import { prisma } from "@/server/db/client";
import type { AuthRole } from "@/server/auth/session";

export type VisitEvent = "login" | "view";
export type VisitPlatform = "telegram" | "youtube" | "facebook" | null;

/**
 * Extracts a concise, human-readable device/browser label from a User-Agent header.
 */
export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua || ua.trim() === "") return "Unknown device";

  let device = "Desktop";
  if (/iPhone/i.test(ua)) device = "iPhone";
  else if (/iPad/i.test(ua)) device = "iPad";
  else if (/Android/i.test(ua)) device = "Android";
  else if (/Macintosh|Mac OS/i.test(ua)) device = "Mac";
  else if (/Windows/i.test(ua)) device = "Windows";
  else if (/Linux/i.test(ua)) device = "Linux";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Telegram/i.test(ua)) browser = "Telegram";

  return `${device} • ${browser}`;
}

export async function recordVisit(params: {
  role: AuthRole;
  event: VisitEvent;
  platform?: VisitPlatform;
  userAgent?: string | null;
}) {
  try {
    await prisma.clientVisit.create({
      data: {
        role: params.role,
        event: params.event,
        platform: params.platform ?? null,
        userAgent: summarizeUserAgent(params.userAgent),
      },
    });
  } catch {
    // Non-blocking: visit logging must never break auth or dashboard loading
  }
}
