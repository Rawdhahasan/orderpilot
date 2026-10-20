# OrderPilot

Customer PO intake, validation and approval for wholesalers and distributors.
Every customer PO is checked and approved before it becomes an order.

**Status: Phase 1 (foundation and development preview).** There is no backend yet:
no Supabase, no sign-in and no real data. The planning documents are in [docs/](docs/).

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
