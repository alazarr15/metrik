# Metrik — Telegram Analytics Dashboard

Metrik is a self-hosted, open-source analytics dashboard designed to connect directly to Telegram channels you administer. It provides clean tracking of **Posts Published** and **Views** without relying on third-party SaaS backends, external databases, subscriptions, or centralized servers. Every user clones and operates their own independent instance.

> **Current Development Status**: Phase 0 (Foundation). Only project initialization, configuration, and tooling are set up. Database schema, Telegram API integration, metric processing, and UI dashboard features are **not implemented yet**.

---

## Technology Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict mode)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Database ORM**: [Prisma](https://www.prisma.io/) with [PostgreSQL](https://www.postgresql.org/)
- **Testing**: [Vitest](https://vitest.dev/)
- **Linting**: [ESLint](https://eslint.org/)
- **Package Manager**: [pnpm](https://pnpm.io/)

---

## Prerequisites

Before setting up Metrik, ensure you have the following installed:

- **Node.js**: v20 or higher (v22+ recommended)
- **pnpm**: v9 or higher
- **PostgreSQL**: v14 or higher (local or managed instance)
- **Telegram Developer Credentials**: Each operator needs an `api_id` and `api_hash` obtained from [my.telegram.org](https://my.telegram.org)

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

   Copy the example environment file and update the values:

   ```bash
   cp .env.example .env
   ```

   Configure your PostgreSQL connection string and Telegram application credentials:
   - `DATABASE_URL`: PostgreSQL connection string (e.g., `postgresql://postgres:postgres@localhost:5432/metrik?schema=public`)
   - `TELEGRAM_API_ID`: Your Telegram API ID from [my.telegram.org](https://my.telegram.org)
   - `TELEGRAM_API_HASH`: Your Telegram API Hash from [my.telegram.org](https://my.telegram.org)
   - `TELEGRAM_CHANNEL_ID`: Channel ID or username you administer
   - `APP_TIMEZONE`: Timezone for metric aggregation (default: `UTC`)

---

## Development Commands

| Command | Description |
|---|---|
| `pnpm dev` | Starts the Next.js development server on `http://localhost:3000` |
| `pnpm build` | Compiles the production build |
| `pnpm start` | Runs the compiled production server |
| `pnpm lint` | Runs ESLint checks |
| `pnpm typecheck` | Validates TypeScript types across the codebase |
| `pnpm test` | Runs the Vitest test suite |
| `pnpm test:watch` | Runs Vitest in watch mode |

---

## Architecture & Security Notes

- **Self-Hosted & Private**: Metrik defaults to listening on `localhost`. Do not expose the dashboard publicly without configuring access protection.
- **Direct Telegram Sessions**: Telegram authentication is handled strictly on the server side. Secrets, credentials, and session strings are never sent to the browser or logged.
- **Accurate Metric Handling**: Missing data is treated as unavailable (`null`), never misrepresented as zero. Post reach is shown as unavailable on Telegram as it is not provided by the platform.

---

## License

[MIT](LICENSE)
