# OrderPilot

Customer PO intake, validation and approval for wholesalers and distributors.
Every customer PO is checked and approved before it becomes an order.

**Status: Phase 2B (database security and audit).** The database runs locally; there is no
sign-in, no data access from the app and no real data yet. The planning documents are in [docs/](docs/).

## Run it locally

Requirements: macOS, Linux or Windows with **Node.js 24** (`node --version`). No Docker
and no accounts are needed for Phase 1.

```sh
cd ~/orderpilot
corepack pnpm install        # first time only; answer "Y" if corepack asks to download pnpm
corepack pnpm dev
```

Open **http://localhost:3000/preview/dashboard**.

`corepack pnpm` runs the exact pnpm version pinned in `package.json` without a global
install. If you prefer a global `pnpm`, run `corepack enable pnpm` (may need `sudo`)
and drop the `corepack` prefix.

## The development preview

`/preview` is an interactive, **development-only** preview using the fictional workspace
**Northstar Distribution**. Every page shows the banner _Development Preview — Fictional
Data_.

- All data comes from fictional fixtures in `src/preview/fixtures`. Nothing is connected
  to a database and no business data is requested over the network.
- Actions such as submit, approve, override or adjust stock use local component state and
  say **"Preview only — nothing was saved"**. Reloading resets everything.
- The **Viewing as** switcher in the banner changes the visible UI to show each role. It is
  a visual demonstration, never an authorisation mechanism.
- Production builds never include the preview: preview routes are `*.preview.tsx` files that
  only the development server compiles (see `docs/TECHNICAL_ARCHITECTURE.md` §20).

Good places to start: the dashboard, **Customer POs → IN-001042** (a messy PO with every kind
of exception), **IN-001043** (a clean PO you can submit), **Approvals → IN-001040**
(override required and a full backorder) and the **Component gallery** link in the sidebar.

## Commands

| Command                                          | What it does                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `corepack pnpm dev`                              | Development server with the preview on port 3000                                                |
| `corepack pnpm lint`                             | ESLint, including layer and preview boundary rules                                              |
| `corepack pnpm typecheck`                        | TypeScript strict type check                                                                    |
| `corepack pnpm test`                             | Unit and component tests (Vitest)                                                               |
| `corepack pnpm build`                            | Production build                                                                                |
| `corepack pnpm exec playwright install chromium` | One-time browser download for end-to-end tests                                                  |
| `corepack pnpm test:e2e`                         | Preview journeys, accessibility, responsive and keyboard tests, then production isolation tests |
| `corepack pnpm check`                            | Lint, type check, unit tests and build in one go                                                |

Stop `corepack pnpm dev` before running `test:e2e`; the tests start their own servers on
ports 3100 and 3200. Set `PW_ALL_BROWSERS=1` (after `playwright install`) to run Firefox and
WebKit as well.

## Local database (Phase 2A)

Requires Docker Desktop running, with `docker` on your PATH (the Docker installer adds
`~/.docker/bin` to `~/.zprofile`; open a new terminal after installing). Everything runs
on your Mac only: no Supabase account or cloud project is used, and the Supabase CLI's
telemetry is switched off in every script.

| Command                   | What it does                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `corepack pnpm db:start`  | Starts the local Postgres database (port 54322) and applies migrations and seed data. Only the database and its metadata service run in Phase 2A |
| `corepack pnpm db:reset`  | Rebuilds the **local** OrderPilot database from empty: all migrations, then `supabase/seed.sql`                                                  |
| `corepack pnpm db:test`   | Runs the pgTAP database tests in `supabase/tests/database`                                                                                       |
| `corepack pnpm db:types`  | Regenerates `src/server/db/database.types.ts` from the local schema                                                                              |
| `corepack pnpm db:status` | Shows the connection URL and which services are running                                                                                          |
| `corepack pnpm db:stop`   | Stops the local database (data is kept until the next reset)                                                                                     |

Local connection string: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
(well-known local-only credentials; never used outside your machine).

## Signing in locally (Phase 2C)

From Phase 2C the stack also runs local Auth (email, password and TOTP MFA) and
Mailpit, a local mail catcher. No email ever leaves your machine.

1. `corepack pnpm db:start`, then `corepack pnpm db:env`. This writes the git-ignored
   `.env.local` from the running local stack. Never commit it.
2. `ORDERPILOT_DEV_PASSWORD='choose-12-or-more' corepack pnpm db:provision` sets that
   password on the fictional seed users (for example `sofia.brandt@northstar.example`,
   Owner). Without the variable a random password is generated and printed once.
3. `corepack pnpm dev` and open http://localhost:3000. Owners and Admins are asked to
   set up an authenticator app before they can use a workspace (D-24).
4. Invitation and password-reset emails appear in Mailpit at http://127.0.0.1:54324.

Public sign-up is off (D-03): accounts are created only by accepting an invitation, or by
the local provisioning script above. A lost authenticator is reset by an operator: see
[docs/runbooks/lost-authenticator.md](docs/runbooks/lost-authenticator.md).

| Command                       | What it does                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `corepack pnpm db:env`        | Writes `.env.local` for the local stack (values are never printed)                       |
| `corepack pnpm db:provision`  | Sets a local password on the fictional seed users                                        |
| `corepack pnpm ops:reset-mfa` | Operator MFA reset with an audit record (local stack only)                               |
| `corepack pnpm test:e2e:app`  | Signed-in journeys on port 3300; **resets the local OrderPilot database** before running |

## Project structure

```
docs/                 planning documents (requirements, flows, architecture, design, roadmap, testing)
src/app/              routes; src/app/preview holds development-only *.preview.tsx routes
src/components/       design-system components (ui/ primitives, app shell, status, provenance, tables)
src/domain/           pure TypeScript: roles, permissions, statuses, exact decimal arithmetic
src/lib/              formatting and small utilities
src/preview/          fictional fixtures and preview-only screens (lint-isolated)
tests/unit, tests/component, tests/e2e
```

## Rules for contributors

- Never commit `.env*` files or secrets; `.env.example` lists variable names only.
- Money and quantities are decimal strings and use `src/domain/money/decimal.ts`, never
  floating point.
- Violet is reserved for unconfirmed AI suggestions.
