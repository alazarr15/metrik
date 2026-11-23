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
| `pnpm prisma generate` | Generates the Prisma Client |
| `pnpm prisma migrate dev` | Applies pending database migrations in development |

---

## Architecture & Data Integrity Notes

- **Database Foundation**: The PostgreSQL database schema models channels, posts, append-only metric observations, and sync audit runs with strict data integrity rules. See [docs/database-schema.md](docs/database-schema.md) for full details.
- **No Personal Login Required**: The collector operates purely on public channel web previews. No user sessions or SMS codes are used.
- **Counter Precision Handling**:
  - Telegram public web previews display exact integer counts for values $< 1,000$ (e.g. `98`, `450`), but format values $\ge 1,000$ with metric suffixes (e.g. `1.2K`, `1.74M`).
  - Metrik records raw displayed strings alongside parsed numeric values and explicitly tags precision as `exact`, `rounded`, or `unavailable`.
  - Exact view deltas are strictly calculated only between observations with `exact` precision to prevent false delta reporting.
- **Discussion Group Limitations**:
  - Linked discussion groups and comment threads are **not accessible** via public web previews (Telegram redirects group preview requests to a join landing page).
  - Comment counters are captured when exposed on the channel post, but full group discussion analytics are outside the scope of public preview collection.
- **Platform Resilience**:
  - Ingestion respects Telegram rate limits (HTTP 429) and employs bounded pagination (`maxPages`).
  - Ingestion may be affected if Telegram modifies its public web preview HTML structure or imposes network-level request restrictions.

---

## License

[MIT](LICENSE)
