# Metrik — Public Telegram Data Access Feasibility Spike

This document evaluates the technical feasibility of collecting Telegram channel analytics without requiring a personal Telegram MTProto user session. It compares three distinct approaches:
1. **Public Telegram Web Preview** (`https://t.me/s/CHANNEL_USERNAME`)
2. **Official Telegram Bot API** (`core.telegram.org/bots/api`)
3. **Teleproto MTProto User Client** (`teleproto` MTProto library)

---

## 1. Public Channel Web Preview (`https://t.me/s/CHANNEL_USERNAME`)

### A. Access Verification
- **Unauthenticated HTTP Access**: Verified. An unauthenticated HTTP `GET` request to `https://t.me/s/CHANNEL_USERNAME` returns `HTTP 200 OK` with full server-rendered HTML.
- **Bot/Scraping Mitigations**: Telegram sends standard cookies (`stel_ssid`) and cache-control headers (`no-store`), but does not require JavaScript execution for the initial batch of messages.

### B. Exposed Data Elements
| Element | Available in Public Preview | Details |
|---|---|---|
| **Channel Title** | **Yes** | `<div class="tgme_channel_info_header_title">` |
| **Post ID** | **Yes** | Extracted from `data-post="channel/ID"` attribute (e.g. `32147`) |
| **Post Text / Media** | **Yes** | `<div class="tgme_widget_message_text">` and attached media tags |
| **Publication Timestamp** | **Yes** | `<time datetime="YYYY-MM-DDTHH:mm:ss+00:00">` (exact ISO 8601 UTC) |
| **Lifetime Views** | **Partial (Formatted)** | `<span class="tgme_widget_message_views">98</span>`. **Limitation**: Exact integer is exposed only for counts under 1,000. Counts $\ge 1,000$ are abbreviated with suffixes (e.g. `1.2K`, `1.74M`), preventing exact single-view tracking. |
| **Reaction Counts** | **Partial (Formatted)** | `<div class="tgme_widget_message_reactions">` displays emoji and abbreviated count (e.g. `22K`, `37.9K`). |
| **Comment Counts** | **No** | Comment counts and discussion links are **not** consistently rendered on public preview posts. |
| **Pagination** | **Yes** | Historical batches can be navigated using the query parameter `?before=MESSAGE_ID` (e.g. `https://t.me/s/channel?before=32147`). |

### C. Limitations & Governance
- **Project Rule Conflict**: Root `AGENTS.md` (Section 3) explicitly dictates: *"Do not scrape Telegram or bypass its restrictions. Use official APIs only."* Web scraping of `t.me/s/` directly breaches this project rule unless explicitly approved by the owner.
- **Metric Distortion**: Abbreviated view counters (`1.74M`) prevent accurate calculation of day-to-day observed deltas.

---

## 2. Linked Discussion Group Access

### A. Public Web Access to Groups
- **Group Preview (`https://t.me/s/GROUP_USERNAME`)**: **Unavailable**.
  - Attempting to access `https://t.me/s/` for a group or supergroup returns `HTTP 302 Found`, redirecting to `https://t.me/GROUP_USERNAME`.
  - The landing page at `https://t.me/GROUP_USERNAME` only displays group metadata (title, member count, avatar) and a "View in Telegram" deeplink.
- **Message & Comment Visibility**: Individual discussion comments and reply threads are **completely inaccessible** via public web preview.
- **Post-to-Comment Association**: Inaccessible without an authenticated MTProto session.

---

## 3. Official Telegram Bot API (`core.telegram.org/bots/api`)

### A. Capabilities & Setup
- **Authentication**: Uses a simple Bot Token (`BOT_TOKEN`) generated via `@BotFather`. Requires **no personal phone number, no SMS, and no 2FA password**.
- **Channel Access**: A bot must be added to the channel as an **Administrator** with at least "Post Messages" or read privileges.
- **New Posts Notification**: The bot receives `channel_post` and `edited_channel_post` updates in real time via long polling (`getUpdates`) or Webhooks.
- **Discussion Group Comments**:
  - If added to the linked discussion group with Group Privacy Mode disabled (`/setprivacy` $\to$ Disable in `@BotFather`) or promoted to Admin, the bot receives incoming group comments.
  - The incoming `Message` object includes `reply_to_message`, which links directly to the forwarded channel post (`is_automatic_forward: true`).

### B. Fatal Limitations for Metrik's Core Requirements
1. **No View Counts**:
   - The official Bot API `Message` schema **does not include a `views` field**.
   - Telegram has intentionally excluded post view counters from the Bot API.
