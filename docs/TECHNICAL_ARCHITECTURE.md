# OrderPilot: Technical Architecture

| | |
|---|---|
| **Status** | Draft v0.2: review corrections applied; Phase 1 approved; Phase 2 decisions still open |
| **Date** | 2026-10-20 |
| **Depends on** | [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md), [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md) |

---

## 1. Overview

OrderPilot is a single Next.js application deployed on Vercel, backed by Supabase (Postgres, Auth, Storage, Realtime). Business rules that protect data integrity live in Postgres; user-facing logic lives in a framework-free TypeScript domain layer; Next.js handles rendering, input validation and orchestration.

```mermaid
flowchart LR
    subgraph Browser
        UI[React UI<br/>Server + Client Components]
        PDF[PDF.js viewer]
    end
    subgraph Vercel["Vercel: Next.js App Router"]
        RSC[Server Components<br/>reads]
        SA[Server Actions<br/>mutations]
        RH[Route Handlers<br/>worker, health]
        DOM[Domain layer<br/>pure TypeScript]
        EXT[Extraction providers<br/>simulated in MVP]
    end
    subgraph Supabase
        AUTH[Auth]
        PG[(Postgres<br/>RLS, functions,<br/>triggers)]
        ST[(Storage<br/>private bucket)]
        RT[Realtime]
    end
    UI --> RSC
    UI --> SA
    UI -- signed upload URL --> ST
    PDF -- signed download URL --> ST
    RSC --> PG
    SA --> DOM
    SA --> PG
    RH --> EXT
    RH --> PG
    RH --> ST
    UI <-. status updates .-> RT
    RT --- PG
    SA --> AUTH
    PG -. outbox, future .-> ERP[ERP connectors]
```

**Key properties**

- One deployable application; no separate API server in the MVP.
- The browser never holds privileged credentials; it talks to Supabase directly only for auth sessions, signed uploads and downloads, and realtime subscriptions.
- Every database request from a user carries that user's identity, so row-level security always applies.
- Only a short, explicit list of server modules may use the service-role key (§7.3).

---

## 2. Technology stack

Versions: adopt the latest **stable** release of each library at project kickoff, pin exact versions in the lockfile, and avoid canary or beta releases. Verify compatibility of Next.js, React, Tailwind and shadcn/ui together at kickoff.

| Concern | Choice | Reason |
|---|---|---|
| Framework | Next.js App Router | Server Components for data-heavy pages, Server Actions for mutations, single deployable on Vercel |
| Language | TypeScript, strict mode plus `noUncheckedIndexedAccess` | Catches null and indexing errors common in data-heavy UIs |
| Styling | Tailwind CSS (v4) with CSS-variable design tokens | Token-driven theming; matches shadcn/ui |
| Components | shadcn/ui on Radix primitives | Accessible primitives; code is owned and customisable |
| Data tables | TanStack Table, TanStack Virtual | Headless, sortable, virtualised for 500-line POs |
| Forms | React Hook Form with Zod resolver | Performance on large forms; shared validation |
| Validation | Zod | One schema for client, server and JSON shapes (provenance, extraction contract) |
| Database, Auth, Storage, Realtime | Supabase, using `@supabase/ssr` for cookie sessions | Required stack; RLS-first security model |
| Decimal maths | decimal.js | Exact money and quantity arithmetic in TypeScript |
| Dates | date-fns with time zone support | Workspace time zones; unambiguous formatting |
| PDF viewing | PDF.js (pdfjs-dist), lazy loaded | Page navigation, zoom, highlighting the source page of a field |
| Icons | Lucide | Consistent stroke icon set used by shadcn/ui |
| Notifications | Sonner (toasts) | Minimal, accessible |
| Unit and integration tests | Vitest, Testing Library, fast-check | Fast; property-based tests for money and inventory |
| Database tests | pgTAP via Supabase CLI | Tests RLS, constraints and functions inside Postgres |
| End-to-end tests | Playwright with axe-core | Cross-browser journeys and accessibility checks |
| Linting and formatting | ESLint (with import-boundary rules), Prettier | Enforces layering (§3) |
| Package manager | pnpm | Fast, strict dependency resolution |
| Error monitoring | Sentry, if approved (D-30) | Error capture with data scrubbing |
| Hosting | Vercel and Supabase | Required stack; plans per D-26 |

