# OrderPilot: Testing Strategy

| | |
|---|---|
| **Status** | Draft v0.2: review corrections and simplifications S-02 to S-04 applied |
| **Date** | 2026-10-20 |
| **Depends on** | [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md), [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md), [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md), [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) |

> **How to read this document.** Tests are organised by what they protect, not only by tool. The highest-risk guarantees (tenant isolation, permissions, inventory accuracy, duplicate prevention, audit immutability and "AI never approves") are tested in the database itself, because the database is the final authority. Requirement IDs such as `FR-APR-07` link each test area to [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

---

## 1. Principles

1. **Test where the rule is enforced.** Rules enforced in Postgres are tested with pgTAP inside Postgres; pure business logic is tested in TypeScript; journeys are tested in the browser.
2. **Prove the negative.** For security, a test that shows a forbidden action *fails* is worth more than one that shows an allowed action succeeds.
3. **Deterministic by default.** The simulated extractor, fixed clocks and seeded data make every test repeatable. No test depends on the network or a cloud service.
4. **Every bug gets a test.** A fixed defect is closed only with a regression test at the lowest layer that would have caught it.
5. **Fictional data only.** No real company names, people or documents in fixtures, seeds or screenshots.

---

## 2. Test layers and tools

| Layer | Tool | Runs against | Speed | Share of tests (approx.) |
|---|---|---|---|---|
| Unit (domain) | Vitest, fast-check | Pure TypeScript in `src/domain` | Milliseconds | 45 % |
| Database | pgTAP via Supabase CLI | Local Postgres with migrations and seed | Seconds | 25 % |
| Integration (server) | Vitest | Server actions, extraction pipeline, storage verification against the local Supabase stack | Seconds | 15 % |
| Component | Vitest, Testing Library | Complex components (provenance markers, line table, exception panel) | Milliseconds | 5 % |
| End-to-end | Playwright with axe-core | Built app plus local Supabase | Minutes | 10 % |
| Concurrency | Vitest or Node scripts with parallel database sessions | Local Postgres | Seconds | Small but critical |
| Performance | SQL `explain analyze`, Playwright traces, scripted load | Large reference dataset | Minutes | Phase 6 and before releases |
| Preview isolation | Vitest, Playwright, production build inspection | Development server and production build | Minutes | Phase 1 onwards (§5.10) |

---

## 3. Coverage expectations

Coverage percentages are a guide, not a goal. The required standard is that **every rule in the lists below has at least one test that fails when the rule is broken.**

| Area | Expectation |
|---|---|
| `src/domain` | Line and branch coverage of at least 90 % |
| Database functions | Every function in [DATABASE_ARCHITECTURE.md §14](DATABASE_ARCHITECTURE.md) has success, permission-denied and invalid-state tests |
| Exception codes | Every code in PRD §9 has raise, resolve and (where allowed) override tests |
| Tables | Every table appears in the isolation and permission matrices |
| Requirements | Every Must requirement maps to at least one automated test (§13) |

---

## 4. Unit tests (domain)

| Area | What is tested |
|---|---|
| State machines | Every allowed transition in DATABASE_ARCHITECTURE §8.2 is accepted; every other pair is rejected |
| Validation engine | Each exception code: raised in the right conditions, not raised otherwise, re-opens when its underlying data changes |
| Money | Decimal arithmetic, rounding of line totals to cents, sub-cent unit prices (Q-5), price tolerance comparison (D-14) |
| Quantities | Allowed decimals per product, zero and negative rejection |
| Dates | Day-month vs month-day ambiguity detection (`DATE_AMBIGUOUS`), customer date-order hints, time zone conversion and display |
| Numbers | Locale parsing: `1,234.56`, `1.234,56`, `1 234,56`; rejection of ambiguous input |
| PO number normalisation | `PO-88213`, `po 88213` and `88213` compare equal; switchable leading-PO rule (Q-3) |
| Matching presentation | Ordering of candidates: alias, SKU, GTIN, description; score display |
| GTIN | Check digit validation |
| Confirmation rule | Fields below the confidence threshold cannot be bulk-confirmed (D-06) |
| Submission rule | Submit is allowed with open overridable blocking exceptions and refused with any non-overridable one (C-01) |
| Price comparison | `$0.0125` vs `$0.0130` is a mismatch at zero tolerance (C-05); TypeScript and SQL rounding agree |
| Allocation | Available of zero or below allocates nothing; allocation respects product decimals (M-03) |
| System defaults | Missing bill-to and currency produce `system_default` provenance, never `ai` (M-10) |

**Property-based tests (fast-check):**

- Sum of rounded line totals vs printed total never produces false `TOTAL_MISMATCH` within rounding tolerance.
- Parsing then formatting a number in any supported locale returns the same value.
- Any random sequence of reserve, release, issue, receive and adjust operations applied to an in-memory model keeps on hand and reserved non-negative where the rules require it. The same sequences are replayed against the database in §5.6.

---

## 5. Database tests (pgTAP)

### 5.1 Schema guards (run first; fail the build)

| Check | Rule |
|---|---|
| RLS enabled | Every table in exposed schemas has row-level security enabled |
| Policies present | Every table with RLS has at least one policy, or is explicitly listed as function-only with no grants |
| No `anon` access | The `anon` role has no table privileges |
| Views | Every view uses `security_invoker = true` |
| Functions | Every `security definer` function sets `search_path = ''`; execute is revoked from `public` and `anon` |
| Foreign keys | Every foreign key column is indexed; tenant tables use composite `(organization_id, id)` references |
| Audit triggers | Every audited table has the audit trigger attached |
| Generated types | Committed TypeScript types match the schema |

### 5.2 Tenant isolation matrix

For **every table**, with two seeded workspaces A and B and a user in A:

- `select` returns no rows from B.
- `insert`, `update` and `delete` targeting B fail or affect zero rows.
- Inserting a row in A that references a row in B fails (composite foreign keys).
- Workflow functions called with an ID from B return `not_found`, never `forbidden` (existence is not revealed).
- Storage: listing, reading and uploading under B's folder fail.

A suspended or removed member of A is treated as a non-member on the next statement (FR-AUTH-07).

### 5.3 Role permission matrix

Generated from the table in PRD §8 and the access matrix in DATABASE_ARCHITECTURE §7.4. For each of the six roles, each capability is attempted; allowed ones succeed, others fail with `insufficient_privilege`. Specific cases:

- A Viewer cannot upload, edit, approve or adjust stock.
- A Processor cannot override exceptions, approve or change prices.
- An Inventory Manager can mark fulfilled but cannot approve.
- Only an Owner can grant or remove the Owner role; the last active Owner cannot be removed or demoted (FR-ORG-04).
- With independent approval on, the submitter cannot approve, whatever their role (FR-APR-04).
- Direct updates to `status`, `is_demo`, `list_price`, `track_inventory`, workspace settings and decision columns are rejected for **every** role; the role-checked functions (`set_customer_status`, `set_product_price`, `set_product_tracking`, `update_workspace_settings`, `set_base_currency`) allow exactly the roles in PRD §8 (C-03, M-08).
- Settings changes without MFA level AAL2 are refused.
- Base currency can be changed by the Owner before the first intake and by nobody after it (C-04).
- Withdraw is allowed for the submitter and Approver+ only; customer deactivation for Admin+ only (M-08).

### 5.4 State transitions

- Every allowed transition succeeds through its function and writes an audit event.
- Every disallowed transition, and any direct `update` of a status column, is rejected.
- Stale `expected_version` returns `stale_version` and changes nothing (FR-REV-10).
- No function callable by the worker or service role can create a sales order (PR-01).

### 5.5 Approval transaction

| Case | Expected result |
|---|---|
| Valid intake, sufficient stock | One sales order, lines, reservations, aliases, audit events and one outbox event, all in one transaction |
| Called twice | Second call returns the same sales order (idempotent) |
| Blocking exception without override | Failure list returned; nothing written |
| Customer placed on hold after submission | Approval refused unless overridden |
| Stock short, no decision supplied | `needs_stock_decision` with shortfall per line; nothing written |
| Stock short, backorder decision | `allocated_qty` and `backordered_qty` recorded; only allocated quantity reserved |
| Duplicate PO number approved on another intake meanwhile | `duplicate_po_number`; nothing written |
| Order numbers | Gap-free, sequential, correct prefix and year (D-21) |
| Failure injected after sales order insert | Full rollback: no sales order, no movements, no audit events |
| Override required item still open | Approval refused; nothing written (C-01) |
| Duplicate override made, then a new conflicting order appears | Override no longer matches; approval refused and the exception re-opens (M-07) |
| Available stock zero or over-committed, backorder decision | `allocated_qty = 0`, whole quantity backordered, no reservation movement (M-03) |
| Untracked product line | Allocated in full; no balance lock and no movement (M-01) |

### 5.6 Inventory invariants

- Invariants I-1 to I-6 (DATABASE_ARCHITECTURE §10.2) hold after every test in the suite: `private.inventory_integrity_report()` is asserted empty in teardown.
- Receive, adjust (delta and counted modes), reserve, release and issue each change balances exactly as specified.
- On hand can never go negative; issue is refused with `insufficient_on_hand` when stock was adjusted down below the allocation.
- Adjustment below reserved is allowed and flags the product as over-committed (FR-INV-05).
- Movements cannot be updated or deleted.
- Turning tracking off with open reservations is refused; turning it on creates exactly one balance row (M-01).
- Fulfilling an order with a backorder issues only the allocated quantity; the backordered quantity stays on the line and appears in the outbox payload (M-02).
- The random operation sequences from §4 are replayed against the database and the integrity report stays empty.

### 5.7 Duplicate detection

Each layer in DATABASE_ARCHITECTURE §12: same file hash, same customer and normalised PO number, similar content within the look-back window, one sales order per intake, the partial unique index backstop, and the PO number reuse rule after cancellation (Q-2).

### 5.8 Audit trail

- Every audited action writes the expected event with actor, request ID, changed fields and reason.
- Field edits record the original AI value.
- `update`, `delete` and `truncate` on `audit_events` fail for every role, including privileged roles outside the documented retention procedure.
- Viewers and Processors cannot read the workspace audit log, only entity timelines.

### 5.9 Storage policies

- Uploads only into the user's own workspace folder, only for a pending document row they created, never overwriting (`upsert: false`).
- No role can update or delete stored objects (PR-03).
- Bucket rejects files above 20 MB and disallowed MIME types.

### 5.10 Development preview isolation (Phase 1)

| Check | Expected result |
|---|---|
| Production build route manifest | Contains no `/preview` routes |
| Every preview URL against `next start` | 404, with and without any environment variables set |
| Build output | Contains no fixture text (for example "Northstar Distribution") |
| Import boundary | ESLint fails if code outside the preview imports preview fixtures |
| Network | Preview pages make no requests other than to the local server for their own assets |
| Labelling | Every preview page shows "Development Preview — Fictional Data"; every fixture module exports `FICTIONAL = true` |
| No persistence | Interactive actions show "Preview only — nothing was saved"; reloading restores the original fixture state; no `localStorage`, `sessionStorage`, IndexedDB or cookie writes |
| Role switcher | Changes visible UI only; covered by a test that no authorisation module imports it |

---

## 6. Integration tests (server)

| Area | What is tested |
|---|---|
| Server actions | Each action validates input with Zod, rejects unauthenticated calls, resolves the workspace from the URL, maps database error codes to user messages without leaking details |
| Upload verification | File signature checked against content, not extension; page count limit; SHA-256 recorded; a renamed executable is rejected and cleaned up |
| Extraction pipeline | Queue claim with `skip locked`; each fixture produces its expected draft and provenance; unknown documents produce **no values** (PR-07); the retry fixture fails once and succeeds on retry (C-10) |
| Extraction reliability | A completion with a stale `claim_token` or an expired lease changes nothing (`stale_claim`); running the same job twice produces one draft; transient failures re-queue with backoff up to `max_attempts`; permanent failures fail immediately; `recover_stale_extractions` recovers a worker killed mid-job; a job whose `after()` trigger never fired is still processed (M-04, M-05) |
| Simulated provider scope | A fixture uploaded to a non-demo workspace in a non-test environment is `not_recognised` (M-06) |
| Extraction contract | Provider output that does not match `extraction.v1` is rejected and stored as a failed run |
| Signed URLs | Issued only after permission checks; expire after 5 minutes |
| Service-role usage | Only modules under `src/server/privileged` import the service-role client (lint rule plus test) |
| Request IDs | Present in audit events and error responses |
| Logging | No document content, tokens or secrets in logs (log output asserted against patterns) |

---

## 7. Concurrency tests

Run with real parallel database sessions, repeated many times per run to expose races.

| Scenario | Expected result |
|---|---|
| Two approvers approve the same intake at the same moment | Exactly one sales order; the other receives the existing one or `already_approved` |
| Double-click on Approve | One sales order |
| Two intakes compete for the last units of a product | Total reserved never exceeds what was decided; no negative balances |
| Two intakes with the same customer PO number approved in parallel | One succeeds; the other gets `duplicate_po_number` |
| Approval and stock adjustment on the same product in parallel | Both complete in a consistent order; invariants hold |
| Several approvals touching overlapping products in different orders | No deadlocks (fixed lock order) |
| Two users save the same draft | Later save gets `stale_version` with who and when |
| Many approvals in one workspace | Order numbers remain gap-free and unique |
| Two workers claim extraction jobs at the same time | Each job is claimed once; no duplicate drafts (M-04) |

After every scenario, the inventory integrity report must be empty.

---

## 8. End-to-end tests (Playwright)

Day-to-day runs use Chromium only. **All three engines (Chromium, Firefox, WebKit) run before each phase is signed off** (S-04). Desktop (1440 px) and phone (390 px) widths are covered where the screen is meant to work on phones.

| ID | Journey | Key assertions |
|---|---|---|
| E2E-01 | Sign in, MFA enrolment for an Owner, sign out | MFA required for Owner and Admin |
| E2E-02 | Invitation accepted, role applied | Invitation single-use and expiring |
| E2E-03 | Workspace switching | URL contains workspace; data changes accordingly |
| E2E-04 | Create customer, address, hold and release | Hold reason required; role restrictions in UI |
| E2E-05 | Create product, receive and adjust stock | Movement history and balances correct |
| E2E-06 | Upload a clean fixture, review, submit | Provenance markers visible; submit blocked until all AI fields confirmed |
| E2E-07 | Upload a messy fixture and resolve every exception | Unknown part, unit mismatch, price mismatch, missing ship-to, ambiguous date |
| E2E-08 | Upload the same document twice | `DUPLICATE_DOCUMENT` and `DUPLICATE_PO_NUMBER` shown; cancel as duplicate |
| E2E-09 | Unknown document | Manual entry mode; no values filled in |
| E2E-10 | Approve with stock shortfall and backorder | Sales order shows reserved and backordered quantities |
| E2E-11 | Request changes, then resubmit and approve | Status and timeline correct |
| E2E-12 | Self-approval with independent approval on | Approve not available; server refuses if forced |
| E2E-13 | Cancel and fulfil sales orders | Stock released or issued correctly |
| E2E-14 | Two browser sessions edit the same intake | Stale-version message names the other user |
| E2E-15 | Session expires during review | Return to the same page after sign-in; autosaved edits kept |
| E2E-16 | Audit log filters and entity timeline | "AI suggested X, changed to Y" visible |
| E2E-17 | Dashboard on an empty workspace | "Not enough data" shown; no placeholder numbers (FR-DASH-05) |
| E2E-18 | Demo workspace scripted demo and reset | Banner and "Simulated extraction" label always visible |
| E2E-19 | Viewer journey | No edit actions visible; direct URL to edit pages refused |
| E2E-20 | Cross-tenant URL | Pasting another workspace's intake URL shows not found |
| E2E-21 | Submit with Override required, approver overrides, approves | Approve disabled until the override is made (C-01) |
| E2E-22 | Fulfil an order with a backorder | "Fulfilled · N backordered" shown; stock issued for the allocated quantity only (M-02) |
| E2E-23 | Profile and security page | Name, password and MFA changes (M-09) |

---

## 9. Accessibility testing

- axe-core runs in every E2E test on every page visited; any serious or critical violation fails the build.
- Keyboard-only E2E run of the review screen: confirm fields, resolve exceptions and submit without a mouse.
- Manual screen reader passes (VoiceOver on macOS and iOS, NVDA on Windows) on the core journeys before each release.
- Checks for 200 % zoom and 320 px reflow on all pages except the document canvas ([DESIGN_SYSTEM.md §14](DESIGN_SYSTEM.md)).
- Colour contrast tokens re-verified by script whenever the palette changes.

---

## 10. Visual regression

**Starts in Phase 6** (S-02), once the visual design has stabilised. Until then, the component gallery in the development preview is used for manual visual review.

Playwright screenshot comparisons for key screens (dashboard, review, approval summary, sales order detail) and component states (status badges, provenance markers, exception items, empty, loading and error states). Screenshots use fixed data and a fixed clock. Run on one browser to limit noise.

---

## 11. Security testing

| Activity | When |
|---|---|
| Isolation and permission matrices (§5.2, §5.3) | Every pull request |
| Dependency vulnerability scan | Every pull request and weekly |
| Secret scanning | Every pull request |
| Build check that no `NEXT_PUBLIC_` variable holds a secret and the service-role key is never in client bundles | Every build |
| HTTP security headers and CSP verified in E2E | Every pull request |
| Malicious file fixtures: renamed executables, oversized files, PDFs with embedded JavaScript, polyglot files | Integration suite |
| Script injection: extracted text containing HTML and script is displayed as text | E2E |
| IDOR checks: every ID-based route and action with IDs from another workspace | E2E and integration |
| Rate limiting on sign-in, password reset and upload | Integration |
| Internal review against OWASP ASVS Level 2 | Phase 6 |
| Independent penetration test | Before the first paid customer (needs approval) |

---

## 12. Performance testing

Run on a generated reference dataset: one workspace with 50,000 intakes, 50,000 products, 10,000 customers and full movement history, plus a second workspace to keep RLS realistic.

| Target (from PRD §10) | Method |
|---|---|
| List pages under 1 s server response at p95 | Scripted requests; `explain analyze` on each list query |
| Review screen interactive within 2 s for a 100-line PO | Playwright trace |
| Approval under 2 s for a 200-line PO | Timed database function calls |
| No sharp degradation to 500 lines and 50,000 products | Same tests at the upper bound |

Query plans for list, dashboard and matching queries are reviewed for sequential scans on tenant tables.

---

## 13. Requirement traceability

Each test is tagged with the requirement IDs it covers (for example `@FR-APR-07`). A script lists every Must requirement and the tests that cover it. **Until Phase 5 the script only produces a report; from Phase 5 the build fails if a Must requirement has none** (S-03). Summary of where each area is covered:

| Requirement area | Main test layers |
|---|---|
| PR-01 to PR-12 (principles) | Database §5, integration §6, E2E §8 |
| FR-AUTH, FR-ORG | Database §5.3, E2E-01 to 03 |
| FR-DASH | Integration, E2E-17 |
| FR-CUST, FR-PROD, FR-INV | Database §5.6, E2E-04, E2E-05 |
| FR-UPL, FR-EXT | Integration §6, database §5.9, E2E-06 to 09 |
| FR-REV | Unit §4, E2E-06, 07, 14, 15 |
| FR-APR, FR-SO | Database §5.5, concurrency §7, E2E-10 to 13 |
| FR-AUD | Database §5.8, E2E-16 |
| FR-PREV | Preview isolation §5.10, Phase 1 E2E suite |

---

## 14. Test data and fixtures

| Asset | Contents |
|---|---|
| Local seed | Two workspaces, one user per role in each, fictional customers, products, stock and history |
| Fixture documents | Fictional POs as PDFs and images (`tests/fixtures/documents`), each with its expected extraction result. Cover: clean PO, low-confidence values, unknown part numbers, cases vs eaches, price mismatch, missing ship-to, ambiguous dates, multi-page documents, a scanned image, a document in another currency, and an unrecognised document |
| Reference dataset | Generated large dataset for performance tests (§12) |
| Demo seed | Resettable data aligned with the fixtures for UF-13 |
| Clock | Fixed test clock so dates such as "requested date in the past" are stable |

Fixtures are versioned with the code. Changing a fixture requires updating its expected result in the same change.

---

## 15. CI gates and MVP release checklist

**On every pull request** (once a repository is approved):

1. Install with a frozen lockfile.
2. Type check, lint (including import boundaries), format check.
3. Unit and component tests.
4. Start local Supabase; apply migrations; run schema guards (§5.1), then the full pgTAP suite.
5. Integration and concurrency tests.
6. Build; secret and bundle checks.
7. E2E tests with axe (Chromium; all three engines before phase sign-off, S-04).
8. Preview isolation checks against a production build (§5.10).
9. Traceability report (§13); a failing gate from Phase 5 (S-03).

**Before a release to staging or production:** smoke tests after deployment; migrations tested against a copy of the previous schema with data.

**MVP release checklist**

- [ ] All CI gates green on the release commit.
- [ ] Every Must requirement covered by at least one automated test.
- [ ] Isolation and permission matrices pass for every table and role.
- [ ] Concurrency suite passes repeatedly with an empty integrity report.
- [ ] Performance targets met on the reference dataset.
- [ ] Manual screen reader passes completed; no open serious accessibility issues.
- [ ] Internal security review completed; no open high-severity findings.
- [ ] UF-13 demo rehearsed twice with a reset in between.
- [ ] Backup and restore procedure tested, including documents (R-08).
- [ ] Operator runbooks written and tried once.

---

## 16. Manual and acceptance testing

- **Exploratory sessions** at the end of each phase, focused on edge cases from [USER_FLOWS.md §5](USER_FLOWS.md).
- **Usability sessions** at the end of Phase 4B with two or three people who process orders today (RD-03).
- **User acceptance** with the first pilot customer on staging using their own anonymised documents, entered manually while extraction is simulated.

---

## 17. Decisions requiring approval

| ID | Decision | Recommendation |
|---|---|---|
| TS-01 | Browsers | **Approved (S-04):** Chromium day to day; all three engines before each phase sign-off |
| TS-02 | Visual regression | **Approved (S-02):** from Phase 6, key screens on one browser |
| TS-03 | Requirement traceability gate | **Approved (S-03):** report only until Phase 5, failing gate from Phase 5 |
| TS-04 | Penetration test | Independent test before the first paid customer (paid service; needs approval) |
| TS-05 | Usability participants | Two or three real order processors at the end of Phase 4B |
