# Synchronization Architecture

Metrik connects the login-free public Telegram channel collector directly to PostgreSQL using Prisma.

---

## Synchronization Workflow

```
[ User / CLI (`pnpm sync:telegram [channel]`) ]
                       │
                       ▼
         [ validateChannelUsername ]
                       │
                       ▼
       [ Channel Upsert (default: Africa/Addis_Ababa) ]
                       │
                       ▼
       [ SyncRun Created: status = RUNNING ]
                       │
                       ▼
       [ fetchPublicChannelPosts (bounded pagination) ]
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
    [ Success ]             [ Failure / Error ]
             │                   │
             ▼                   ▼
   For each post:          [ Sanitize error ]
   - Upsert Post                 │
   - Metric Observations         ▼
     (VIEWS, REACT, COMM): [ SyncRun: status = FAILED ]
     Compare with latest         │
     - If changed: APPEND        ▼
     - If unchanged: SKIP  [ Re-throw SyncExecutionError ]
             │
             ▼
[ Channel Title Updated if changed ]
             │
             ▼
[ SyncRun: status = SUCCESS ]
```

---

## Core Guarantees

1. **Channel Normalization**:
   - Strips leading `@`, URLs (`https://t.me/s/...`), and normalizes case.
   - Prevents duplicate channel records.
   - Preserves configured timezone (`Africa/Addis_Ababa`).

2. **Idempotent Post Upsert**:
   - Compound unique constraint on `(channelId, telegramMessageId)`.
   - Repeated syncs update editable content (e.g. edited post text) without duplicating rows.
   - Preserves publication timestamp `publishedAt` and soft-delete marker `deletedAt`.

3. **Append-Only Metric Observations**:
   - Metrics are never overwritten.
   - For each incoming post, the collector checks the latest observation for that `(postId, metricType)`.
   - If `(numericValue, precision, rawValue)` are identical, the observation is skipped as redundant.
   - If any metric value or precision changed (e.g. views grew from 101 to 132), a new observation row is appended with the current timestamp.

4. **Incomplete Collection Safety**:
   - Incomplete syncs or pagination boundaries never mark unreturned posts as deleted.
   - Missing data in batches never alters historical records.

5. **Sanitized Audit Log (`SyncRun`)**:
   - Starts in `RUNNING` status with `startedAt`.
   - Concludes as `SUCCESS` or `FAILED` with `finishedAt`.
   - Captures `pagesFetched` and `postsFetched`.
   - Errors are sanitized via `sanitizeSyncRunError` to ensure credentials, tokens, or system paths are never persisted.
