# Metrik Production Deployment Guide (Render + Supabase + GitHub)

This guide provides step-by-step instructions to deploy **Metrik** as a publicly accessible, zero-cost ($0/month) open-source Telegram analytics dashboard using:

1. **GitHub**: Public source code repository and scheduled automated tracking via GitHub Actions.
2. **Supabase**: Managed PostgreSQL database (Free Tier).
3. **Render**: Next.js App Router web service hosting (Free Web Service Tier).

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │            Telegram Channel             │
                      │     (Public Web Preview: t.me/s/)       │
                      └────────────────────┬────────────────────┘
                                           │
                        Ingests public HTML│(every 30m)
                                           ▼
┌───────────────────────┐           ┌───────────────────────────┐
│     Render.com        │           │      GitHub Actions       │
│  (Next.js App Router) │           │ (Scheduled Tracking Job)  │
│                       │           │                           │
│  • Public UI / Login  │           │  • Cron: */30 * * * *     │
│  • REST Analytics API │           │  • One-shot tracking      │
│  • Session Auth Guard │           │  • Bootstrap & sync       │
└───────────┬───────────┘           └─────────────┬─────────────┘
            │                                     │
            │ Runtime Queries                     │ Direct Sync Writes
            │ (Port 6543, PgBouncer Pooler)       │ (Port 5432, Direct Session)
            ▼                                     ▼
┌───────────────────────────────────────────────────────────────┐
│                     Supabase PostgreSQL                       │
│                                                               │
│  • channels                  • sync_runs                      │
│  • posts                     • worker_heartbeats              │
│  • post_metric_observations  • 60-day rolling history         │
└───────────────────────────────────────────────────────────────┘
```

---

## 1. Security Audit & Public Repository Checklist

Before pushing this repository to a public GitHub repository, verify that no secrets or environment files are tracked:

### Security Checklist
- [x] `.env*` files are excluded by `.gitignore` (only `.env.example` is committed).
- [x] No database connection strings, passwords, or tokens are committed in Git history.
- [x] Application credentials (`DASHBOARD_ADMIN_PASSWORD`, `SESSION_SECRET`) are read exclusively from environment variables.
- [x] Session cookies use `HttpOnly`, `SameSite=Strict`, and `secure: true` in production environments.
- [x] Database credentials and secrets are kept strictly server-side and never exposed to client-side bundles.

Verify your local working tree before pushing:

```powershell
git status
git log -1
```

---

## 2. Supabase Production Database Setup

### Step 2.1: Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New Project**.
3. Choose an organization, enter a project name (e.g. `metrik-prod`), and select a database region close to your target audience (e.g. `eu-central-1` or `us-east-1`).
4. Generate and save a strong database password (store this safely in your password manager).
5. Select the **Free Tier**.

### Step 2.2: Retrieve Database Connection Strings
In your Supabase project dashboard, navigate to **Project Settings** → **Database**:

1. **Transaction Pooler Connection String** (Used for `DATABASE_URL` at runtime):
   - Connection Mode: **Transaction**
   - Port: `6543`
   - Format: `postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true`
2. **Direct Connection String** (Used for `DIRECT_URL` during migrations):
   - Connection Mode: **Session**
   - Port: `5432`
   - Format: `postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres`

> [!IMPORTANT]
> - `DATABASE_URL` uses port `6543` and `?pgbouncer=true` to prevent PostgreSQL client connection exhaustion in serverless and containerized environments.
> - `DIRECT_URL` connects directly to port `5432` because Prisma schema migrations require advisory locks and DDL execution not supported by PgBouncer transaction mode.

### Step 2.3: Apply Database Migrations
Run Prisma migrations against the Supabase database from your local machine:

```powershell
$env:DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
$env:DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

