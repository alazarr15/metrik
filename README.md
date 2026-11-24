# Metrik — Telegram Analytics Dashboard

Metrik is a self-hosted, open-source analytics dashboard that collects and visualizes channel performance metrics (**Posts Published**, **Lifetime Views**, and **Reactions**) for public Telegram channels. Every user clones and operates their own independent instance.

> **Login-Free Public Collection**: Metrik does **not** require a personal Telegram account, phone number, verification codes, 2FA passwords, or developer API credentials (`api_id` / `api_hash`). It collects publicly available post data via Telegram's public web preview (`https://t.me/s/{username}`).

---

## Technology Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict mode)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **HTML Ingestion**: [Cheerio](https://cheerio.js.org/)
- **Database ORM**: [Prisma](https://www.prisma.io/) with [PostgreSQL](https://www.postgresql.org/)
- **Testing**: [Vitest](https://vitest.dev/)
- **Linting**: [ESLint](https://eslint.org/)
- **Package Manager**: [pnpm](https://pnpm.io/)

---

## Prerequisites

- **Node.js**: v20 or higher (v22+ recommended)
- **pnpm**: v9 or higher
- **PostgreSQL**: v14 or higher (local or managed instance)
- **Target Public Channel**: A public Telegram channel username (e.g. `mogesmotor`)

---

## Local Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/alazarr15/metrik.git
   cd metrik
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Configure environment variables:**

   Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   Update the configuration:
   - `DATABASE_URL`: PostgreSQL connection string (e.g. `postgresql://postgres:postgres@localhost:5432/metrik?schema=public`)
   - `TELEGRAM_CHANNEL_USERNAME`: Target public channel username (e.g. `mogesmotor`)
   - `APP_TIMEZONE`: Timezone for metric date aggregation (default: `UTC`)
   - `TELEGRAM_POLL_INTERVAL_MINUTES`: Background tracking worker polling interval in minutes (default: `30`, min: `5`, max: `1440`)

---

## Development Commands

| Command | Description |
|---|---|
| `pnpm dev` | Starts the Next.js development server on `http://localhost:3000` |
| `pnpm build` | Compiles the production build |
| `pnpm start` | Runs the compiled production server |
| `pnpm lint` | Runs ESLint checks |
| `pnpm typecheck` | Validates TypeScript types |
| `pnpm test` | Runs unit tests (Vitest) |
| `pnpm test:watch` | Runs Vitest in watch mode |
| `pnpm collect:public` | Executes the public channel preview collector spike |
| `pnpm sync:telegram` | Synchronizes channel posts and metrics into PostgreSQL (`pnpm sync:telegram [channel] [pages]`, default: 2 pages, supports `--initial-7d`) |
| `pnpm bootstrap:telegram` | Executes 7-day historical bootstrap for channel (`pnpm bootstrap:telegram [channel]`) |
| `pnpm track:telegram` | Starts the continuous background tracking worker (polls every 30 minutes by default) |
| `pnpm retention:prune` | Prunes redundant historical observations older than 60 days while preserving baseline anchors (`pnpm retention:prune [channel] [days]`) |
| `pnpm prisma generate` | Generates the Prisma Client |
| `pnpm prisma migrate dev` | Applies pending database migrations in development |

---

## Dashboard UI & Authentication

Metrik includes a responsive web dashboard for inspecting channel metrics:
- **Authentication**: Access is guarded by `DASHBOARD_ADMIN_PASSWORD`. Browser clients authenticate at `/login` which establishes a signed, expiring `HttpOnly` session cookie (`SameSite=Strict`, `Path=/`).
- **Channel Selector & Period Filtering**: Supports viewing any tracked Telegram channel with data-availability-aware date range presets (`1D`, `5D`, `7D`, `15D`, `30D`, `60D`). Unavailable ranges are visibly disabled with clear tooltips, and the dashboard gracefully falls back to the longest available valid range.
- **Live Tracking & Auto-Refresh**: Displays real-time worker tracking status (`Tracking Active (30m)` vs. `Tracking Stopped`), bootstrap progress (`Bootstrap Complete` vs. `Bootstrap Incomplete`), last sync timestamp, and next scheduled sync countdown. Includes a built-in 30-second silent background auto-refresh mechanism.
- **Coverage & Tracking Transparency**: Displays actual tracking start date and verified historical coverage days in the channel overview.
- **Metrics & Precision Breakdown**: Visualizes Posts Published, Lifetime Views (exact sums vs. rounded estimates), and Reach (`UNAVAILABLE`).
- **Observed Views Growth**: Displays verified non-negative view deltas between exact post observations, with complete coverage reporting and anomaly isolation.
- **Posts Table & Audit Timeline**: Paginated post inspection with point-in-time observation history modals.

---

## Analytics API Endpoints

Metrik provides five read-only REST endpoints under `/api/`. All endpoints require authentication via `DASHBOARD_ADMIN_PASSWORD` sent as `Authorization: Bearer <password>` or `x-admin-password: <password>` (missing server password fails closed with HTTP 503; invalid/missing client credential returns HTTP 401).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/channels` | Lists all monitored channels, active post counts, and latest sync status |
| `GET` | `/api/channels/[id]` | Channel details, lifetime post counts, reach status (`UNAVAILABLE`), and sync audit |
| `GET` | `/api/channels/[id]/posts` | Paginated posts with latest views/reactions/comments metrics (`publishedAt DESC, id DESC`) |
| `GET` | `/api/channels/[id]/analytics` | Period analytics: posts published, lifetime views breakdown, and Observed Views Growth |
| `GET` | `/api/channels/[id]/posts/[postId]/observations` | Paginated append-only observation history for a specific post |

For complete API specifications, timezone semantics, and calculation algorithms, see [docs/analytics-api-design.md](docs/analytics-api-design.md).

---

## Architecture & Data Integrity Notes

- **Database Foundation**: The PostgreSQL database schema models channels, posts, append-only metric observations, and sync audit runs with strict data integrity rules. See [docs/database-schema.md](docs/database-schema.md) for full details.
- **No Personal Login Required**: The collector operates purely on public channel web previews. No user sessions or SMS codes are used.
- **Counter Precision Handling**:
  - Telegram public web previews display exact integer counts for values $< 1,000$ (e.g. `98`, `450`), but format values $\ge 1,000$ with metric suffixes (e.g. `1.2K`, `1.74M`).
  - Metrik records raw displayed strings alongside parsed numeric values and explicitly tags precision as `exact`, `rounded`, or `unavailable`.
  - Exact view deltas are strictly calculated only between observations with `exact` precision to prevent false delta reporting.
- **Historical 7-Day Bootstrap Engine**:
  - Automatically captures the previous seven calendar days $[D_{\text{today}} - 6, D_{\text{today}}]$ in the channel's timezone (`Africa/Addis_Ababa`).
  - Iteratively paginates backwards until the cutoff date or the origin of the channel is reached (bounded by 10 pages).
  - Explicitly records `BootstrapStatus` (`COMPLETED`, `INCOMPLETE`, `RUNNING`, `FAILED`, `PENDING`).
  - First metric observations are strictly recorded as baseline snapshots and never claimed as historical growth.
- **Continuous 30-Minute Channel Tracking Worker**:
  - Independent background worker (`pnpm track:telegram`) that monitors configured channels every 30 minutes (`TELEGRAM_POLL_INTERVAL_MINUTES=30`, configurable $\ge 5$m).
  - Employs channel-level in-flight concurrency locks to guarantee no overlapping syncs occur for the same channel.
  - Automatically runs 7-day bootstrap first if a channel has not completed bootstrap.
  - Appends new observations only when metric counter values change, preventing duplicate observation bloating.
  - Records periodic health heartbeats every 30 seconds (`WorkerHeartbeat`), enabling the API and dashboard to distinguish active tracking from stopped/dead workers.
  - Handles Telegram rate limits (HTTP 429) with exponential backoff (5-minute pause) and recovers seamlessly after server or process restarts.
- **Rolling 60-Day Retention & Baseline Anchor Preservation**:
  - Raw metric observations are retained across a rolling 60-calendar-day window in the channel's configured timezone.
  - For observations preceding the 60-day boundary, Metrik preserves the single latest observation per post & metric type as the historical baseline anchor. Only redundant observations strictly older than this anchor are pruned.
  - Channel records, Post records, and SyncRun audit logs are never deleted during retention pruning.
- **Initial 7-Day Collection Targeting**:
  - New channels can target posts from the most recent 7 calendar days (`pnpm sync:telegram <channel> --initial-7d`), stopping pagination early once posts older than the cutoff are reached.
- **Data-Aware Analytics Availability & Rolling History Accumulation**:
  - **Initial 7-Day Baseline**: For new channels, initial collection establishes a post dataset spanning the initial 7 calendar days (e.g. November 17–24, 2026).
  - **Post-History vs. Metric-Observation Coverage**:
    - *Post History*: Captures the channel's published posts by Telegram's `publishedAt` timestamp.
    - *Metric Observations*: Captures point-in-time counter snapshots starting only when Metrik records its first sync.
    - *Growth Reconstruction Boundary*: Telegram's public web preview only returns live counters at fetch time. Historical view counters for dates preceding Metrik's first observation do not exist and are never fabricated. A post's initial observation serves solely as its baseline.
  - **Daily Accumulation & Filter Unlock**:
    - As daily synchronizations run, the channel's historical coverage expands from 7 days up to the 60-day rolling retention boundary.
    - Range filters become available strictly when verified historical coverage exists (`1D` $\ge 1$d, `5D` $\ge 5$d, `7D` $\ge 7$d, `15D` $\ge 15$d, `30D` $\ge 30$d, `60D` $\ge 60$d).
    - Presets with insufficient history are disabled on both API and UI, returning clear reasons (e.g. *"Available after 15 days of recorded history."*).
- **Discussion Group Limitations**:
  - Linked discussion groups and comment threads are **not accessible** via public web previews (Telegram redirects group preview requests to a join landing page).
  - Comment counters are captured when exposed on the channel post, but full group discussion analytics are outside the scope of public preview collection.
- **Platform Resilience**:
  - Ingestion respects Telegram rate limits (HTTP 429) and employs bounded pagination (`maxPages`).
  - Ingestion may be affected if Telegram modifies its public web preview HTML structure or imposes network-level request restrictions.

---

## License

[MIT](LICENSE)