2. **No Historical Message Retrieval**:
   - The Bot API provides **no `getHistory` or `getMessages` endpoint**.
   - A bot only receives messages published *after* it joins. It cannot retrieve existing channel posts or historical benchmarks.
3. **No Channel Statistics**:
   - The Bot API does not expose `stats.getBroadcastStats`.

---

## 4. Teleproto (MTProto Client API)

### Capabilities
- **Official Protocol**: Uses Telegram's binary MTProto protocol (Layer 233).
- **Post Retrieval**: Full backward pagination via `messages.GetHistory`.
- **Exact View Counters**: Full integer lifetime view counts on every message (`msg.views`).
- **Discussion Comments**: Full thread comment access via `messages.GetReplies`.
- **Channel Statistics**: Access to `stats.GetBroadcastStats` for eligible channels.

### Trade-Off
- Requires a user account session (`api_id`, `api_hash`, phone login). Telegram routes login verification codes to an existing active Telegram app (in-app service chat) rather than SMS.

---

## 5. Data Availability Matrix

| Capability / Metric | Public Web Preview (`t.me/s/`) | Telegram Bot API | Teleproto MTProto (User) | Teleproto MTProto (Bot Token) |
|---|---|---|---|---|
| **Authentication Requirement** | None | Bot Token | Phone + In-App Code | Bot Token |
| **Official API Status** | No (Web Scrape) | Yes (HTTP REST) | Yes (MTProto Binary) | Yes (MTProto Binary) |
| **Posts Published (History)** | Yes (HTML pagination) | **No** (0 historical posts) | **Yes** (Full history) | **No** (`GetHistory` is User-only) |
| **Posts Published (Realtime)** | Poll-based | Yes (`channel_post`) | Yes (`updateNewChannelMessage`) | Yes |
| **Exact Lifetime Views** | **No** (Truncated K/M) | **No** (Field does not exist) | **Yes** (Exact integer) | **No** |
| **Period Views (Observed)** | Coarse/Inaccurate ($\ge 1\text{K}$) | **No** | **Yes** (Exact delta) | **No** |
| **Discussion Group Comments** | **No** (302 Redirect) | Yes (New comments only) | **Yes** (`messages.GetReplies`) | **No** (History blocked) |
| **Channel Broadcast Stats** | **No** | **No** | **Yes** (`stats.GetBroadcastStats`) | **No** |
| **AGENTS.md Compliance** | **Violates Rule 3** | Fully Compliant | Fully Compliant | Fully Compliant |

---

## 6. Technical Conclusions & Feasibility Verdict

### Is a "No-Personal-Login" Metrik Feasible?
1. **Via Telegram Bot API**: **INFEASIBLE**.
   - Metrik’s core purpose is tracking **Posts Published** and **Views**.
   - The Bot API provides **0 view counts** and **0 historical posts**. A dashboard built solely on the Bot API cannot display past posts and cannot display views.
2. **Via Public Web Preview (`t.me/s/`)**: **CONDITIONALLY FEASIBLE BUT VIOLATES RULES & PRECISION**.
   - While an HTTP client can scrape posts and publish dates from `https://t.me/s/`, views are rounded to strings like `1.2K` or `1.74M`. Calculating daily delta views from rounded numbers creates severe error margins.
   - Crucially, this requires scraping HTML, which directly violates `AGENTS.md` Hard Rule 3 (*"Do not scrape Telegram or bypass its restrictions. Use official APIs only"*).
3. **Via Teleproto MTProto**: **THE ONLY VALID PATH FOR ACCURATE ANALYTICS**.
   - MTProto is the only mechanism Telegram provides that returns exact per-post lifetime views and full historical backfill.

---

## 7. Recommended Architecture

1. **Retain Teleproto MTProto as the Core Engine**:
   - The login verification issue encountered during Phase 1 is not an API limitation; it is Telegram's security policy dispatching the login code **to the official Telegram app** (Service Notifications chat) rather than SMS.
   - With the diagnostic output now added to `scripts/telegram-spike.ts`, the operator can retrieve the code from their Telegram app or request SMS fallback after the timeout.
2. **Alternative Consideration: Hybrid Collector (If Rule 3 is Amended)**:
   - If the project owner explicitly waives the scraping prohibition for public channels:
     - Public web preview can ingest post IDs, UTC timestamps, and initial rounded views without login.
     - However, discussion comments and exact view deltas remain compromised.
   - **Recommendation**: Do not compromise metric integrity or scrape web HTML. Complete MTProto user authentication using the in-app code.