---

## 3. Layering and boundaries

"Clear separation of frontend and backend" inside one Next.js app is achieved with enforced layers.

| Layer | Location | Responsibilities | May import |
|---|---|---|---|
| **Presentation** | `src/app`, `src/components`, `src/features/*/components` | Rendering, interaction, accessibility. No business rules beyond display logic. | Domain types, feature actions, UI components |
| **Application** | `src/features/*/actions.ts`, `src/features/*/queries.ts`, `src/app/api` | Authenticate, resolve workspace and role, validate input with Zod, call domain and data layers, map errors, revalidate | Domain, data access |
| **Domain** | `src/domain` | Pure TypeScript: state machine definitions, validation rules, matching presentation, money and quantity maths, date and number parsing. No I/O, no framework imports. | Nothing outside `src/domain` (and decimal.js, date-fns) |
| **Data access** | `src/server/db` | Typed Supabase clients, query and function wrappers, error-code mapping | Generated database types |
| **Privileged** | `src/server/privileged` | The only code allowed to use the service-role key (§7.3) | Data access |
| **Database** | `supabase/` | Schema, RLS, functions, triggers: final authority on integrity and permissions | n/a |

Enforcement:

- ESLint import-boundary rules fail the build on forbidden imports.
- Every server module imports the `server-only` package, so it cannot be bundled into client code.
- The service-role client factory lives in one file that only modules under `src/server/privileged` may import.

### 3.1 Planned repository structure

```
orderpilot/
  docs/                      planning documents (this set)
  src/
    app/
      preview/               development-only preview (Phase 1, §20); *.preview.tsx files
      (auth)/                sign-in, forgot and reset password, invitation, MFA
      (app)/o/[orgSlug]/     workspace-scoped pages
        dashboard/
        customer-pos/        list, upload, [intakeId] review
        approvals/           queue, [intakeId] approval summary
        sales-orders/        list, [salesOrderId]
        customers/           list, [customerId]
        products/            list, [productId]
        inventory/           list, [productId] movements
        audit/
        settings/            workspace, members, order rules
      api/
        jobs/extraction/     extraction worker endpoint (internal)
        health/
    components/
      ui/                    shadcn/ui components
      app-shell/  data-table/  document-viewer/  provenance/  status/
    features/                one folder per feature: components, actions, queries, schemas
      intake/ review/ approval/ sales-orders/ customers/ products/ inventory/ audit/ members/ settings/
    domain/
      orders/                state machines, validation rules
      matching/  money/  dates/  numbers/
    server/
      auth/                  current user, membership, permission map
      db/                    clients, function wrappers, error mapping
      extraction/            provider interface, simulated provider, contract schema
      storage/               signed URLs, file verification
      privileged/            service-role usage (worker, invitations, cleanup)
      logging/
    preview/                 fictional Northstar Distribution fixtures and preview-only components (§20)
    lib/                     formatting and small utilities
  supabase/
    migrations/  seed.sql  tests/
  tests/
    unit/  integration/  e2e/
    fixtures/documents/      fictional PO documents + expected extraction results
  scripts/ops/               platform operator scripts (create workspace, reset demo)
```

---

## 4. Request lifecycle

### 4.1 Reads
1. The request proxy (named `middleware.ts` before Next.js 16 and `proxy.ts` from 16) refreshes the Supabase session cookie and assigns a request ID.
2. The workspace layout resolves `orgSlug` to a workspace and checks membership **once per request** (memoised per request). Not a member: the generic not-found page.
3. Server Components query through the **user-scoped** Supabase client; RLS filters rows.
4. Complex screens use one database function that returns the whole payload (for example `get_review_payload`) to avoid many round trips.
5. Tenant data is rendered dynamically. **Shared caches are never used for tenant data** unless the cache key includes workspace and user, because a cache shared across users is a classic cross-tenant leak.

### 4.2 Mutations (Server Actions)
Every action goes through one wrapper that performs, in order:

| Step | Detail |
|---|---|
| 1. Authenticate | Verify the user server-side (`auth.getUser()` or `auth.getClaims()`); never trust unverified session data on the server |
| 2. Resolve workspace and role | From the slug in the action input |
| 3. Validate input | Zod schema; field errors returned to the form |
| 4. Check permission | Fast, friendly failure using the shared permission map (§7.2). The database re-checks. |
| 5. Execute | Call a database function or an RLS-protected table write |
| 6. Map errors | Stable database error codes become typed application errors |
| 7. Revalidate | Refresh affected routes or tags |
| 8. Return | A typed result: success with data, or failure with error code, message, optional field errors and request ID |

