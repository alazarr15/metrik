# Telegram Access Spike Findings

This document records technical feasibility findings regarding Telegram MTProto API access for Metrik, evaluating post retrieval, lifetime views, and channel statistics.

---

## 1. Environment

- **Node.js Runtime**: `v22.18.0` (with native TypeScript type-stripping support)
- **Library Candidate**: `teleproto` (`v1.233.0`)
  - Description: Actively maintained TypeScript/JavaScript MTProto client for Node.js (GramJS successor).
  - Source/Documentation: [docs.teleproto.dev](https://docs.teleproto.dev) and [core.telegram.org](https://core.telegram.org/api).
- **Test Harness**: Vitest `v3.2.7`, TypeScript `v5.9.3`.

---

## 2. Authentication

- **Interactive Mechanism**:
  - Teleproto's `client.start()` provides interactive prompts for phone number, login code, and optional 2FA cloud password.
  - Interactive terminal input uses Node.js `node:readline/promises` attached to `process.stdin` / `process.stdout`.
- **Session Persistence**:
  - Managed via `teleproto.sessions.StringSession`.
  - Serialized authentication keys are stored locally at `.sessions/telegram.session`.
  - The session file and directory are strictly excluded from version control via `.gitignore`.
  - Re-executing the spike reuses the existing `.sessions/telegram.session` without prompting for re-authentication unless the session is revoked or expired.
- **Security Boundaries**:
  - No session strings, phone numbers, codes, or credentials are logged or exposed to client-side code.

---

## 3. Channel Access

- **Channel Resolution**:
  - `client.getEntity(channelIdentifier)` resolves public handles (e.g. `@channel`) and channel IDs.
  - Returns `Api.Channel` containing title, username, `broadcast` (boolean), and `megagroup` (boolean).
- **Administrative Rights Verification**:
  - Verified via `client.invoke(new Api.channels.GetParticipant({ channel, participant: "me" }))`.
  - Returns `ChannelParticipantCreator` or `ChannelParticipantAdmin`.
  - Exposes administrative privileges (`postMessages`, `editMessages`, `deleteMessages`).

---

## 4. Post Retrieval

- **API Method**:
  - `client.getMessages(channelEntity, { limit: 50, offsetId?: number })` invokes MTProto `messages.GetHistory`.
- **Message Fields Inspected**:
  - `id`: Telegram message ID (positive integer).
  - `date`: Publication timestamp (Unix epoch in seconds). Normalized to ISO 8601 UTC.
  - `views`: Lifetime counter for post views (`number | undefined`).
  - `forwards`: Number of forwards (`number | undefined`).
  - `post`: Boolean indicating whether the message is a broadcast channel post.
- **View Count Availability & Semantics**:
  - `views` represents the cumulative **lifetime** view count of that specific post.
  - Missing views are normalized to `null`, never default to `0`.
- **Pagination**:
  - Tested with bounded backwards pagination using `offsetId: oldestPostId, limit: 10`.
  - Allows backward historical traversal without unbounded crawls.

---

## 5. Channel Statistics (`stats.getBroadcastStats`)

- **Eligibility Check**:
  - Channel metadata must be inspected first via `client.invoke(new Api.channels.GetFullChannel({ channel }))`.
  - `fullChannel.canViewStats` indicates whether the account is eligible to access statistics.
  - Telegram requires channels to satisfy eligibility thresholds (typically at least 50–100 subscribers) before statistics become available.
  - `fullChannel.statsDc` identifies the specific data center hosting the channel statistics.
- **Method**:
  - `client.invoke(new Api.stats.GetBroadcastStats({ channel }), fullChannel.statsDc)`.
- **Returned Data Structure (`Api.stats.BroadcastStats`)**:
  - `period`: `StatsDateRangeDays` (`minDate` and `maxDate` timestamps).
  - `followers`: `StatsAbsValueAndPrev` (`current` and `previous` subscriber count).
  - `viewsPerPost`: `StatsAbsValueAndPrev` (`current` and `previous` **average** views per post).
  - `sharesPerPost`: `StatsAbsValueAndPrev` (average shares per post).
  - `reactionsPerPost`: `StatsAbsValueAndPrev` (average reactions per post).
  - `growthGraph`, `followersGraph`, `topHoursGraph`, `interactionsGraph`, `viewsBySourceGraph`: `StatsGraph` structures.
  - `recentPostsInteractions`: Array of `PostInteractionCounters` (`msgId`, `views`, `forwards`, `reactions`).
- **Semantic Finding**:
  - `views_per_post` represents an **average** (views per post), NOT the total views accumulated across the channel during a period.
  - Telegram does **not** provide a direct "Total Views in Selected Period" metric via `getBroadcastStats`.

---

## 6. Verified by Running It

The following components were executed and verified in the local workspace:

1. **Teleproto Package Integration**:
   - `teleproto@1.233.0` installed cleanly with pnpm v12.
   - Verified exports: `TelegramClient`, `Api`, and `sessions.StringSession`.
2. **Environment Variable Validation**:
   - Spike script cleanly detects missing `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` and exits gracefully with descriptive guidance.
3. **Pure Metric Logic & Formatting**:
   - Post normalization, strict `null` handling for missing views, and `[start, end)` range filtering verified with 5 automated Vitest tests.
4. **TypeScript and Production Build**:
   - Full TypeScript type-checking (`pnpm typecheck`) and Next.js Turbopack build (`pnpm build`) compiled with 0 errors.

---

## 7. Verified Through Official Documentation & Type Definitions

The following capabilities were verified through official Telegram MTProto specifications and Teleproto type definitions:

1. `stats.GetBroadcastStats` returns `Api.stats.BroadcastStats` containing averages (`viewsPerPost`, `sharesPerPost`) and graphs, but no direct period view summation.
2. `Api.ChannelFull` provides `canViewStats` flag and `statsDc` DC identifier.
3. `messages.GetHistory` returns message objects with per-post lifetime `views` counters and UTC Unix timestamps.
4. `FLOOD_WAIT_X` RPC errors specify the exact backoff period in seconds.

---

## 8. Not Verified (Open Questions)

1. **Exact Live Payload of `BroadcastStats` on Sub-100 Subscriber Channels**:
   - In channels with fewer than 50–100 subscribers, Telegram returns `ChatAdminRequiredError` or `canViewStats: false`. The exact graphical breakdown on a live high-volume channel requires testing with an established channel meeting Telegram's threshold.
2. **Post View De-duplication Mechanics**:
   - Telegram does not expose the client-side algorithm used to de-duplicate views (e.g. IP or user ID tracking). Metrik must treat the view count strictly as reported by the Telegram server.

---

## 9. Metric Feasibility Assessment

| Metric | Status | Required Finding & Architecture Impact |
|---|---|---|
| **Posts Published** | **FEASIBLE** | Posts are retrieved with reliable publication timestamps (`date` in seconds). Normalization to UTC and boundary filtering `[start, end)` works reliably. |
| **Lifetime Views** | **FEASIBLE** | Telegram reports cumulative lifetime views per post (`views`). Displayed as lifetime counters, never misrepresented as period views. |
| **Period Views** | **OBSERVED CHANGE ONLY** | Telegram does **not** provide an official period view total. Period views can only be derived from the observed difference between Metrik's own append-only observations across sync runs. A post's initial observation has no baseline and cannot be counted as period change. |
| **Reach** | **UNAVAILABLE** | Telegram does not provide user reach metrics for broadcast channels. Must be displayed as Unavailable. |

---

## Recommendation for Next Phase

Proceed to **Phase 2 (Database Schema & Persistence)** with:
1. Append-only observation schema for channel post snapshots (`postId`, `channelId`, `views`, `forwards`, `observedAt`).
2. Single-channel configuration model.
3. Synchronization run tracking log (`startedAt`, `finishedAt`, `status`, `postsCount`, `error`).