pnpm prisma migrate deploy
```

Verify that all tables (`channels`, `posts`, `post_metric_observations`, `sync_runs`, `worker_heartbeats`) were created in the Supabase Table Editor.

---

## 3. Render Next.js Web Service Deployment

### Step 3.1: Create a New Web Service on Render
1. Go to [render.com](https://render.com) and log in.
2. Click **New +** → **Web Service**.
3. Connect your GitHub account and select your public `metrik` repository.

### Step 3.2: Configure Build & Runtime Settings
Configure the service with the following settings:

| Setting | Value |
|---|---|
| **Name** | `metrik` (or custom name) |
| **Region** | Same region as Supabase (e.g. Frankfurt / Oregon) |
| **Branch** | `main` |
| **Root Directory** | *(leave blank)* |
| **Runtime** | `Node` |
| **Build Command** | `pnpm prisma generate && pnpm build` |
| **Start Command** | `pnpm start` |
| **Instance Type** | `Free` |

### Step 3.3: Configure Render Environment Variables
Under **Environment Variables**, add the following:

| Key | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Production environment |
| `DATABASE_URL` | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` | Supabase Transaction Pooler |
| `DIRECT_URL` | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:5432/postgres` | Supabase Direct Session connection |
| `DASHBOARD_ADMIN_PASSWORD` | `[YourStrongPassword]` | Admin password required for UI and API access |
| `SESSION_SECRET` | `[Optional32CharRandomKey]` | Cookie signing secret (auto-derived if omitted) |
| `APP_TIMEZONE` | `Africa/Addis_Ababa` | Local timezone for calendar boundary aggregation |
| `TELEGRAM_CHANNEL_USERNAME` | `mogesmotor` | Default public Telegram channel handle |
| `SYNC_MAX_PAGES` | `2` | Number of preview pages fetched per incremental sync |

Click **Create Web Service**. Render will install dependencies, generate Prisma Client, build the Next.js production bundle, and launch the service.

---

## 4. GitHub Actions: Scheduled 30-Minute Tracking Setup

Because Render's free tier sleeps during periods of inactivity and does not include background workers, background channel tracking is offloaded to **GitHub Actions**.

### Step 4.1: Configure Repository Secrets
In your GitHub repository, navigate to **Settings** → **Secrets and variables** → **Actions**:

Add the following **Repository secrets**:

| Secret Name | Value | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` | Supabase pooled connection string |
| `DIRECT_URL` | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:5432/postgres` | Supabase direct connection string |
| `TELEGRAM_CHANNEL_USERNAME` | `mogesmotor` | Target channel username |
| `APP_TIMEZONE` | `Africa/Addis_Ababa` | Channel aggregation timezone |
| `SYNC_MAX_PAGES` | `2` | Incremental sync page limit |

### Step 4.2: Workflow Behavior
The workflow file [`.github/workflows/track-telegram.yml`](../.github/workflows/track-telegram.yml) is already configured:
- **Cron**: Runs automatically every 30 minutes (`*/30 * * * *`).
- **Concurrency Protection**: Uses `concurrency: group: track-telegram, cancel-in-progress: false` to ensure scheduled runs never overlap with manual runs.
- **Bootstrap-First Guarantee**: If the target channel has not completed its initial 7-day bootstrap, the worker automatically runs `runChannelBootstrap` before beginning incremental syncs.
- **Deduplication**: Only appends new metric observations if counter values change.
- **Manual Trigger**: Supports on-demand execution via GitHub's **Run workflow** button.

---

## 5. Production Data Initialization

### Option A: Automatic Initial Bootstrap (Recommended)
You do not need to manually transfer local development records.
1. Once the GitHub Actions workflow runs for the first time (or when you trigger it manually via `workflow_dispatch`), it detects that the channel has `bootstrapStatus: PENDING`.
2. It automatically paginates Telegram's public preview to capture the previous 7 calendar days $[D_{\text{today}} - 6, D_{\text{today}}]$.
3. It sets `bootstrapStatus = COMPLETED` and records the initial baseline observation.
4. Subsequent runs every 30 minutes incrementally track new posts and changes in view counts.

### Option B: Local Data Transfer via PostgreSQL Dump (Optional)
If you wish to copy your exact local development records into Supabase:

```powershell
# 1. Export local database tables to SQL dump
pg_dump -U postgres -d metrik -t channels -t posts -t post_metric_observations -t sync_runs --data-only > metrik_data_backup.sql

# 2. Restore data into Supabase production database
psql "postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:5432/postgres" < metrik_data_backup.sql
```

---

## 6. Free-Tier Characteristics & Limitations

Deploying on free tiers achieves **$0/month hosting**, with the following operational considerations:

1. **Render Free Tier Spin-Down**:
   - Free Web Services on Render spin down after 15 minutes of inbound HTTP inactivity.
   - The first HTTP request after spin-down may experience a 30–50 second cold-start delay while the instance boots.
   - Subsequent requests will be fast while the service remains active.
2. **GitHub Actions Scheduling Timing**:
   - GitHub Actions scheduled cron workflows run within a shared pool. Execution times may occasionally experience minor queue delays (e.g. 5–15 minutes) during peak GitHub traffic periods.
   - The 30-minute interval is suitable for channel analytics, where view counts change gradually over hours.
3. **Supabase Inactivity Pausing**:
   - Supabase free-tier databases are paused after 7 days of inactivity.
   - Because GitHub Actions queries and updates the database every 30 minutes, your Supabase project **will remain active** and will not pause.
4. **Storage Quotas**:
   - Supabase free tier provides 500 MB of PostgreSQL storage.
   - With Metrik's built-in 60-day rolling observation retention pruning (`pnpm retention:prune`), a single active Telegram channel generating ~10 posts daily consumes $< 20$ MB over a year.

---

## 7. Troubleshooting

### "Database migration failed: prepared statement already exists"
- **Cause**: Prisma migrations were pointed at the PgBouncer transaction pooler (port 6543) instead of direct PostgreSQL (port 5432).
- **Fix**: Ensure `DIRECT_URL` is configured with port 5432 and session mode.

### "DASHBOARD_ADMIN_PASSWORD is not configured on this server" (HTTP 503)
- **Cause**: The admin password environment variable was omitted in Render.
- **Fix**: Add `DASHBOARD_ADMIN_PASSWORD` in Render's **Environment** tab and redeploy.

### "Channel rate-limit backoff in effect"
- **Cause**: Telegram returned HTTP 429 to the public preview scraper.
- **Fix**: Metrik automatically enters a 5-minute backoff. The next scheduled GitHub Actions job will resume collection automatically.