Actions never throw raw errors to the client and never return stack traces or SQL messages.

---

## 5. Authentication and sessions

| Topic | Design |
|---|---|
| Method | Supabase Auth email and password. Public sign-up disabled in the Supabase project (invite-only, D-03). |
| Sessions | HTTP-only, secure, `SameSite=Lax` cookies managed by `@supabase/ssr`; refreshed in the request proxy. |
| MFA | Supabase TOTP. Owners and Admins must reach assurance level 2 (AAL2). Enforced in the app **and** in database functions for member management and settings, by checking the `aal` claim. Settings have no direct table writes, so the check cannot be bypassed (C-03). |
| MFA recovery | No recovery codes in Supabase TOTP. The platform operator removes a lost factor through an audited operator script after out-of-band verification (FR-AUTH-09, M-09). |
| Invitations | Owner or Admin invites → server checks permission → privileged module calls the Supabase admin invite API for new users → `organization_invitations` row tracks workspace and role → `accept_invitation` binds membership after verifying the email matches. |
| Password policy | Minimum 12 characters. Leaked-password protection is a paid Supabase feature (D-26). |
| Revocation | Membership is checked on every request and in RLS, so suspension takes effect immediately for data access. |
| Email delivery | Custom SMTP required before external users (D-25). |

---

## 6. Multi-tenancy in the application

- URL structure: `/o/{orgSlug}/…`. The slug is resolved to an ID server-side; IDs from the client are never trusted for authorisation.
- Every query and function call passes `organization_id` explicitly **and** RLS enforces membership, so a wrong ID returns nothing rather than another tenant's data.
- Storage paths start with the workspace ID; storage policies check membership.
- Realtime subscriptions filter by workspace and are RLS-checked.
- Logs and error reports include workspace ID and user ID, never business content.

---

## 7. Security and permission model

### 7.1 Defence in depth

| Layer | Control | Protects against |
|---|---|---|
| 1. UI | Hide or disable actions the role cannot perform, with an explanation | Confusion; not a security control |
| 2. Server Action | Authentication, Zod validation, permission map check | Malformed input; obvious misuse |
| 3. Database functions | `assert_role` at the start of every workflow function; hard-gate validation; state machine | Bypassing the UI or calling the API directly |
| 4. RLS and grants | Membership on every row; minimal privileges; column privileges | Cross-tenant access; direct table tampering |
| 5. Constraints and triggers | Composite foreign keys, unique and check constraints, append-only triggers | Bugs in any layer above |

### 7.2 Permission map

One TypeScript module defines `permission → allowed roles` using the matrix in PRODUCT_REQUIREMENTS.md §8, for example `inbound_order.approve → owner, admin, approver`. The UI and Server Actions use it. Database functions encode the same roles. A test compares the TypeScript map with the database role checks so the two cannot drift.

### 7.3 Service-role (secret key) policy

The service-role key bypasses RLS, so its use is restricted to:

| Use | Module | Why it needs elevated access |
|---|---|---|
| Extraction worker | `privileged/extraction-worker` | Runs without a user session |
| Inviting new users | `privileged/invitations` | Supabase admin invite API |
| Cleanup of rejected uploads and stale jobs | `privileged/maintenance` | System process |
| Platform operator scripts | `scripts/ops` | Run locally by the operator, never deployed as public routes |

Every privileged action writes an audit event with `actor_type = 'system'` and, where relevant, the user who triggered it. The key exists only in server environment variables and is never prefixed `NEXT_PUBLIC_`.

### 7.4 Secrets and configuration

| Variable | Exposure |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon key) | Public; safe only because RLS is enforced |
| `SUPABASE_SECRET_KEY` (service role) | Server only, privileged modules only |
| `INTERNAL_JOB_SECRET` | Server only; authenticates internal worker calls |
| `EXTRACTION_PROVIDER` | Server only; `simulated` in MVP |
| `APP_BASE_URL` | Server only |
| `SENTRY_DSN` | If approved |

