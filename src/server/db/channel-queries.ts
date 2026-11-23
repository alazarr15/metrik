import { prisma } from "./client";
import { validateChannelIdentifier, validatePostIdentifier } from "../metrics/validation";

/**
 * Finds a channel by CUID or Telegram handle.
 * Returns null if not found.
 */
export async function findChannelByIdentifier(rawIdentifier: string | undefined | null) {
  const identifier = validateChannelIdentifier(rawIdentifier);

  return prisma.channel.findFirst({
    where: {
      OR: [
        { id: identifier },
        { telegramUsername: { equals: identifier, mode: "insensitive" } },
      ],
    },
  });
}

/**
 * Finds a post within a channel by CUID or Telegram message ID.
 * Returns null if not found.
 */
export async function findPostByIdentifier(
  channelId: string,
  rawPostIdentifier: string | undefined | null
) {
  const postIdentifier = validatePostIdentifier(rawPostIdentifier);

  if (typeof postIdentifier === "number") {
    return prisma.post.findFirst({
      where: {
        channelId,
        telegramMessageId: postIdentifier,
      },
    });
  }

  return prisma.post.findFirst({
    where: {
      channelId,
      id: postIdentifier,
    },
  });
}
