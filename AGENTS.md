# AGENTS.md: Telegram Analytics Dashboard (self-hosted, open source)

> Put this at the repo root. If your Antigravity version reads rules from a different file or folder, copy the contents there (check its current docs).

## 1. What this project is
A self-hosted, open-source dashboard that connects to a Telegram channel the owner administers and shows **Posts Published** and **Views** (Reach is Unavailable on Telegram). Each person clones the repo and runs their own independent installation.

Not part of this project: a central SaaS backend, multi-tenancy, workspaces, subscriptions, user account management, or other platforms (YouTube, Facebook, LinkedIn) until the owner says otherwise.

Stack: Next.js (App Router), TypeScript, Tailwind, pnpm, PostgreSQL, Prisma, Vitest.

## 2. Before every task
1. Read `README.md` and anything relevant in `/docs`.
2. Check `git status` and the latest commit. Do not overwrite unrelated changes.
3. State the exact scope of the task and what is out of scope.
4. Work only on the current phase. Do not build ahead.
5. If a question is unresolved (an API capability, an architecture choice), stop and ask. Do not guess.

## 3. Hard rules
- **Never invent** Telegram methods, fields, limits or metrics. If it was not verified by running it or reading the official docs, call it "unverified" and say so in the docs.
- **Data Collection Policy (Approved Architecture Exception)**:
  - Public channel preview access through `https://t.me/s/{username}` is authorized by the project owner for public channels.
  - Only publicly accessible broadcast channel content may be collected.
  - No personal Telegram authentication, phone login, MTProto session, or developer API credentials (`api_id`/`api_hash`) are required for the standard workflow.
  - No private channel or private group access. Linked discussion groups are excluded as their messages are not exposed publicly via web preview.
  - Strictly no authentication bypass, CAPTCHA bypass, proxy rotation, or anti-bot circumvention.
  - Respect HTTP status codes, server restrictions, and maintain reasonable request intervals.
  - Do not claim that public preview collection is an official Telegram API. Document it transparently as web-preview ingestion subject to Telegram platform terms.
  - Never present approximate public counters (e.g. `1.2K`, `1.74M`) as exact values.
- Do not add dependencies without a stated reason. Prefer simple solutions over abstractions.
- No microservices, queues or caches unless the owner approves them.
- Do not modify unrelated files. Keep diffs small.
- Never delete or weaken tests to make a build pass.

## 4. Secrets and credentials
- The standard public collection mode requires no personal Telegram sessions or API hashes.
- If optional administrative credentials (e.g. `DASHBOARD_ADMIN_PASSWORD`) or database credentials are used, never commit, print, log, or paste them.
- Local configuration (`.env*`) remains git-ignored (keep only `.env.example`). Check staged files before every commit.

## 5. Access control
The dashboard exposes data and sync controls for a powerful session, so it must not be open to the internet by default.
- Default to listening on localhost only.
- Before any non-local deployment is documented or supported, require a protection mechanism (a single admin password or equivalent). Do not build it until asked, but never document an unprotected public deployment.
- API routes that trigger syncs or return data must be written so protection can be added in one place.

## 6. Metric rules
- Missing data is `null` / unavailable, **never 0**. A true zero is displayed differently from missing data.
- Never fabricate, estimate or backfill values.
- Observations are append-only. Never overwrite history.
- Telegram view counts are lifetime counters per post. Never present them as selected-period views.
- Period views are either platform-reported period data (only if verified) or "observed change between our own observations", clearly labeled as such. A post's first observation has no baseline and is not counted as views generated that day.
- Posts Published counts non-deleted posts by publish time using the configured timezone. Start is inclusive and end is exclusive. Count each post once.
- Posts removed on Telegram are marked deleted (`deletedAt`), never hard-deleted.
- Reach is shown as Unavailable on Telegram. Do not substitute views or any other metric.
- Public counters may be exact (e.g. 98) or rounded (e.g. 1.2K, 1.74M). Store raw displayed text, interpreted numeric value, and precision classification.
- Never claim rounded counters are exact, and never calculate exact view deltas from rounded observations.
- Store timestamps in UTC; convert to the configured timezone only at the edges.

## 7. Sync rules
- Sync is idempotent: running it twice must not duplicate posts or inflate counts (unique keys on channel + message ID).
- A failed sync must not corrupt existing data. Record each run (start, end, status, counts, error).
- Refresh recent posts often and old posts rarely to stay within rate limits.
- Only one sync may run at a time.

## 8. Code conventions
- TypeScript strict. No `any` without a comment.
- Prisma migrations for every schema change. No manual DB edits.
- Metric calculations are pure functions with unit tests, separate from UI and routes.
- Server-only code (Telegram client, DB, secrets) lives under `src/server` and is never imported by client components.
- Validate all external input. Never return raw errors or secrets to the client.

## 9. Testing
- Vitest unit tests for metric functions: timezone boundaries, duplicates, deleted posts, first observation, missing views, true zero, empty ranges.
- Do not write placeholder tests. Test real behavior.
- Run lint, type check, tests and a production build before declaring any phase done.

## 10. Open-source hygiene
- Keep `.env.example` current and documented, with no real values.
- README must say what works and what does not. Never claim an unbuilt feature works.
- Every user needs their own Telegram `api_id`/`api_hash` from my.telegram.org; document this.
- Respect third-party licenses and include a `LICENSE` file.

## 11. After every phase
1. Report: what was done, files changed, dependency changes and why, tests run and results, known issues.
2. Make one commit with the specified message. Stage only intended files. Do not push, amend or rewrite history.
3. Stop and wait for review. Do not start the next phase.

## 12. Communication
Be direct. If a request conflicts with these rules, say so and ask. If something is unverified, say "unverified" instead of presenting it as fact.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