Rules: `.env.local` is never committed; `.env.example` lists names only; secrets are set in Vercel and Supabase dashboards per environment; secrets are rotated if exposed; a secret scanner runs in CI once a repository exists.

### 7.5 Input and output handling

- All inputs validated with Zod on the server, including IDs, enums, lengths and decimal formats.
- Extracted document text is **untrusted**. React escapes output by default; raw HTML rendering is banned by lint rule.
- CSV exports neutralise spreadsheet formula injection: cells starting with `=`, `+`, `-` or `@` are prefixed.
- Error messages never echo raw SQL, stack traces or other tenants' identifiers.

### 7.6 Platform operator access

- In MVP, workspaces are created and demo data is reset by **operator scripts** run locally against a chosen environment. There is no operator web console, so there is no extra public attack surface.
- The operator has **no standing access** to customer workspaces. Support access requires the customer to invite the operator as a member, which is visible and audited. This is a strong trust message for buyers (persona P4).
- An operator console with audited, time-limited support access is a later feature.

### 7.7 File upload security

| Control | Detail |
|---|---|
| Allowlist | PDF, PNG, JPEG; bucket-level MIME and size limits |
| Content verification | File signature ("magic bytes") checked at finalise; mismatches rejected and quarantined |
| Limits | 20 MB, 50 pages; per-user upload rate limit enforced in `create_pending_document` |
| No execution | Files are never executed or converted with shell tools on the server |
| Viewer | PDF.js kept current (CVE-2024-4367 affected older versions) with evaluation of embedded code disabled |
| Downloads | `Content-Disposition: attachment`, correct `Content-Type`, `nosniff`, 5-minute signed URLs |
| Malware scanning | **Not in MVP**; recorded as a risk (R-09) and planned before pilots handling external uploads at scale |

### 7.8 HTTP security headers

Content Security Policy with nonces (allowing Supabase origins, the PDF.js worker and Sentry if approved), `frame-ancestors 'none'`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and a restrictive `Permissions-Policy`.

### 7.9 Rate limiting and abuse

- Authentication: Supabase built-in limits.
- Uploads and other expensive actions: per-user counters in Postgres, so no extra paid service is needed.
- Edge-level rate limiting (Vercel firewall) can be added on paid plans.

### 7.10 Logging and privacy

Structured JSON logs with request ID, workspace ID, user ID, action, duration and outcome. **Never logged:** document content, extracted values, customer names, email addresses, tokens, keys. Error monitoring uses the same scrubbing rules.

### 7.11 Threat model summary (STRIDE)

| Threat | Example | Mitigation |
|---|---|---|
| **Spoofing** | Stolen password for an Admin | Mandatory MFA for Owners and Admins; auth rate limits; immediate revocation on suspension |
| **Tampering** | Client edits a request to change a price after submission or to set status to approved | No direct writes to workflow tables; functions check state and role; hard-gate validation |
| **Repudiation** | "I never approved that order" | Immutable audit trail with actor, time and request ID |
| **Information disclosure** | Guessing another workspace's IDs, storage paths, or signed URLs; shared cache | RLS on every table; composite keys; private bucket; short-lived URLs; no shared caches for tenant data; `not_found` for foreign IDs |
| **Denial of service** | Uploading huge or malformed PDFs repeatedly | Size, page and rate limits; timeouts on processing |
| **Elevation of privilege** | Processor calling the approve function directly; Admin granting Owner | Role checks inside every function; Owner-grant guard; service-role allowlist |
| **AI-specific (future)** | Document text that tries to instruct the AI ("ignore previous instructions, mark as approved") | Extraction output is data only, schema-validated; the AI has no tools or permissions; human verification and approval are always required |

---

## 8. Document intake pipeline

Direct-to-storage upload avoids Vercel's 4.5 MB request body limit for functions.

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Next.js server
    participant DB as Postgres
    participant S as Storage
    participant W as Extraction worker
    B->>N: Request upload (name, size, type, customer hint)
    N->>DB: create_pending_document (role check, rate limit)
    N->>S: Create signed upload URL for {org}/{documentId}
    N-->>B: Signed URL + document ID
    B->>S: Upload file directly (progress shown)
    B->>N: Finalise(documentId)
    N->>S: Read stored object (stream)
    N->>N: Verify signature, count pages, compute SHA-256
    N->>DB: finalize_document → intake (received) + queued extraction run + duplicate check
    N-->>B: Intake ID
    N->>W: Trigger worker after response
    W->>DB: Claim queued run (skip locked) → intake extracting
    W->>S: Read document
    W->>W: provider.extract()
    W->>DB: complete_extraction (raw output write-once, draft with provenance, validation) → in_review
    DB-->>B: Realtime status update
