# Metrik — Analytics API Specification (Phase 4 Design)

This document specifies the technical design, data contracts, and calculation algorithms for the read-only Analytics API in Metrik.

---

## 1. Product Scope & Architectural Principles

Metrik is a self-hosted, single-tenant, open-source dashboard for public Telegram channel performance.

### In Scope for Phase 4
- Read-only Next.js App Router API route handlers (`src/app/api/`).
- Centralized API security guard (`src/server/auth/guard.ts`).
- Pure analytics calculation algorithms (`src/server/metrics/`).
- Timezone boundary resolution for calendar days (`Africa/Addis_Ababa`).
- Five designated read-only REST endpoints.

### Out of Scope
- No API-triggered synchronization (`POST /api/channels/[id]/sync` is excluded; synchronization remains strictly manual via the CLI: `pnpm sync:telegram`).
- No multi-tenancy or user accounts.
- No third-party platform integrations.
- No automated cron scheduling.

---

## 2. Centralized Security Specification

Per `AGENTS.md` (Section 5), the dashboard exposes analytics and session data, and must be guarded in a single centralized location so protection can be applied consistently across all routes.

### Guard Architecture
`src/server/auth/guard.ts` — Invoked at the entry of every route handler via `validateApiAccess(request: Request)`.

### Universal Authentication (No Fragile IP Checks)
To eliminate fragile client-IP detection, proxy parsing complexities, and spoofable headers (`X-Forwarded-For`, `X-Real-IP`), **`DASHBOARD_ADMIN_PASSWORD` is required for every API request**, regardless of the deployment environment (localhost, Docker, private network, or internet).

### Credential Transport
Clients provide the admin password through either:
1. Standard Authorization Header: `Authorization: Bearer <DASHBOARD_ADMIN_PASSWORD>`
2. Custom Header: `x-admin-password: <DASHBOARD_ADMIN_PASSWORD>`

### Server Configuration & Fail-Closed Behavior
1. **Server Password Missing (503 Service Unavailable)**:
   - If `DASHBOARD_ADMIN_PASSWORD` is empty, unset, or missing in the server environment (`process.env.DASHBOARD_ADMIN_PASSWORD`), the API immediately fails closed.
   - All API requests return `503 Service Unavailable` (`SERVER_MISCONFIGURED`).
   - This guarantees that an unconfigured or partially initialized server will never process API requests or leak unauthenticated data.
2. **Missing or Invalid Client Credentials (401 Unauthorized)**:
   - When `DASHBOARD_ADMIN_PASSWORD` is configured on the server, any incoming request that lacks an authorization header or provides a password that does not match returns `401 Unauthorized` (`UNAUTHORIZED`).
3. **Valid Credentials (200 OK)**:
   - When the supplied password matches `DASHBOARD_ADMIN_PASSWORD`, access is granted.

### Enforcement Matrix
| Server Configuration (`.env`) | Client Request Header | Outcome | Status Code |
|---|---|---|---|
| `DASHBOARD_ADMIN_PASSWORD=""` (unset/missing) | Any / None | Denied (server misconfigured) | `503 Service Unavailable` |
| `DASHBOARD_ADMIN_PASSWORD="secret"` | Missing or invalid header | Denied (unauthorized) | `401 Unauthorized` |
| `DASHBOARD_ADMIN_PASSWORD="secret"` | Matching Bearer or `x-admin-password` | Allowed | `200 OK` |

### Error Response Contracts
#### 503 Service Unavailable (Server Password Missing):
```json
{
  "error": {
    "code": "SERVER_MISCONFIGURED",
    "message": "DASHBOARD_ADMIN_PASSWORD is not configured on this server. Configure an admin password to enable API access."
  }
}
```

