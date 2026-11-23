# Database Schema Documentation

Metrik uses PostgreSQL with Prisma ORM to store public Telegram channel metadata, channel posts, append-only metric observations, and sync execution logs.

---

## Entity Relationship Overview

```
┌─────────────────────────────────┐
│            Channel              │
├─────────────────────────────────┤
│ id (PK)                         │
│ telegramUsername (Unique)       │
│ title                           │
│ timezone (Default: Addis_Ababa) │
│ createdAt / updatedAt           │
└──────────────┬──────────────────┘
               │ 1
               │
               │ *
       ┌───────┴───────────────┐
       │                       │
┌──────▼──────────┐     ┌──────▼──────────┐
│      Post       │     │     SyncRun     │
├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │
│ channelId (FK)  │     │ channelId (FK)  │
│ telegramMsgId   │     │ startedAt       │
│ publishedAt     │     │ finishedAt      │
│ text            │     │ status          │
│ deletedAt       │     │ pagesFetched    │
│ createdAt/updAt │     │ postsFetched    │
└──────┬──────────┘     │ errorMessage    │
       │ 1              └─────────────────┘
       │
       │ * (onDelete: Restrict)
┌──────▼──────────────────────────┐
│     PostMetricObservation       │
├─────────────────────────────────┤
│ id (PK)                         │
│ postId (FK)                     │
│ observedAt                      │
│ metricType (VIEWS/REACT/COMM)   │
│ rawValue (string)               │
│ numericValue (integer, nullable)│
│ precision (EXACT/ROUND/UNAVAIL) │
└─────────────────────────────────┘
```

---

## Models

### 1. `Channel` (`channels`)
Represents a monitored public Telegram broadcast channel.
- `id`: Unique identifier (CUID).
- `telegramUsername`: Channel username without `@` symbol (Unique index).
- `title`: Channel display name (nullable until first sync).
- `timezone`: Timezone for analytics and calendar day boundaries (defaults to `Africa/Addis_Ababa`).
- `createdAt` / `updatedAt`: Standard audit timestamps.

### 2. `Post` (`posts`)
Represents an individual message published in a monitored Telegram channel.
- `id`: Unique identifier (CUID).
- `channelId`: Foreign key reference to `Channel` (`onDelete: Cascade`).
- `telegramMessageId`: Integer ID of the message within the Telegram channel.
- `publishedAt`: Publication timestamp in UTC.
- `text`: Message text content (nullable for media-only posts).
- `deletedAt`: Timestamp if the post is deleted on Telegram (soft delete, nullable).
- Constraints:
  - `@@unique([channelId, telegramMessageId])`: Ensures sync operations are idempotent and prevents duplicate posts.
  - `@@index([channelId, publishedAt])`: Optimizes timeline querying.

### 3. `PostMetricObservation` (`post_metric_observations`)
Stores point-in-time observations of post performance metrics.
- **Append-only**: Never updated or overwritten. Has no `updatedAt` column.
- `id`: Unique identifier (CUID).
- `postId`: Foreign key reference to `Post` with `onDelete: Restrict` to safeguard observation history.
- `observedAt`: UTC timestamp of the observation.
- `metricType`: Enum `VIEWS`, `REACTIONS`, `COMMENTS`.
- `rawValue`: Raw text from the page (e.g. `"98"`, `"1.2K"`, `"1.74M"`).
- `numericValue`: Parsed numeric representation (nullable).
- `precision`: Enum `EXACT`, `ROUNDED`, `UNAVAILABLE`.

### 4. `SyncRun` (`sync_runs`)
Audit log recording every execution of the collector.
- `id`: Unique identifier (CUID).
- `channelId`: Channel being synced.
- `startedAt` / `finishedAt`: Execution timestamps.
- `status`: Enum `RUNNING`, `SUCCESS`, `FAILED`.
- `pagesFetched` / `postsFetched`: Execution counters.
- `errorMessage`: Sanitized error description if a sync fails.

---

## Data Integrity Rules

1. **Missing Data Policy**:
   - `UNAVAILABLE` observations **must** have `numericValue = null`.
   - Missing metrics are strictly never stored as zero.
2. **Precision Classification**:
   - `EXACT`: Counters $< 1,000$ (e.g. `98`, `450`) or true zero values. `numericValue` is non-null.
   - `ROUNDED`: Counters $\ge 1,000$ with metric suffixes (e.g. `1.2K`, `1.74M`). `numericValue` contains the calculated integer approximation. Must retain `ROUNDED` classification and must never be treated as exact in delta calculations.
   - `UNAVAILABLE`: Missing or unparseable counters. `numericValue` is null.
3. **Non-negative Numeric Values**:
   - All `numericValue` numbers must be $\ge 0$.
4. **History Preservation**:
   - Post deletion on Telegram updates `deletedAt` without hard-deleting the post or its historical metric observations.
   - Foreign key constraint on `PostMetricObservation.postId` uses `onDelete: Restrict`.
5. **Database-Level CHECK Constraints**:
   - Migration enforces `chk_observation_precision_rules`:
     ```sql
     CHECK (
       ("precision" = 'UNAVAILABLE' AND "numericValue" IS NULL) OR
       ("precision" IN ('EXACT', 'ROUNDED') AND "numericValue" IS NOT NULL AND "numericValue" >= 0)
     )
     ```