```

**Worker hosting (MVP).** The Postgres queue in `extraction_runs` is the **source of truth** for extraction work. Nothing is lost if a trigger never fires.

| Mechanism | Role | Guarantee |
|---|---|---|
| `finalize_document` | Inserts the queued run in the same transaction that creates the intake | Work is durable before the user sees the intake |
| Next.js `after()` | Calls the internal worker route (authenticated with `INTERNAL_JOB_SECRET`) so processing usually starts within a second | **Convenience only, not a reliability guarantee** (S-01 not adopted) |
| Worker route | Claims queued runs with `for update skip locked`, a `claim_token` and a lease; processes them with a provider timeout shorter than the lease and the function's maximum duration | Only the lease holder can record a result (idempotent completion, DATABASE_ARCHITECTURE.md §6.4) |
| `pg_cron` every minute | `recover_stale_extractions()` turns expired leases into transient failures and re-queues them with backoff | Stuck jobs recover without any user action (M-05) |
| Opening an extracting intake | Runs the same recovery check for that intake and re-triggers the worker | Recovery is visible to the user immediately |
| Retry policy | Transient: up to 3 attempts with exponential backoff. Permanent: fail immediately | No endless loops; clear failure reasons (M-04) |

Re-queued jobs need a worker invocation to run. In MVP that comes from the next `after()` trigger or from a user opening the intake; a scheduled HTTP trigger (Vercel Cron or `pg_net`) is added when deployed environments exist (TD-03). Swapping the trigger mechanism needs no data changes.

---

## 9. Extraction subsystem

### 9.1 Provider interface

A provider receives the document (bytes, MIME type, page count) and limited context (workspace locale, optional customer hint) and returns an `ExtractionResult` that conforms to the **extraction contract**. Providers are selected by configuration.

### 9.2 Extraction contract (`extraction.v1`)

Defined as a Zod schema and stored with each run.

| Part | Content |
|---|---|
| Document | Detected language, currency as printed, page count, provider warnings |
| Header fields | For each field: raw text as printed, proposed normalised value, confidence 0 to 1, page, ambiguity flag |
| Lines | Line number, page, customer part number, description, quantity, unit, unit price, line total, each with raw text, value and confidence |
| Status | `complete`, `partial`, `not_recognised`, with reason |

**Parsing stays in our code.** Dates and numbers are re-parsed by deterministic domain functions using the customer's date-order hint and the workspace locale. Ambiguity (for example `04/05/2026`, or `1.234` meaning 1234 or 1.234) is detected by our code, not trusted from the provider.

### 9.3 Simulated provider (MVP)

| Behaviour | Detail |
|---|---|
| Recognition | Looks up the document's SHA-256 in a fixture registry, **only in demo workspaces and local or test environments**; everywhere else returns `not_recognised` (M-06) |
| Known fixture | Returns the prepared result after a 1 to 3 second delay |
| Built-in realism | Fixtures include low-confidence values, unknown part numbers, unit mismatches, price mismatches, a missing ship-to, ambiguous dates, multi-page documents, and one fixture that fails on its first attempt and succeeds on retry (C-10) |
| Unknown document | Returns `not_recognised` with **no values** (PR-07) |
| Determinism | Same input, same output: stable tests and demos |
| Labelling | UI shows "Simulated extraction (demo)" while this provider is active |

Fixture documents are fictional POs from invented companies, created as PDFs during Phase 4A together with their expected results.

### 9.4 Path to a real provider (post-MVP)

1. Collect a labelled evaluation set of real, anonymised POs (with customer permission).
2. Build an evaluation harness: field-level accuracy, line-level accuracy, cost and latency per page, failure modes.
3. Compare candidates (for example Anthropic's Claude models, Azure AI Document Intelligence, AWS Textract, Google Document AI) on accuracy, cost, data retention terms, regional processing and processor agreements.
4. Implement the chosen provider behind the same interface; keep the simulated provider for tests and demos.
5. Decide what context may be sent to the provider (for example customer names to improve matching); this is a data-sharing decision.

---

## 10. Matching and validation

### 10.1 Customer matching
Signals: account number found on the document (strongest), name similarity (`pg_trgm`), ship-to or bill-to address match, upload-time customer hint. Combined into a score; the top three candidates are shown with reasons. **Never auto-confirmed.**

### 10.2 Product matching
Per line, in priority order: customer item alias on the normalised part number; exact normalised SKU; exact GTIN; description similarity against product name and description. Top five candidates with method and score; very weak suggestions are hidden. Implemented as a set-based SQL function for the whole PO at once, so 500 lines cost one round trip.

### 10.3 Validation engine
- A list of small pure rules in `src/domain/orders/validation`, each with a code, severity, scope and the inputs it fingerprints.
- Input: a snapshot of the intake plus context loaded in one query (customer status, product statuses, expected prices, balances, duplicate candidates, workspace settings).
- Output: exceptions, stored via `record_validation` with the version they were computed for.
- The database's hard gate re-checks blocking rules at submit and approve (DATABASE_ARCHITECTURE.md §8.1). Overridable blocking exceptions may be submitted as **Override required** but must be overridden before approval (C-01).
- Price comparison uses the stored 4-decimal precision, never rounded display values (C-05). TypeScript rounding uses decimal.js `ROUND_HALF_UP` (away from zero), matching Postgres `round(numeric, 2)`.

---

## 11. Concurrency and consistency

| Situation | Mechanism |
|---|---|
| Two people edit the same draft | Optimistic concurrency with `version`; the later save is refused with who and when |
| Rapid autosaves | One in-flight save per intake; changes coalesce; the next save uses the returned version |
| Two approvals of the same intake | Row lock, idempotent function, unique constraint on `sales_orders.inbound_order_id` |
| Two orders competing for the last units | Balance rows locked in a fixed order inside each transaction |
| Same PO number approved in parallel on two intakes | Partial unique index on sales orders |
| Duplicate clicks | Buttons disabled while in flight; server is idempotent anyway |
| Stale data on screen | Realtime updates for statuses; every write re-validates server-side |

Optimistic UI updates are used only for low-risk interactions (for example confirming a field). Approvals, cancellations, fulfilment and stock changes always wait for the server.

---

## 12. Realtime updates

- Supabase Realtime (Postgres changes on `inbound_orders`, filtered by workspace) updates the intake list and the review screen when extraction finishes or status changes.
- If the realtime connection is unavailable, the page falls back to polling every 10 seconds while work is in progress.
- "Who else is viewing" presence is a later enhancement.

---

## 13. Integration architecture (designed now, built later)

- **Outbox:** every sales order confirmation, cancellation and fulfilment writes an `integration_outbox` event in the same transaction (DATABASE_ARCHITECTURE.md §6.7).
- **Canonical order (v1):** sales order ID and number, customer (ID, account number, name), customer PO number, dates, addresses, currency, lines (SKU, description, quantity, unit, unit price, line total, allocated and backordered quantities), approval details. Versioned so connectors can evolve.
- **Dispatcher (future):** reads unprocessed events, calls connectors with the sales order ID as idempotency key, retries with backoff, and parks repeated failures for review.
- **External references (future):** maps OrderPilot records to ERP IDs.
- **Public API and webhooks (future):** versioned REST under `/api/v1`, per-workspace hashed API keys with scopes, OpenAPI generated from Zod schemas, HMAC-signed webhooks.

---

## 14. Error handling, loading and empty states

| Situation | Pattern |
|---|---|
| Page loading | Route-level skeletons matching the final layout (no spinners on full pages) |
| Section loading | Streaming with Suspense boundaries per panel |
| Unexpected error | Route error boundary with plain-language message, **Try again**, and the request ID |
| Not found or not permitted | Generic not-found page (does not reveal existence) |
| Form validation | Inline field errors; input preserved; focus moves to the first error |
| Business rule refusal | Specific message from the error code, for example "This order was already approved by Priya as SO-2026-000412" |
| Background action success | Toast with a link to the result |
| Persistent state (offline, demo, simulated extraction) | Banner |
| Empty list | Explains what belongs here and offers the next action (for example **Upload PO**) |
| Long operations | Progress indicator with status text; never a frozen button |

---

## 15. Observability

- **Errors:** Sentry (if approved) with request ID, workspace ID and user ID tags, and data scrubbing.
- **Logs:** structured JSON in Vercel logs; Supabase logs for database, auth and storage.
- **Database health:** query statistics (`pg_stat_statements`); slow-query review each phase.
- **Integrity:** nightly `inventory_integrity_report` and audit continuity checks; any violation alerts the operator.
- **Product metrics:** computed from audit events and timestamps with SQL (PRODUCT_REQUIREMENTS.md §13); no third-party analytics in MVP.
- **Health endpoint:** `/api/health` checks database connectivity without exposing details.

---

## 16. Environments and delivery (planned; nothing is created until approved)

| Environment | Purpose | Infrastructure |
|---|---|---|
| Local | Development and all automated tests | Supabase CLI (Docker), Next.js dev server, seed data |
| Staging | Integration testing, demo rehearsals | Separate Supabase project and Vercel environment |
| Production | Customers and prospect demos | Separate Supabase project in the approved region (D-23) and Vercel production |

**Planned pipeline** (once you approve creating a repository):

1. On every pull request: install, type check, lint, unit tests, database tests against a local Supabase stack, build, end-to-end tests.
2. On merge to main: apply migrations to staging, deploy staging, run smoke tests.
3. Production: manual promotion; migrations applied with an approval step; backups verified first.

---

## 17. Performance and scalability

- Server-side pagination (keyset) for every list.
- Single-call payload functions for heavy screens.
- Virtualised line tables for large POs.
- PDF.js loaded only on review and approval pages.
- RLS helpers evaluated once per statement (sub-select pattern) and backed by membership indexes.
- Set-based SQL for matching and validation context, no per-line queries.
- Approval within one workspace is serialised by the order-number lock; acceptable for the assumed volumes (A-02) and easy to relax later with non-gap-free numbering.

---

## 18. Major technical risks

Likelihood and impact: H = high, M = medium, L = low.

| ID | Risk | L | I | Mitigation |
|---|---|:-:|:-:|---|
| R-01 | **Cross-tenant data leak** through an RLS gap, a view without `security_invoker`, a shared cache, or misuse of the service-role key | M | H | RLS on every table with a build-failing check; composite foreign keys; pgTAP isolation matrix for every table and role; no shared caches for tenant data; service-role allowlist; security review before pilots |
| R-02 | **Inventory errors** from race conditions or rounding | M | H | Single-transaction functions with ordered row locks; ledger with invariants; property-based and concurrency tests; nightly integrity report |
| R-03 | **Service-role key exposure** | L | H | Server-only module, never `NEXT_PUBLIC_`; secret scanning; rotation procedure |
| R-04 | **Simulated extraction sets unrealistic expectations**; real AI accuracy, cost and latency are unknown | H | M | "Simulated" label; evaluation harness before choosing a provider; human verification is the product's core regardless of accuracy |
| R-05 | **Vercel platform limits** (4.5 MB request bodies, function duration limits per plan) | H | M | Direct-to-storage uploads; asynchronous extraction with a Postgres queue; stale-job sweep |
| R-06 | **Locale ambiguity** in dates and numbers across US, UK, Canada and EU | H | H | Deterministic parsing in our code; customer date-order hints; blocking `DATE_AMBIGUOUS`; unambiguous display format |
| R-07 | **Free-tier constraints**: Vercel Hobby non-commercial terms; Supabase free projects pause when inactive and lack point-in-time recovery | H | M | Free tiers for private development only; paid plans before demos or pilots (D-26) |
| R-08 | **Documents not covered by database backups** | M | H | Separate document backup strategy decided before pilots |
| R-09 | **Malicious files** (PDF exploits, malware) and script injection through extracted text | M | H | Signature checks, limits, current PDF.js with eval disabled, no server-side execution, React escaping, CSP; malware scanning before scale |
| R-10 | **Prompt injection** once a real AI provider is used | M | M | Output treated as data and schema-validated; provider has no tools or permissions; human approval always required |
| R-11 | **Framework and API churn** (Next.js caching semantics, request proxy rename, Supabase key and auth changes) | M | M | Pin versions; upgrade deliberately with tests; keep framework code in thin layers |
| R-12 | **RLS performance** at higher volumes | L | M | Sub-select helper pattern, indexes, query plans reviewed with seeded large data |
| R-13 | **Review screen complexity** (large POs, keyboard flow, accessibility) underestimated | M | M | Build it as a dedicated phase with usability testing on fixtures; virtualisation |
| R-14 | **Data protection compliance** (GDPR, UK GDPR, PIPEDA, Quebec Law 25) and residency expectations | M | H | Region decision (D-23); processor agreements; data inventory; erasure procedure; legal review before EU or UK pilots |
| R-15 | **Scope creep toward ERP** (invoicing, shipping, tax) | H | M | Positioning as intake and validation layer; out-of-scope list; integrations instead |
| R-16 | **Email deliverability** with the default Supabase email service | H | M | Custom SMTP before any external user (D-25) |
| R-17 | **Vendor lock-in** to Supabase | L | M | Standard Postgres schema and SQL functions; storage behind a small interface; auth usage kept conventional |
| R-18 | **TypeScript 7 (native compiler) toolchain support** lags in Next.js and typescript-eslint | M | M | Pin the newest TypeScript version both officially support; verify at each upgrade |
| R-19 | **Very recent framework patches** introduce regressions | M | L | Pin patch releases that have been public for at least two weeks unless a security fix requires otherwise |
| R-20 | **No container runtime** on the development machine; local Supabase (Phase 2) needs one | H | M | Choose Docker Desktop (free under its small-business terms) or Colima before Phase 2 |
| R-21 | **Development preview leaks into production** (fictional data or unguarded routes deployed) | L | H | Preview files use a page extension that production builds never compile, a runtime guard on `NODE_ENV`, a lint boundary, and an automated production-build test (§20) |

---

## 19. Technical decisions requiring approval

| ID | Decision | Recommendation | Alternative |
|---|---|---|---|
| TD-01 | Data access | Supabase client with generated types, SQL functions for workflows; no ORM | An ORM (Drizzle or Prisma) over a direct connection, which bypasses RLS unless carefully configured |
| TD-02 | Mutation path | Server Actions calling database functions | Browser calling the database API directly (weaker input validation and error handling) |
| TD-03 | Background jobs | MVP: Postgres queue as source of truth with leases, retries and `pg_cron` recovery; `after()` only starts work early. Real-AI phase: add a scheduled HTTP trigger, or Supabase Queues, or a managed job service | A managed job service from day one (extra vendor and cost) |
| TD-04 | PDF viewer | PDF.js | Browser's built-in viewer in an iframe (no page highlighting, inconsistent across browsers) |
| TD-05 | Repository layout | Single Next.js app; no monorepo until a second deployable exists | Monorepo now |
| TD-06 | Platform operator tooling | Local scripts in MVP; console later | Operator web console in MVP |
| TD-07 | Error monitoring | Sentry with scrubbing (same as D-30) | Logs only |

---

## 20. Development preview (Phase 1, approved P1-7)

The preview is an interactive, development-only demonstration of the product using the fictional workspace **Northstar Distribution** (PRODUCT_REQUIREMENTS.md §7.13). It shares the real design system and components but nothing else.

| Control | Mechanism |
|---|---|
| **Not compiled in production** | Preview route files are named `*.preview.tsx`. `next.config.ts` adds the `preview.tsx` page extension **only for the development server phase** (`PHASE_DEVELOPMENT_SERVER`), so `next build` never sees them as routes. No environment variable can change this. |
| **Runtime guard** | The preview layout calls `notFound()` whenever `NODE_ENV === 'production'`, as a second line of defence. |
| **Import boundary** | ESLint forbids importing `src/preview/**` from anywhere outside `src/preview` and `src/app/preview`. |
| **No backend** | No Supabase client, no credentials, no `fetch` for business data. Fixtures are static TypeScript modules, each exporting `FICTIONAL = true` and labelled on screen. |
| **No persistence** | Interactive controls use local React state only. A toast states "Preview only — nothing was saved". Reloading resets everything. |
| **Visible labelling** | Persistent banner "Development Preview — Fictional Data" on every preview page. |
| **Role switcher** | Changes which UI is shown, as a demonstration. It is not connected to any authorisation code path. |
| **Search engines** | `noindex` metadata on all preview pages (defence in depth; the preview is never deployed). |
| **Verification** | An automated test builds for production and asserts that every preview URL returns 404, that the build route manifest contains no preview routes, and that no fixture text appears in the build output. |