#### 401 Unauthorized (Missing or Invalid Credentials):
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Valid administration credentials are required to access this resource."
  }
}
```

### Secret Leak Prevention & Timing Attack Defense
- Header values, tokens, and passwords are never logged, formatted into error messages, or returned to clients.
- Comparison strictly uses constant-time string comparison (`crypto.timingSafeEqual`) on buffer representations to prevent timing side-channel attacks.

---

## 3. Parameter Validation & Boundary Definitions

Every API route strictly validates all incoming query and path parameters before initiating database queries. Malformed parameters immediately return `400 Bad Request`.

### A. Identifier Validation (`id`, `postId`)
- Channel identifier accepts either valid CUID string (e.g. `cmwtg1vwm0000...`) or sanitized Telegram handle matching `/^[a-zA-Z0-9_]{5,32}$/`.
- Post identifier accepts either valid CUID string or integer `telegramMessageId` $\ge 1$.
- Any malformed identifier returns `400 Bad Request` (`INVALID_IDENTIFIER`).

### B. Date & Range Parameters (`from`, `to`, `range`)
- **Format**: `from` and `to` must be ISO 8601 extended strings ending in `Z` or timezone offset (e.g. `2026-11-20T00:00:00.000Z`).
- **Ordering**: `from` must strictly precede `to` (`from < to`). If `from >= to`, returns `400 Bad Request` (`INVALID_DATE_RANGE`, `"from timestamp must precede to timestamp"`).
- **Maximum Span**: The span between `from` and `to` cannot exceed 365 calendar days to prevent denial-of-service / memory exhaustion (`400 Bad Request`, `RANGE_EXCEEDS_MAXIMUM`).
- **Preset Definitions (`range`)**:
  - Allowed values: `"7d"`, `"30d"`, `"90d"`.
  - Defined as full calendar-day ranges in the channel's configured timezone (`Africa/Addis_Ababa`).
  - **Calendar Day Coverage**:
    - `"7d"`: Covers today and the preceding 6 calendar days (7 full calendar days total: $[D_{\text{today}} - 6, D_{\text{today}}]$).
    - `"30d"`: Covers today and the preceding 29 calendar days (30 full calendar days total: $[D_{\text{today}} - 29, D_{\text{today}}]$).
    - `"90d"`: Covers today and the preceding 89 calendar days (90 full calendar days total: $[D_{\text{today}} - 89, D_{\text{today}}]$).
  - **Boundary Calculation**:
    - Interval is $[t_{\text{from}}, t_{\text{to}})$ (inclusive start, exclusive end).
    - $t_{\text{to}}$: The next local midnight `00:00:00` of tomorrow ($D_{\text{today}} + 1$), converted to UTC.
    - $t_{\text{from}}$: Local midnight `00:00:00` of the start calendar day ($D_{\text{today}} - 6$, $D_{\text{today}} - 29$, or $D_{\text{today}} - 89$), converted to UTC.
    - **Daylight-Saving-Aware Conversion**: Conversions between local calendar midnight strings and UTC instants dynamically resolve the exact IANA wall-clock offset for $t_{\text{from}}$ and $t_{\text{to}}$ independently, ensuring full DST transition resilience if channels in other timezones are configured.
- **Mutual Exclusivity**: Supplying both `range` and explicit `from`/`to` returns `400 Bad Request` (`AMBIGUOUS_RANGE_PARAMETERS`).

### C. Boolean Parameters (`includeDeleted`)
- Strictly accepts `"true"` or `"false"` (or `"1"` / `"0"`).
- Any other value (e.g. `"yes"`, `"all"`) returns `400 Bad Request` (`INVALID_BOOLEAN_PARAMETER`).

### D. Integer Pagination Limits (`limit`)
- Posts endpoint: Integer between `1` and `100` (default: `20`).
- Observations endpoint: Integer between `1` and `200` (default: `50`).
- Non-integer, decimal, negative, or out-of-range values return `400 Bad Request` (`INVALID_PAGINATION_LIMIT`).

---

## 4. Timezone Handling & Calendar Boundaries

### Principles
1. **Storage & Ingestion**: All database timestamps (`publishedAt`, `observedAt`, `createdAt`, `updatedAt`, `deletedAt`) are normalized to UTC.
2. **API Timestamps**: Every timestamp returned in JSON payloads is an ISO 8601 UTC string ending in `Z` (e.g. `2026-11-20T12:00:00.000Z`).
3. **Channel-Local Calendar Dates**: Daily bucket aggregations (e.g. "Posts Published on 2026-11-20") are computed using the channel's configured `timezone` (default: `Africa/Addis_Ababa`, UTC+03:00 with no daylight saving time).
4. **Interval Boundaries**: Start is **inclusive** and end is **exclusive**: `[from, to)`.

### Concrete Example (`Africa/Addis_Ababa`, UTC+03:00)
For a requested calendar period of `2026-11-20` to `2026-11-22` (3 full calendar days in Addis Ababa):
- **Local Start**: `2026-11-20 00:00:00 EAT` $\implies$ **UTC Boundary**: `2026-11-19T21:00:00.000Z` (inclusive)
- **Local End**: `2026-11-23 00:00:00 EAT` $\implies$ **UTC Boundary**: `2026-11-22T21:00:00.000Z` (exclusive)

Posts whose `publishedAt` falls within `[2026-11-19T21:00:00.000Z, 2026-11-22T21:00:00.000Z)` are bucketed by their local calendar date:
- `2026-11-19T21:00:00.000Z` to `2026-11-20T21:00:00.000Z` $\to$ `2026-11-20`
- `2026-11-20T21:00:00.000Z` to `2026-11-21T21:00:00.000Z` $\to$ `2026-11-21`
- `2026-11-21T21:00:00.000Z` to `2026-11-22T21:00:00.000Z` $\to$ `2026-11-22`

---

## 5. Lifetime Views Aggregation Semantics

Because Telegram public web previews display exact counts only for values $< 1,000$ and metric suffixes (`1.2K`, `1.74M`) for values $\ge 1,000$, channel lifetime views must be aggregated transparently.

### Classification of Latest Observations
For every non-deleted post, its latest observation of metric type `VIEWS` is categorized into one of four states:
1. `EXACT`: Integer count $< 1,000$ or exact count.
2. `ROUNDED`: Metric suffix parsed to approximate integer (e.g. `1.2K` $\implies 1200$).
3. `UNAVAILABLE`: Missing counter or unparseable counter (`numericValue = null`).
4. `MISSING_OBSERVATION`: Post has no views observation row in the database.

### Aggregation Rules
- **`exactLifetimeSum`**: Sum of `numericValue` for all non-deleted posts whose latest observation is `EXACT`.
- **`roundedLifetimeEstimate`**: Sum of estimated `numericValue` for all non-deleted posts whose latest observation is `ROUNDED`.
- **`totalLifetimeEstimate`**: `exactLifetimeSum + roundedLifetimeEstimate`.
- **Never Label Mixed Estimates as Exact**:
  - `isExact` is strictly `true` **only if** 100% of non-deleted posts have `EXACT` observations and zero posts are `ROUNDED`, `UNAVAILABLE`, or `MISSING_OBSERVATION`.
  - If even a single post has a `ROUNDED` counter, `isExact` is set to `false`.
  - Posts with `UNAVAILABLE` or `MISSING_OBSERVATION` counters are **never converted to zero**. They are excluded from the numeric sum and explicitly quantified in `unavailablePostsCount` and `missingObservationPostsCount`.
- **Deleted Posts**: Soft-deleted posts (`deletedAt != null`) are excluded from active lifetime views aggregation and tracked in `deletedPostsCount`.

### Output Structure
```json
{
  "lifetimeViews": {
    "totalEstimate": 878,
    "exactSum": 878,
    "roundedEstimate": 0,
    "isExact": true,
    "breakdown": {
      "totalPosts": 7,
      "exactPostsCount": 7,
      "roundedPostsCount": 0,
      "unavailablePostsCount": 0,
      "missingObservationPostsCount": 0
    }
  }
}
```

---

## 6. Observed Views Growth Calculation Algorithm

### Problem Statement
Telegram view counters are cumulative lifetime totals per post. Telegram does not report views generated during a selected date window. Therefore, Metrik computes **Observed Views Growth** (or *"Observed change between observations"*), which is the verified delta between observations of existing posts.

### Hard Invariants
- **A post's first observation has no prior baseline and is not counted as views generated that day.**
- **Never calculate exact view deltas from rounded (`1.2K`) or unavailable counters.**
- **Inspect all intermediate observations between baseline and comparison.** If any intermediate observation is rounded or unavailable, counter continuity is broken and the post must be excluded from exact growth.
- **Inspect every consecutive pair in the observation sequence.** If any consecutive step shows a decrease, classify the post as `EXCLUDED_NEGATIVE_DELTA`. A positive net delta must **never** be allowed to hide an intermediate decrease.
- **Never silently return negative growth or coerce negative deltas to zero.** Any decrease in lifetime counters is treated as an anomaly and isolated.
- **Never describe this metric as total views generated by the channel during the period.**
- **Never backfill or interpolate unseen days.** If syncs are days apart, deltas are attributed only to observation events.

### Step-by-Step Algorithm
Given non-deleted channel posts $P$, and a query interval $[t_{\text{from}}, t_{\text{to}})$ in UTC:

1. **For each non-deleted post $p \in P$**:
   - **Step A: Identify Baseline Observation ($O_{\text{base}}$)**:
     Find the latest observation of metric type `VIEWS` for post $p$ where $\text{observedAt} \le t_{\text{from}}$.
     - If no observation exists with $\text{observedAt} \le t_{\text{from}}$:
       Classify post as `EXCLUDED_NO_BASELINE` (a post whose first observation occurred within or after the query period has no baseline and cannot contribute to period views).
   - **Step B: Identify Comparison Observation ($O_{\text{curr}}$)**:
     Find the latest observation of metric type `VIEWS` for post $p$ where $\text{observedAt} < t_{\text{to}}$ and $\text{observedAt} > O_{\text{base}}.\text{observedAt}$.
     - If no subsequent observation exists within the query window:
       Classify post as `EXCLUDED_NO_SUBSEQUENT_OBSERVATION` (post was only observed at/before baseline).
   - **Step C: Intermediate Observation Path Inspection**:
     Retrieve all observations $\{ O_i \}$ for post $p$ and metric type `VIEWS` in the closed interval:
     $$O_{\text{base}}.\text{observedAt} \le O_i.\text{observedAt} \le O_{\text{curr}}.\text{observedAt}$$
     - If **any** observation $O_i$ in this path (including $O_{\text{base}}$ or $O_{\text{curr}}$) has:
       $O_i.\text{precision} \ne \text{EXACT}$ (i.e. is `ROUNDED` or `UNAVAILABLE`) or $O_i.\text{numericValue} == \text{null}$:
       $\implies$ Classify post as `EXCLUDED_ROUNDED_OR_UNAVAILABLE`.
       *Rationale*: Any rounded or unavailable reading along the observation trajectory breaks exact integer continuity and prevents verifiable delta attribution.
   - **Step D: Consecutive Pair Inspection & Anomaly Handling**:
     Let the chronologically sorted sequence of observations for post $p$ between baseline and comparison be:
     $$S = (O_0, O_1, O_2, \dots, O_m)$$
     where $O_0 = O_{\text{base}}$, $O_m = O_{\text{curr}}$, and $m \ge 1$.
     - **Inspect every consecutive pair** $(O_k, O_{k+1})$ for $k \in \{0, 1, \dots, m - 1\}$:
       $$\delta_k = O_{k+1}.\text{numericValue} - O_k.\text{numericValue}$$
       - If **any** consecutive transition has $\delta_k < 0$:
         An intermediate counter decrease occurred (e.g. view count transitioned $100 \to 80 \to 120$).
         - **Strict Invariant**: A positive net delta ($O_m - O_0 > 0$) must **never** be allowed to hide an intermediate decrease.
         - The post is **immediately classified as `EXCLUDED_NEGATIVE_DELTA`** and excluded from the growth sum.
         - The negative delta is **never** silently returned as negative growth and **never** silently coerced to zero.
         - The anomaly is isolated and recorded in coverage metadata as `excludedNegativeDelta`.
     - **If and only if $\delta_k \ge 0$ for every consecutive pair $k \in \{0, \dots, m - 1\}$**:
       $$\Delta_p = O_m.\text{numericValue} - O_0.\text{numericValue}$$
       Classify post as `ELIGIBLE` with growth contribution $\Delta_p$.

2. **Aggregate Sum & State**:
   - If $\text{count}(\text{ELIGIBLE}) > 0$:
     $$\text{TotalObservedGrowth} = \sum_{p \in \text{ELIGIBLE}} \Delta_p$$
     $\text{isExact} = \text{true}$.
   - If $\text{count}(\text{ELIGIBLE}) == 0$:
     $\text{TotalObservedGrowth} = \text{null}$ (missing/unavailable, never $0$).
     $\text{isExact} = \text{false}$.

3. **Timezone-Aware Daily Attribution**:
   - For each eligible post, each subsequent observation $O_k$ occurring at UTC instant $t_k$ is converted to the channel's local calendar day $D_k$ (`Africa/Addis_Ababa`).
   - The growth increment $\delta = O_k.\text{numericValue} - O_{k-1}.\text{numericValue}$ is attributed to local day $D_k$.
   - **Initial observations**: A post's initial observation establishes its baseline; it has zero growth ($0$) attributed to the day it was first recorded.
   - **Multi-day sync gaps**: If observations span across multiple unobserved days (e.g. synced Monday, next synced Thursday), $\delta$ is attributed to the observation event day (Thursday) with `isMultiDayGap: true`. **Zero values are never assumed and deltas are never smoothed or backfilled across unseen days**.

4. **Output Structure & Coverage Metadata**:
   ```json
   {
     "observedViewsGrowth": {
       "value": 145,
       "isExact": true,
       "label": "Observed change between observations",
       "description": "Calculated strictly between exact observations of posts with a verified baseline at or before the period start, uninterrupted exact intermediate observations, and verified non-negative consecutive transitions. First observations per post and counter anomalies are excluded.",
       "coverage": {
         "totalPosts": 7,
         "eligiblePostsCount": 4,
         "excludedNoBaseline": 2,
         "excludedNoSubsequentObservation": 0,
         "excludedRoundedOrUnavailable": 1,
         "excludedNegativeDelta": 0
       },
       "daily": [
         { "date": "2026-11-20", "observedGrowth": null, "reason": "Baseline establishment only" },
         { "date": "2026-11-21", "observedGrowth": 85, "isExact": true },
         { "date": "2026-11-22", "observedGrowth": 60, "isExact": true }
       ]
     }
   }
   ```

---

## 7. Deterministic Pagination Semantics

To guarantee deterministic, drift-free pagination across concurrent syncs or identical timestamps, all paginated endpoints use **compound keyset cursor pagination**.

### Posts Pagination (`publishedAt DESC, id DESC`)
1. **Sorting**:
   ```prisma
   orderBy: [
     { publishedAt: 'desc' },
     { id: 'desc' }
   ]
   ```
2. **Cursor Structure**:
   The cursor returned to clients is an opaque base64-encoded string representing `{ publishedAt: string, id: string }`.
   Example decoded: `{"publishedAt": "2026-11-19T18:18:37.000Z", "id": "cmwtg1vxw00015vzc4b123456"}`
3. **Query Predicate**:
   When `cursor` is provided, the database filter enforces:
   ```sql
   WHERE ("publishedAt" < $cursorPublishedAt)
      OR ("publishedAt" = $cursorPublishedAt AND "id" < $cursorId)
   ```
   This prevents duplicate rows and guarantees no posts are skipped even if multiple posts share the exact same publication millisecond.

### Observations Pagination (`observedAt DESC, id DESC`)
1. **Sorting**:
   ```prisma
   orderBy: [
     { observedAt: 'desc' },
     { id: 'desc' }
   ]
   ```
2. **Cursor Structure**:
   Opaque base64 token representing `{ observedAt: string, id: string }`.
3. **Limit Boundary**: Default `50`, maximum `200` rows per page.

---

## 8. Endpoints Specification (5 Read-Only Endpoints)

### Endpoint 1: Channel List
`GET /api/channels`

Returns all tracked Telegram channels in the local database.

#### Response (200 OK)
```json
{
  "channels": [
    {
      "id": "cmwtg1vwm00005vzczmhjitup",
      "telegramUsername": "mogesmotor",
      "title": "Moges Motors™️",
      "timezone": "Africa/Addis_Ababa",
      "createdAt": "2026-11-23T15:52:03.490Z",
      "updatedAt": "2026-11-23T15:52:03.490Z",
      "postsCount": 7,
      "latestSync": {
        "id": "cmwtgv54o00025v30plgw27xi",
        "status": "SUCCESS",
        "finishedAt": "2026-11-23T16:14:52.482Z",
        "pagesFetched": 2,
        "postsFetched": 7
      }
    }
  ]
}
```

---

### Endpoint 2: Channel Overview
`GET /api/channels/[id]`

Returns channel configuration, lifetime aggregate counters, and sync status.

#### Parameters
- `id` (path): Channel ID (CUID) or normalized Telegram username handle.

#### Response (200 OK)
```json
{
  "channel": {
    "id": "cmwtg1vwm00005vzczmhjitup",
    "telegramUsername": "mogesmotor",
    "title": "Moges Motors™️",
    "timezone": "Africa/Addis_Ababa",
    "createdAt": "2026-11-23T15:52:03.490Z",
    "updatedAt": "2026-11-23T15:52:03.490Z"
  },
  "summary": {
    "postsPublishedTotal": 7,
    "postsDeletedTotal": 0,
    "reach": {
      "status": "UNAVAILABLE",
      "value": null,
      "reason": "Reach is unavailable on Telegram broadcast channels"
    },
    "oldestPostPublishedAt": "2026-11-19T18:01:50.000Z",
    "newestPostPublishedAt": "2026-11-19T18:18:37.000Z"
  },
  "latestSync": {
    "id": "cmwtgv54o00025v30plgw27xi",
    "status": "SUCCESS",
    "startedAt": "2026-11-23T16:14:50.532Z",
    "finishedAt": "2026-11-23T16:14:52.482Z",
    "pagesFetched": 2,
    "postsFetched": 7
  }
}
```

---

### Endpoint 3: Channel Posts
`GET /api/channels/[id]/posts`

Returns paginated channel posts with their latest observed metrics using deterministic keyset pagination.

#### Parameters
- `id` (path): Channel ID or username.
- `limit` (query, optional): Integer between `1` and `100` (default `20`).
- `cursor` (query, optional): Opaque keyset cursor string.
- `includeDeleted` (query, optional): `"true"` | `"false"` (default `false`).
- `from` (query, optional): Filter publication date start (ISO 8601 UTC).
- `to` (query, optional): Filter publication date end (ISO 8601 UTC).

#### Response (200 OK)
```json
{
  "posts": [
    {
      "id": "cmwtg1vxw00015vzc4b123456",
      "telegramMessageId": 32171,
      "publishedAt": "2026-11-19T18:18:37.000Z",
      "text": "🔥 2026 TOYOTA LAND CRUISER 300 V6 HEV...",
      "deletedAt": null,
      "metrics": {
        "views": {
          "rawValue": "161",
          "numericValue": 161,
          "precision": "EXACT",
          "observedAt": "2026-11-23T15:52:03.500Z"
        },
        "reactions": {
          "rawValue": null,
          "numericValue": null,
          "precision": "UNAVAILABLE",
          "observedAt": "2026-11-23T15:52:03.500Z"
        },
        "comments": {
          "rawValue": null,
          "numericValue": null,
          "precision": "UNAVAILABLE",
          "observedAt": "2026-11-23T15:52:03.500Z"
        }
      },
      "observationsCount": 3
    }
  ],
  "pagination": {
    "nextCursor": "eyJwdWJsaXNoZWRBdCI6IjIwMjYtMTEtMTlUMTg6MTg6MzcuMDAwWiIsImlkIjoiY213dGcxZnh3MDAwMTV2emM0YjEyMzQ1NiJ9",
    "hasMore": false,
    "totalCount": 7
  }
}
```

---

### Endpoint 4: Aggregated Period Analytics
`GET /api/channels/[id]/analytics`

Computes time-bounded channel analytics, daily posts published, lifetime views breakdown, and Observed Views Growth.

#### Parameters
- `id` (path): Channel ID or username.
- `from` (query, optional): ISO 8601 UTC timestamp (inclusive start).
- `to` (query, optional): ISO 8601 UTC timestamp (exclusive end).
- `range` (query, optional): Preset shortcut (`7d`, `30d`, `90d`). Mutually exclusive with `from`/`to`.

#### Response (200 OK)
```json
{
  "period": {
    "from": "2026-11-19T21:00:00.000Z",
    "to": "2026-11-22T21:00:00.000Z",
    "timezone": "Africa/Addis_Ababa",
    "localFromDate": "2026-11-20",
    "localToDate": "2026-11-22"
  },
  "postsPublished": {
    "total": 7,
    "daily": [
      { "date": "2026-11-20", "count": 7 },
      { "date": "2026-11-21", "count": 0 },
      { "date": "2026-11-22", "count": 0 }
    ]
  },
  "lifetimeViews": {
    "totalEstimate": 878,
    "exactSum": 878,
    "roundedEstimate": 0,
    "isExact": true,
    "breakdown": {
      "totalPosts": 7,
      "exactPostsCount": 7,
      "roundedPostsCount": 0,
      "unavailablePostsCount": 0,
      "missingObservationPostsCount": 0
    }
  },
  "observedViewsGrowth": {
    "value": null,
    "isExact": false,
    "label": "Observed change between observations",
    "description": "Calculated strictly between exact observations of posts with a verified baseline at or before the period start, uninterrupted exact intermediate observations, and verified non-negative consecutive transitions. First observations per post and counter anomalies are excluded.",
    "coverage": {
      "totalPosts": 7,
      "eligiblePostsCount": 0,
      "excludedNoBaseline": 7,
      "excludedNoSubsequentObservation": 0,
      "excludedRoundedOrUnavailable": 0,
      "excludedNegativeDelta": 0
    },
    "daily": [
      { "date": "2026-11-20", "observedGrowth": null, "reason": "Baseline establishment only" },
      { "date": "2026-11-21", "observedGrowth": null, "reason": "No sync event recorded" },
      { "date": "2026-11-22", "observedGrowth": null, "reason": "No sync event recorded" }
    ]
  },
  "reach": {
    "status": "UNAVAILABLE",
    "value": null,
    "reason": "Reach is unavailable on Telegram broadcast channels"
  }
}
```

---

### Endpoint 5: Post Observation Time Series
`GET /api/channels/[id]/posts/[postId]/observations`

Returns paginated, raw, append-only point-in-time observation history for a single post using deterministic keyset pagination.

#### Parameters
- `id` (path): Channel ID or username.
- `postId` (path): Post CUID or integer `telegramMessageId`.
- `limit` (query, optional): Integer between `1` and `200` (default: `50`).
- `cursor` (query, optional): Opaque keyset cursor string (`observedAt DESC, id DESC`).
- `metricType` (query, optional): Filter by `VIEWS` | `REACTIONS` | `COMMENTS`.

#### Response (200 OK)
```json
{
  "postId": "cmwtg1vxw00015vzc4b123456",
  "telegramMessageId": 32171,
  "observations": [
    {
      "id": "cmwtg1vzb00035vzc4b999111",
      "observedAt": "2026-11-23T15:52:03.500Z",
      "metricType": "VIEWS",
      "rawValue": "161",
      "numericValue": 161,
      "precision": "EXACT"
    }
  ],
  "pagination": {
    "nextCursor": null,
    "hasMore": false,
    "totalCount": 1
  }
}
```

---

## 9. Implementation Plan for Phase 4

```text
src/
├── app/
│   └── api/
│       ├── channels/
│       │   ├── route.ts                        # GET /api/channels
│       │   └── [id]/
│       │       ├── route.ts                    # GET /api/channels/[id]
│       │       ├── posts/
│       │       │   ├── route.ts                # GET /api/channels/[id]/posts
│       │       │   └── [postId]/
│       │       │       └── observations/
│       │       │           └── route.ts        # GET /api/channels/[id]/posts/[postId]/observations
│       │       └── analytics/
│       │           └── route.ts                # GET /api/channels/[id]/analytics
├── server/
│   ├── auth/
│   │   └── guard.ts                            # Centralized validateApiAccess(req) enforcing DASHBOARD_ADMIN_PASSWORD
│   └── metrics/
│       ├── timezone.ts                         # Timezone [from, to) boundaries in channel timezone (DST-aware)
│       ├── validation.ts                       # Validation for query params (dates, limits, presets, booleans)
│       ├── pagination.ts                       # Compound keyset cursor encoder/decoder (publishedAt DESC, id DESC)
│       ├── lifetime-views.ts                   # Lifetime views aggregation & precision breakdown
│       ├── posts-published.ts                  # Pure calculation of posts published & daily buckets
│       └── views-growth.ts                     # Observed Views Growth algorithm with consecutive-pair inspection
tests/
├── auth-guard.test.ts                          # Tests for security guard (503 when unset, 401 when invalid, timing-safe)
├── api-validation.test.ts                      # Tests for parameter validation (from/to, range, limit, booleans)
├── pagination.test.ts                          # Tests for deterministic compound cursor pagination
├── timezone.test.ts                            # Tests for Addis Ababa and UTC calendar boundaries (DST-aware)
├── lifetime-views.test.ts                      # Tests for lifetime views aggregation & mixed estimates
├── views-growth.test.ts                        # Tests for Observed Views Growth & consecutive-pair anomaly checks
└── api-routes.test.ts                          # Integration tests for the 5 read-only API routes
```
