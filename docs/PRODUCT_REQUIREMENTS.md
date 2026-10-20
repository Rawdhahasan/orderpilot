# OrderPilot: Product Requirements

| | |
|---|---|
| **Status** | Draft v0.3: Phase 1 complete; Phase 2A decisions approved; 2C and later decisions still open |
| **Date** | 2026-10-20 (v0.2 applies review corrections C-01 to C-10 and M-01 to M-11) |
| **Decision owner** | Product owner |
| **Related documents** | [USER_FLOWS.md](USER_FLOWS.md), [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md), [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md), [TESTING_STRATEGY.md](TESTING_STRATEGY.md) |

> **How to read this document.** Section 15 lists every decision with its status: decisions in §15.1 are **approved**; every decision in §15.2 is **unresolved** and must not be treated as approved. Section 14 lists the assumptions this plan rests on. Everything else is written so that it can be turned directly into tickets and tests. Requirement IDs (for example `FR-APR-04`) are referenced by the testing strategy.

---

## 1. Summary

OrderPilot turns incoming customer purchase orders into validated, approved sales orders for small and mid-sized wholesalers and distributors.

An employee uploads a customer's PO. The system proposes structured data, matches the customer and each line to the company's own records, checks stock, and flags anything missing or inconsistent. People verify every proposed value, resolve the exceptions, and an authorised person approves. Only an approved order becomes a sales order, and every step is recorded.

**Positioning.** OrderPilot is an *order intake and validation layer*, not an ERP. It sits between the customer's inbox and the distributor's system of record (accounting package or ERP). This keeps the product focused, makes it easy to adopt alongside existing systems, and creates a clear path to ERP integrations later.

**What makes it credible to a buyer:**

1. It never lets automation silently create an order.
2. It catches the expensive mistakes: duplicates, wrong items, wrong units, wrong prices, overselling.
3. It shows exactly who did what, when and why.
4. It keeps each business's data isolated and secure.

---

## 2. Real-world business problems

These are the recurring problems order desks at distributors describe. They are qualitative and must be validated in customer discovery. This document deliberately does not quote industry statistics.

| # | Problem | What happens today | Consequence | How the MVP addresses it |
|---|---|---|---|---|
| 1 | **Manual re-keying** | Staff read PDFs, scans and emails and type every line into the ERP. | Slow, tedious, error-prone work; orders queue up at peak times. | Upload once; extracted values pre-fill a structured review screen next to the original document. |
| 2 | **Every customer's PO looks different** | Layouts, field names and line formats vary by customer and by customer system. | Training new staff is slow; knowledge lives in people's heads. | Extraction normalises any layout into one review format. |
| 3 | **Customer part numbers do not match our SKUs** | Customers use their own item codes and descriptions. | Wrong items shipped; time spent looking up items. | Product matching with a per-customer cross-reference ("customer item aliases") that improves as orders are approved. |
| 4 | **Units of measure and pack sizes differ** | Customer orders "5 CS" while the catalog sells by the each, or vice versa. | Shipping 5 eaches instead of 5 cases of 12, or the reverse. | Unit mismatch is a blocking exception; the reviewer converts explicitly and the decision is recorded. |
| 5 | **Price on PO differs from agreed price** | Customer uses an old price list or applies an unagreed discount. | Disputes and credit notes at invoicing time. | Price comparison against customer-specific or list price; mismatches must be decided by a person before submission. |
| 6 | **Duplicate orders** | The same PO is emailed twice, emailed and faxed, or resent as a "reminder". | Double shipments, returns, unhappy customers. | Duplicate detection on PO number per customer and on file content; database guarantees at most one sales order per intake. |
| 7 | **Promising stock that is already committed** | Order entry does not see what other orders have already reserved. | Oversell discovered at picking; backorders and apologies. | Availability is shown during review and rechecked inside the approval transaction; approval reserves stock. |
| 8 | **Missing or ambiguous information** | No ship-to address, no requested date, dates like `04/05/2026` that mean different days in the US and UK. | Wrong deliveries, follow-up calls after the fact. | Missing fields are flagged, never guessed. Ambiguous dates must be confirmed. |
| 9 | **No traceability** | Nobody can tell who changed a quantity or why. | Disputes ("we never ordered 50") cannot be resolved; no accountability. | Immutable audit trail with before and after values, including the original AI suggestion. |
| 10 | **Customers on credit hold still get orders** | Order entry and finance are disconnected. | Bad debt exposure. | Customer "on hold" status blocks approval unless an approver overrides with a reason. |
| 11 | **Managers cannot see the queue** | Work sits in personal inboxes. | Orders age unnoticed; no visibility of bottlenecks. | Dashboard work queue, ageing, and assignment. |

---

## 3. Target market

### 3.1 Ideal customer profile (assumption, see A-01 to A-04)

- **Business type:** independent wholesalers and distributors selling B2B from their own stock.
- **Example verticals:** foodservice and beverage, janitorial and sanitation, packaging, industrial MRO, electrical, plumbing and HVAC, building materials, health and beauty, auto parts.
- **Size:** roughly 5 to 250 employees, with an order desk of 1 to 15 people.
- **Order channel today:** POs arrive mostly as email attachments (digital PDFs and scans), some by fax-to-email, few by EDI.
- **Systems today:** an accounting package or ERP (for example QuickBooks, Xero, Sage, NetSuite, Microsoft Dynamics 365 Business Central, SAP Business One, Odoo), often with spreadsheets alongside.

### 3.2 Regional implications

| Topic | USA | UK | Canada | EU | Product impact |
|---|---|---|---|---|---|
| Currency | USD | GBP | CAD | EUR (and others) | One base currency per workspace (D-12). |
| Date format on POs | MM/DD/YYYY | DD/MM/YYYY | Both seen | DD.MM.YYYY, DD/MM/YYYY | Ambiguous dates are a blocking exception. Display dates unambiguously (`14 Oct 2026`). |
| Decimal separator | `1,234.56` | `1,234.56` | Both | Often `1.234,56` | Extraction and validation must be locale-aware; flagged when unclear. |
| Sales tax / VAT / GST | Sales tax by state | VAT | GST/HST/PST | VAT | Tax is **not calculated** in MVP; tax amounts on the PO are captured for reference only (D-13). |
| Data protection | State laws (for example CCPA/CPRA) | UK GDPR | PIPEDA, Quebec Law 25 | GDPR | Data residency, processor agreements and erasure handling must be decided (D-23, D-27). |
| Language | English | English | English and French (Quebec) | Many | English UI only in MVP. Quebec customers may require French; flagged as a future requirement (D-29). |
| Address format | ZIP, state | Postcode, county optional | Postal code, province | Varies | Flexible address model with ISO country codes. |

### 3.3 Buying triggers

- The order desk cannot keep up without hiring.
- A costly error (duplicate shipment, wrong unit) has just happened.
- An ERP migration is underway and the business wants cleaner order intake.
- A key order-desk employee is leaving and their knowledge must be captured.

---

## 4. Personas

All personas are illustrative composites for design purposes. Any numbers in them are assumptions to validate in discovery, not research findings.

### P1. Order Processor: "Jordan", order desk specialist
- **Context:** Works at a foodservice distributor in Ohio with around 40 employees. Processes customer POs all day from a shared inbox.
- **Goals:** Get orders in quickly and correctly; stop retyping; avoid being blamed for errors they did not cause.
- **Frustrations:** Unreadable scans; customer item codes they have to look up; customers who send the same PO twice; not knowing whether stock is really available.
- **Needs from OrderPilot:** A fast review screen with the original document next to the data; keyboard-friendly editing; clear list of what is wrong and how to fix it; mappings remembered for next time.
- **Role in product:** `processor`.

### P2. Approver: "Priya", operations manager
- **Context:** Runs operations at an electrical and industrial supplies wholesaler near Birmingham, UK. Approves orders, handles exceptions, manages the order desk team.
- **Goals:** Approve good orders quickly; see risk at a glance (price changes, overrides, stock shortfalls, credit holds); keep the team accountable.
- **Frustrations:** Approving without context; discovering problems after shipping; no record of who changed what.
- **Needs from OrderPilot:** An approval summary that highlights what changed from the original document and every override with its reason; one-click approve when everything is clean; mobile-friendly approval queue.
- **Role in product:** `approver`.

### P3. Inventory Manager: "Marc", warehouse lead
- **Context:** Manages stock at a packaging and janitorial distributor in Ontario.
- **Goals:** Accurate stock numbers; know what is committed before the pick list arrives.
- **Frustrations:** Sales promising stock that is already allocated; adjustments with no reason recorded.
- **Needs from OrderPilot:** On-hand, reserved and available per product; receipts and adjustments with reason codes; movement history.
- **Role in product:** `inventory_manager`.

### P4. Economic buyer: "Sofia", managing director
- **Context:** Owns a beverage distributor in Hamburg.
- **Goals:** Grow without proportionally growing headcount; reduce costly mistakes; protect customer data and comply with GDPR.
- **Frustrations:** Software that looks impressive in a demo but needs constant babysitting; vendors that cannot explain where data is stored.
- **Needs from OrderPilot:** Trustworthy controls (human approval, audit trail, permissions), clear data residency, a credible implementation path.
- **Role in product:** `owner`.

### P5. Workspace Administrator: "Alex", office manager
- **Context:** Often the person who "does IT" at a small distributor.
- **Goals:** Add and remove users safely; configure settings once; import catalog and customer data without help.
- **Needs from OrderPilot:** Simple member management, CSV import with validation feedback, sensible defaults.
- **Role in product:** `admin`.

### P6. Implementation partner (you, the vendor)
- **Context:** Sets up workspaces for prospects and customers, imports their data, configures settings, runs demos.
- **Goals:** Repeatable onboarding; a convincing demo workspace that can be reset; no per-customer code forks.
- **Needs from OrderPilot:** Workspace provisioning, demo data seeding and reset, configuration over customisation.
- **Role in product:** platform operator (outside tenant roles; see TECHNICAL_ARCHITECTURE.md §7.6).

---

## 5. Product principles (non-negotiable rules)

Each rule from the brief is translated into concrete product behaviour and the layer that enforces it. These rules override convenience.

| ID | Rule | What it means in the product | Enforced by |
|---|---|---|---|
| PR-01 | **AI never approves orders** | Extraction output can only fill a draft. There is no auto-approve setting in the MVP. Only an authenticated person with approval permission can create a sales order. | Database approval function checks the caller's role; no service or background process can create a sales order. |
| PR-02 | **Employees verify extracted data** | Every AI-suggested value must be confirmed or edited by a person before the order can be submitted for approval. | Validation engine blocks submission while unconfirmed fields exist. |
| PR-03 | **Original document preserved** | The uploaded file is stored byte-for-byte, with its SHA-256 hash. Users can view and download it but never replace or delete it. | Private storage with insert-only policies; hash verified server-side. |
| PR-04 | **Audit trail for important actions** | Every state change, field edit, override, approval and inventory movement records who, when, what changed and why. Audit records cannot be edited or deleted. | Database triggers and functions write audit events; update and delete are blocked. |
| PR-05 | **Accurate inventory** | Exact decimal arithmetic; every stock change is a ledger entry; stock checks and reservations happen in one database transaction. On-hand stock can never go negative. | Postgres functions with row locks and constraints; reconciliation checks. |
| PR-06 | **No duplicate orders** | At most one sales order per intake. Duplicate PO numbers and duplicate files are blocked until a person explicitly resolves them. | Unique constraints, duplicate detection rules, idempotent approval. |
| PR-07 | **Never invent missing information** | Missing values stay empty and are flagged. The simulated extractor never fabricates values for documents it does not recognise. Any default the system applies, such as a catalog price, is labelled with its source. | Extraction contract, provenance metadata, validation rules. |
| PR-08 | **Confirmed data vs AI suggestions** | AI suggestions are visually distinct from confirmed values everywhere they appear. Raw AI output is stored separately from the working draft, and sales orders contain only confirmed data. | Provenance metadata per field; separate tables; design system provenance markers. |
| PR-09 | **Isolated multi-tenant data** | A user can only ever see and change data for workspaces they belong to. | Row-level security on every table, organisation-scoped foreign keys, per-workspace storage paths. |
| PR-10 | **Role-based permissions** | What a user can do depends on their role in that workspace. | Enforced in the database first, then in server code, then reflected in the UI. |
| PR-11 | **Ready for ERP integrations** | Stable IDs, a canonical order model, an event outbox written with every confirmed order, and a place for external system references. | Data model and outbox table. |
| PR-12 | **Protect credentials and business data** | No secrets in the browser, repository or logs. Business data is not sent to any third-party service without an explicit decision. | Environment configuration, server-only modules, logging rules, decision log. |

---

## 6. Core workflow

The ten steps from the brief map to these product stages. The detailed journeys are in [USER_FLOWS.md](USER_FLOWS.md).

| Step | Stage | Intake status | Who |
|---|---|---|---|
| 1 | Upload customer PO | `received` | Processor or above |
| 2 | Extraction | `extracting`, then `in_review` or `extraction_failed` | System |
| 3 | Review extracted information | `in_review` | Processor |
| 4 | Match products to catalog | `in_review` | System suggests, processor confirms |
| 5 | Check inventory | `in_review` (indicative), approval (authoritative) | System |
| 6 | Highlight missing data and inconsistencies | `in_review` | System |
| 7 | Resolve exceptions | `in_review` | Processor (approver for overrides) |
| 8 | Approve | `pending_approval`, then `approved` | Approver |
| 9 | Create confirmed sales order | Sales order `confirmed` | System, inside the approval transaction |
| 10 | Order appears in dashboard | n/a | All |

**Terminology (D-02).** In the product, the customer's document and its review draft are a **customer PO** (internally an *inbound order* or *intake*). The approved outcome is a **sales order**. We avoid calling internal records "purchase orders" because, inside a distributor's ERP, a purchase order means an order *to a supplier*. Mixing the two would cause confusion in integrations.

---

## 7. MVP feature requirements

Priority uses MoSCoW: **M** = must have for MVP, **S** = should have (include if the schedule allows; recommended).

### 7.1 Authentication (`FR-AUTH`)

| ID | Pri | Requirement |
|---|---|---|
| FR-AUTH-01 | M | Users sign in with email and password using Supabase Auth. |
| FR-AUTH-02 | M | Users can reset a forgotten password by email link. Responses never reveal whether an email address has an account. |
| FR-AUTH-03 | M | Invited users accept an invitation, set a password and enter their full name. Invitations expire after 7 days and are single-use. |
| FR-AUTH-04 | M | Time-based one-time password (TOTP) multi-factor authentication can be enrolled by any user and is required for Owners and Admins (D-24). |
| FR-AUTH-05 | M | Sessions use secure, HTTP-only cookies. An expired session redirects to sign-in and returns the user to the page they were on. Unsaved review edits are preserved by autosave. |
| FR-AUTH-06 | M | There is no public self-service sign-up in the MVP. Workspaces are provisioned by the platform operator (D-03). |
| FR-AUTH-07 | M | Suspended or removed members lose access on their next request, even if their session is still valid. |
| FR-AUTH-08 | M | A **Profile and security** page lets every user change their full name and password, enrol or re-enrol TOTP MFA, and see when they last signed in. |
| FR-AUTH-09 | M | **MFA recovery.** Supabase TOTP has no recovery codes. A user who loses their authenticator asks a workspace Owner; the platform operator verifies the request out of band and removes the factor with a documented, audited operator procedure. Owners and Admins must re-enrol before their next privileged action. |

### 7.2 Organisation workspace (`FR-ORG`)

| ID | Pri | Requirement |
|---|---|---|
| FR-ORG-01 | M | A workspace (organisation) has a name, URL slug, country, base currency (USD, GBP, CAD or EUR in MVP), timezone, and date display preference. The Owner may change the base currency until the workspace's first customer PO exists; after that it is locked (C-04). |
| FR-ORG-02 | M | Workspace settings: sales order number prefix; require independent approval (D-05; only the Owner may turn it off, and the change is audited); price tolerance (D-14); AI confidence threshold (D-06); duplicate look-back window in days. |
| FR-ORG-03 | M | Owners and Admins invite members by email with a role, resend or revoke invitations, change roles, suspend and remove members. |
| FR-ORG-04 | M | A workspace must always have at least one active Owner. Only an Owner can grant or remove the Owner role. |
| FR-ORG-05 | M | A user who belongs to several workspaces can switch between them. The active workspace is part of the URL so links are unambiguous. |
| FR-ORG-06 | M | A workspace can be flagged as a demo workspace. Demo workspaces show a persistent "Demo data" banner. |
| FR-ORG-07 | M | On creation, a workspace gets a default stock location and default settings. |

### 7.3 Dashboard (`FR-DASH`)

The full information architecture is in [DESIGN_SYSTEM.md §12](DESIGN_SYSTEM.md).

| ID | Pri | Requirement |
|---|---|---|
| FR-DASH-01 | M | The dashboard is role-aware and leads with work that needs the current user's action: intakes to review, intakes awaiting approval, extraction failures. |
| FR-DASH-02 | M | Pipeline counts by intake status, with the age of the oldest item in each status. Each count links to the filtered list. |
| FR-DASH-03 | M | Inventory alerts: products at or below reorder point, out of stock, or over-committed (reserved greater than on hand). Open backorders: sales order lines with backordered quantity (M-02). |
| FR-DASH-04 | M | Recent sales orders and recent activity from the audit trail. |
| FR-DASH-05 | M | Throughput metrics (orders approved this week, median time from upload to approval) are computed from real timestamps. When there is not enough data, the tile says so. **No placeholder or sample numbers are ever shown as real data.** |
| FR-DASH-06 | M | Counts refresh when the user returns to the tab and at least every 60 seconds. |

### 7.4 Customer management (`FR-CUST`)

| ID | Pri | Requirement |
|---|---|---|
| FR-CUST-01 | M | List customers with search (name, account number) and filter by status; server-side pagination. |
| FR-CUST-02 | M | Create and edit customers: name, account number (unique per workspace), status, contact email and phone, payment terms (text), notes. |
| FR-CUST-03 | M | Multiple addresses per customer, typed as billing or shipping, with one default of each type. Countries use ISO 3166-1 alpha-2 codes. |
| FR-CUST-04 | M | Status: `active`, `on_hold` (with a required hold reason), `inactive`. Only Approvers and above can place or release a hold. |
| FR-CUST-05 | M | Customer item aliases tab: the customer's part numbers mapped to our products, with who created each mapping and from which order. |
| FR-CUST-06 | M | Order history tab: the customer's intakes and sales orders. |
| FR-CUST-07 | M | Customers are never hard-deleted once referenced by an order; they are made inactive. |
| FR-CUST-08 | M | Creating a customer whose name closely matches an existing one shows a "possible duplicate customer" warning. |
| FR-CUST-09 | S | CSV import of customers and addresses with a validation preview before anything is written. |

### 7.5 Product catalog (`FR-PROD`)

| ID | Pri | Requirement |
|---|---|---|
| FR-PROD-01 | M | List products with search across SKU, name, GTIN and customer aliases; filter by status. |
| FR-PROD-02 | M | Create and edit products: SKU (unique per workspace), name, description, selling unit of measure, allowed quantity decimals (0 for whole units), list price, GTIN (optional, check digit validated), status (`active`, `discontinued`), track inventory flag, reorder point. |
| FR-PROD-03 | M | Products referenced by any order cannot be hard-deleted; they are discontinued. |
| FR-PROD-07 | M | The list price is set when a product is created (by any role that can create products). Later list price changes are made only by Owners and Admins through a dedicated, audited action (M-08, C-03). |
| FR-PROD-08 | M | **Track inventory flag (M-01).** Turning tracking on creates the product's stock balance at the default location. Turning it off is refused while the product has open reservations. Untracked products are never reserved, backordered or issued. |
| FR-PROD-04 | M | List price changes are audited with old and new values. |
| FR-PROD-05 | S | Customer-specific prices (customer, product, price, valid from, valid to). Used as the expected price during validation when present (D-32). |
| FR-PROD-06 | S | CSV import of products with validation preview (D-31). |

### 7.6 Inventory management (`FR-INV`)

| ID | Pri | Requirement |
|---|---|---|
| FR-INV-01 | M | Stock list showing on hand, reserved, available (on hand minus reserved) and reorder point for each tracked product, with status: in stock, low, out of stock, over-committed. |
| FR-INV-02 | M | Receive stock: quantity, reference (for example the supplier delivery note), optional note. |
| FR-INV-03 | M | Adjust stock up or down with a mandatory reason code: opening balance, cycle count, damaged, lost, found, correction; plus an optional note. |
| FR-INV-04 | M | Movement history per product: every receipt, adjustment, reservation, release and fulfilment, with resulting balances, actor, time and reference. |
| FR-INV-05 | M | On-hand stock can never become negative. An adjustment that leaves on hand below reserved is allowed (reality wins) but the product is flagged as over-committed. |
| FR-INV-06 | M | All stock changes are transactional and attributed. Users cannot edit balances directly; balances only change through movements. |
| FR-INV-07 | M | Inventory uses a single default location in MVP. The data model supports multiple locations (D-11). |
| FR-INV-09 | M | Every stock quantity (receipt, adjustment, reservation, issue) respects the product's allowed decimals. Untracked products appear in the catalog but not in the stock list (M-01). |
| FR-INV-08 | S | CSV import of opening balances (recorded as `opening_balance` adjustments). |

### 7.7 Customer PO upload (`FR-UPL`)

| ID | Pri | Requirement |
|---|---|---|
| FR-UPL-01 | M | Processors and above upload by drag-and-drop or file picker; up to 10 files at once; each file becomes one intake. |
| FR-UPL-02 | M | Accepted: PDF, PNG, JPEG, up to 20 MB and 50 pages (D-08). File type is verified from file content, not the extension. |
| FR-UPL-03 | M | The user may optionally pre-select the customer. This becomes a hint for matching and is still shown for confirmation. |
| FR-UPL-04 | M | Files upload directly to private storage with a progress indicator. A failed or abandoned upload leaves no visible intake. |
| FR-UPL-05 | M | The server computes the SHA-256 hash of the stored file. If the same content already belongs to an active intake or sales order in this workspace, the new intake gets a `DUPLICATE_DOCUMENT` exception. Upload itself is not blocked. |
| FR-UPL-06 | M | The original file is immutable: it can be viewed and downloaded through short-lived links by workspace members, never replaced or deleted by users (PR-03). |

### 7.8 Simulated AI extraction (`FR-EXT`)

| ID | Pri | Requirement |
|---|---|---|
| FR-EXT-01 | M | Extraction starts automatically after upload and runs asynchronously. The user sees status (`extracting`, `in_review`, `extraction_failed`) update without reloading. |
| FR-EXT-02 | M | Extraction runs through a provider interface so that a real AI provider can replace the simulated one without changing the review workflow (D-07). |
| FR-EXT-03 | M | The simulated provider returns deterministic results for a curated set of demo documents, recognised by file hash, **only in demo workspaces (`is_demo`) and in local and test environments**. In every other workspace it returns "not recognised" and the intake opens in manual entry (M-06). Results include per-field confidence and source page, and deliberately include realistic problems (low confidence values, unknown customer part numbers, unit mismatches, missing ship-to). One fixture fails on its first attempt and succeeds on retry, to demonstrate recovery (C-10). |
| FR-EXT-04 | M | For any document the simulator does not recognise, it returns **no values** and the intake opens in manual-entry mode with a clear message. It never fabricates data (PR-07). |
| FR-EXT-05 | M | Raw extraction output is stored immutably per extraction run, separately from the working draft. |
| FR-EXT-06 | M | Every value that came from extraction carries provenance: source, confidence, extraction run, original value, and confirmation state. |
| FR-EXT-07 | M | A failed extraction can be retried, or the user can switch to manual entry. |
| FR-EXT-08 | M | While the extractor is simulated, the UI labels it "Simulated extraction (demo)" so prospects are never misled about AI capability. |
| FR-EXT-09 | M | **Reliable processing (M-04, M-05).** The Postgres job queue is the source of truth for extraction work; request-time triggers only start work early. Each job is claimed under a time-limited lease; only the current lease holder can record a result, and only for the intake's latest run. Transient failures (timeout, provider error) retry automatically with backoff, up to 3 attempts; permanent failures (password-protected or invalid file, output that breaks the contract) fail immediately. A scheduled recovery job finds expired leases every minute. Processing the same job twice never produces two drafts. |

### 7.9 Order review and validation (`FR-REV`)

| ID | Pri | Requirement |
|---|---|---|
| FR-REV-01 | M | The review screen shows the original document next to the structured draft. On narrow screens the two are tabs. |
| FR-REV-02 | M | Header fields: customer, customer PO number, PO date, requested delivery date, bill-to, ship-to, payment terms (as printed), currency, document total (if printed), tax amount (if printed, reference only), notes or special instructions. If no bill-to is printed, the customer's default billing address is applied; if no currency is printed, the workspace currency is applied. Both are labelled as system defaults, never as document values (M-10). |
| FR-REV-03 | M | Line fields: line number, customer part number, description as printed, matched product, quantity, unit as printed, unit price, line total, and indicative availability. |
| FR-REV-04 | M | Customer matching suggests candidates with the reason (account number found on document, name similarity, address match). The user must confirm the customer. |
| FR-REV-05 | M | Product matching per line, in this order: customer item alias, exact SKU, GTIN, description similarity. Each suggestion shows the method and a score. The user confirms or searches manually. |
| FR-REV-06 | M | When a person confirms a product match that came from anything other than an existing alias, the system offers "Remember for this customer". Remembered mappings are saved as aliases when the order is approved (D-18). |
| FR-REV-07 | M | The validation engine re-runs on every saved change and lists exceptions in a panel grouped by severity. Selecting an exception focuses the related field. |
| FR-REV-08 | M | Users confirm fields individually, confirm a whole line, or bulk-confirm lines where every field is above the confidence threshold. Fields below the threshold must be confirmed individually (D-06). |
| FR-REV-09 | M | Users can add and remove lines. Manually added values are marked as user-entered. |
| FR-REV-10 | M | Drafts autosave. If someone else changed the intake since it was loaded, the user is told who changed it and asked to reload; nothing is silently overwritten. |
| FR-REV-11 | M | "Assign to me" claims an intake. Others see who is working on it but are not locked out. |
| FR-REV-12 | M | Submit for approval requires zero unconfirmed AI fields and zero open blocking exceptions that **cannot** be overridden. Open blocking exceptions that an approver may override (see §9) do not prevent submission; they travel to the approver marked **Override required** (C-01, D-34). The submitter can add a note for the approver. |
| FR-REV-13 | M | An intake can be cancelled with a reason (duplicate, not a purchase order, sent in error, other). Cancelled intakes and their documents remain viewable. |
| FR-REV-14 | M | Roles without review permission (Viewer, Inventory Manager) see the review screen read-only, with no edit or confirm controls (M-08). |

### 7.10 Approval workflow (`FR-APR`)

| ID | Pri | Requirement |
|---|---|---|
| FR-APR-01 | M | Approvers see an approval queue sorted by waiting time, filterable by customer and submitter. |
| FR-APR-02 | M | The approval summary shows: customer and status, ship-to, totals, lines with availability, exceptions marked **Override required**, every exception and how it was resolved or overridden (with reason), a list of values changed from the AI suggestion, the reviewer's note, and the original document. **Approve stays disabled until every Override required item has been overridden with a reason or the intake is returned** (C-01). |
| FR-APR-03 | M | Actions: **Approve**; **Request changes** (reason required, returns to `in_review`); **Reject** (reason required, terminal). |
| FR-APR-04 | M | When independent approval is enabled, the person who submitted an intake cannot approve it. |
| FR-APR-05 | M | Approvers can override overridable blocking exceptions (see §9) with a mandatory reason, during review or approval. |
| FR-APR-06 | M | Approval re-validates inside one database transaction: customer status, duplicates, product status, and stock. If stock is now insufficient, the approver chooses per line: reserve what is available and backorder the rest, or return the intake for changes (D-10). When available stock is zero or negative (over-committed), nothing is allocated and the whole line quantity is backordered (M-03). Lines for untracked products are allocated in full without stock movements (M-01). |
| FR-APR-07 | M | Approval is atomic and idempotent: the sales order, its lines, stock reservations, aliases, audit events and integration event are all created, or none are. Double-clicks and two approvers acting at once produce exactly one sales order. |
| FR-APR-08 | M | After approval the user sees the new sales order number and a link to it. |

### 7.11 Sales order management (`FR-SO`)

| ID | Pri | Requirement |
|---|---|---|
| FR-SO-01 | M | List sales orders with search (sales order number, customer PO number, customer) and filters (status, date range). |
| FR-SO-02 | M | Detail view: header, address snapshots, lines with reserved and backordered quantities, price source per line, approval details, link to the intake and original document, and a timeline. |
| FR-SO-03 | M | Confirmed sales orders are immutable apart from status changes (D-19). |
| FR-SO-04 | M | Cancel (Approver and above, reason required): releases all reservations. Not allowed once fulfilled. |
| FR-SO-05 | M | Mark fulfilled (Approver, Inventory Manager and above): issues the reserved quantities from stock, reducing on hand and reserved. Backordered quantities are recorded as not fulfilled by OrderPilot (D-20): the order shows, for example, "Fulfilled · 20 EA backordered (not fulfilled through OrderPilot)", and the integration event carries the backordered quantities. Fulfilling backorders inside OrderPilot is out of MVP scope (approved D-35, M-02). |
| FR-SO-06 | M | Sales order numbers are unique per workspace, in the format `{prefix}-{year}-{sequence}`, for example `SO-2026-000123` (D-21). |
| FR-SO-07 | S | Export a sales order as CSV and a printable view, for manual entry into an ERP until integrations exist. |
| FR-SO-08 | M | **Mark backorder handled externally** (Phase 5, D-35): for a backordered line, an authorised user records that the backorder was handled outside OrderPilot. A reason is required; actor and timestamp are recorded; an audit event is written. It **never changes inventory**, leaves `backordered_qty` unchanged, and the UI never presents it as fulfilment by OrderPilot (\"Handled externally\", not \"Fulfilled\"). Handled backorders leave the open-backorder list. |

### 7.12 Audit history (`FR-AUD`)

| ID | Pri | Requirement |
|---|---|---|
| FR-AUD-01 | M | Audited actions include: membership and role changes, invitation events, workspace settings changes; customer, address, alias, product and price changes; every inventory movement; intake creation, extraction runs, field edits (old value, new value, and the original AI value), confirmations, exception resolutions and overrides, assignment, submission, approval decisions, cancellation; sales order creation, cancellation and fulfilment. |
| FR-AUD-02 | M | Each record holds: workspace, time (UTC), actor (user or system), action, entity, changed fields, reason where applicable, and a request ID. |
| FR-AUD-03 | M | Entity timelines on intakes, sales orders, customers and products. |
| FR-AUD-04 | M | A workspace-wide audit log with filters (actor, action, entity type, date range) for Owners, Admins and Approvers. |
| FR-AUD-05 | M | Audit records cannot be edited or deleted by anyone through the application or the database API. |
| FR-AUD-06 | S | CSV export of the filtered audit log (Owners and Admins). |
| FR-AUD-07 | S | Original document downloads are recorded as access events. |

### 7.13 Development preview (`FR-PREV`, Phase 1, approved P1-7)

A development-only, interactive preview shows how OrderPilot will work before the backend exists.

| ID | Pri | Requirement |
|---|---|---|
| FR-PREV-01 | M | The preview uses one fictional workspace, **Northstar Distribution**, with fictional demonstration fixtures. Every fixture is labelled fictional in code and on screen. |
| FR-PREV-02 | M | A persistent banner reads **"Development Preview — Fictional Data"** on every preview page. |
| FR-PREV-03 | M | Interactive controls use local component state only. They never save, approve, upload or modify records, and say so when used. |
| FR-PREV-04 | M | Unbuilt features state which future phase delivers them. |
| FR-PREV-05 | M | No authentication, no Supabase connection, no credentials and no network requests for business data. |
| FR-PREV-06 | M | Preview routes return not found in production builds regardless of environment flags, verified by automated tests. |
| FR-PREV-07 | M | Any preview role switcher is a visual demonstration only, never an authorisation mechanism. |

The preview is the only place where sample numbers may appear, and only because they are labelled fictional (FR-DASH-05 still applies to the real product).

---

## 8. Roles and permissions

Fixed roles, one role per user per workspace (D-04). A user can hold different roles in different workspaces. Enforcement is described in [TECHNICAL_ARCHITECTURE.md §7](TECHNICAL_ARCHITECTURE.md) and [DATABASE_ARCHITECTURE.md §7](DATABASE_ARCHITECTURE.md).

| Capability | Owner | Admin | Approver | Processor | Inventory Mgr | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View intakes, sales orders, customers, products, stock | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View entity timelines | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Upload customer POs | ✓ | ✓ | ✓ | ✓ | | |
| Review, edit, confirm fields, resolve exceptions | ✓ | ✓ | ✓ | ✓ | | |
| Submit for approval | ✓ | ✓ | ✓ | ✓ | | |
| Withdraw a submitted intake | ✓ | ✓ | ✓ | Own submissions | | |
| Cancel an intake (with reason) | ✓ | ✓ | ✓ | ✓ | | |
| Approve, reject, request changes | ✓ | ✓ | ✓ | | | |
| Override blocking exceptions | ✓ | ✓ | ✓ | | | |
| Cancel a sales order | ✓ | ✓ | ✓ | | | |
| Mark a sales order fulfilled | ✓ | ✓ | ✓ | | ✓ | |
| Create and edit customers, addresses | ✓ | ✓ | ✓ | ✓ | | |
| Place or release customer hold | ✓ | ✓ | ✓ | | | |
| Deactivate or reactivate a customer | ✓ | ✓ | | | | |
| Manage customer item aliases | ✓ | ✓ | ✓ | ✓ | | |
| Create and edit products (including the initial list price) | ✓ | ✓ | | | ✓ | |
| Change list prices after creation, and customer prices | ✓ | ✓ | | | | |
| Receive and adjust stock | ✓ | ✓ | | | ✓ | |
| CSV imports | ✓ | ✓ | | | | |
| View workspace audit log | ✓ | ✓ | ✓ | | | |
| Export audit log | ✓ | ✓ | | | | |
| Invite members, change roles (except Owner) | ✓ | ✓ | | | | |
| Grant or remove Owner role | ✓ | | | | | |
| Change workspace settings | ✓ | ✓ | | | | |
| Turn off independent approval (D-05) | ✓ | | | | | |
| Mark a backorder handled externally (FR-SO-08) | ✓ | ✓ | ✓ | | ✓ | |

**Separation of duties.** With independent approval enabled (default, D-05), the submitter of an intake cannot approve it, regardless of role.

**Read-only access.** Roles without a ✓ for an action see the related screens read-only (FR-REV-14).

**How role rules are enforced.** Every signed-in user reaches Postgres as the same database role, so per-role rules on individual columns (prices, customer status, workspace settings) are enforced by database functions that check the caller's workspace role, not by column privileges (C-03).

---

## 9. Validation and exception catalog

The validation engine produces exceptions. **Blocking** exceptions that cannot be overridden prevent submission. **Blocking** exceptions that an approver may override do not prevent submission, but they prevent approval until an approver overrides each one with a reason (C-01, D-34). **Warnings** do not block, but they are shown on the approval summary. Every resolution and override is audited.

An override applies only to the exact condition it was made for. For duplicates, the override records which intakes and sales orders it covers; if a new conflicting order appears later, the exception re-opens (M-07).

If the data behind a resolved exception changes, the exception re-opens. For example, an acknowledged price decision re-opens when the price is edited.

| Code | Scope | Severity | Raised when | Resolution | Override |
|---|---|---|---|---|---|
| `UNCONFIRMED_FIELDS` | Header, line | Blocking | Any AI-suggested value is neither confirmed nor edited by a person. | Confirm or edit. | Not allowed |
| `CUSTOMER_UNMATCHED` | Header | Blocking | No customer selected. | Select an existing customer or create one. | Not allowed |
| `CUSTOMER_ON_HOLD` | Header | Blocking | Customer is on hold. | Approver releases the hold, or overrides for this order. | Approver+, reason |
| `CUSTOMER_INACTIVE` | Header | Blocking | Customer is inactive. | Admin reactivates the customer, or cancel the intake. | Not allowed |
| `PO_NUMBER_MISSING` | Header | Blocking | No PO number. | Enter it from the document if present. If the customer did not provide one, an approver overrides. | Approver+, reason |
| `DUPLICATE_PO_NUMBER` | Header | Blocking | Same customer and normalised PO number exists on another active intake or non-cancelled sales order. | Cancel as duplicate, or override if the customer legitimately reuses numbers. | Approver+, reason |
| `DUPLICATE_DOCUMENT` | Header | Blocking | Identical file content already belongs to an active intake or sales order. | Cancel as duplicate, or override. | Approver+, reason |
| `POSSIBLE_DUPLICATE` | Header | Warning | Same customer, same products and quantities, within the look-back window, different PO number. | Review and acknowledge. | n/a |
| `SHIP_TO_MISSING` | Header | Blocking | No ship-to address. | Select a saved address, or enter the address exactly as printed. Never guessed. | Not allowed |
| `SHIP_TO_NOT_ON_FILE` | Header | Warning | Ship-to does not match a saved address. | Acknowledge, or save as a new customer address. | n/a |
| `CURRENCY_MISMATCH` | Header | Blocking | Document currency differs from the workspace currency. | Contact the customer; cancel the intake. | Not allowed in MVP (D-12) |
| `DATE_AMBIGUOUS` | Header | Blocking | A date could be read as day-month or month-day. | Reviewer confirms the intended date. | Not allowed |
| `REQUESTED_DATE_PAST` | Header | Warning | Requested delivery date is before today. | Acknowledge. | n/a |
| `TOTAL_MISMATCH` | Header | Warning | Sum of line totals differs from the printed document total beyond rounding. | Check lines; acknowledge. | n/a |
| `PRODUCT_UNMATCHED` | Line | Blocking | No product selected. | Select a product; optionally remember the mapping. | Not allowed |
| `PRODUCT_DISCONTINUED` | Line | Blocking | Matched product is discontinued. | Select a substitute (note required) or remove the line. | Not allowed |
| `QUANTITY_INVALID` | Line | Blocking | Quantity missing, zero, negative, or has more decimals than the product allows. | Correct from the document. | Not allowed |
| `UOM_MISMATCH` | Line | Blocking | Unit on the PO differs from the product's selling unit. | Reviewer converts the quantity to the selling unit and records the conversion. | Not allowed |
| `PRICE_MISMATCH` | Line | Blocking | PO price differs from the expected price (customer price, else list price) beyond tolerance, compared at the stored 4-decimal precision (C-05). | Reviewer chooses the PO price or the expected price; the choice is shown to the approver. | n/a (resolved by decision) |
| `PRICE_MISSING` | Line | Warning | No price on the PO. | Expected price is applied and labelled with its source (D-15). | n/a |
| `DUPLICATE_LINE` | Line | Warning | The same product appears on more than one line. | Merge or acknowledge. | n/a |
| `INSUFFICIENT_STOCK` | Line | Warning in review; decision required at approval | Quantity exceeds available stock. | At approval: reserve available and backorder the remainder, or request changes. | Approver decides |

---

## 10. Non-functional requirements

| Area | Requirement |
|---|---|
| **Security** | Target OWASP ASVS Level 2 for the application. Tenant isolation verified by automated tests on every table. No secrets in client code, repository or logs. TLS everywhere; encryption at rest provided by the hosting providers. |
| **Performance (internal targets, measured on a seeded reference dataset)** | List pages: server response under 1 s at p95 with 50,000 intakes in a workspace. Review screen interactive within 2 s for a 100-line PO. Approval transaction under 2 s for a 200-line PO. These are engineering targets, not customer-facing claims. |
| **Scale assumptions** | See A-02 and A-03. Must not degrade sharply up to 500 lines per PO and 50,000 products. |
| **Availability** | No SLA is offered in MVP. Availability depends on Vercel and Supabase plans (D-26). Backup and recovery targets (RPO and RTO) need a decision before any paying customer. |
| **Accessibility** | WCAG 2.2 Level AA. Full keyboard operation of the review screen. |
| **Browsers** | Latest two major versions of Chrome, Edge, Firefox and Safari. |
| **Responsive design** | Dashboard, lists, approval queue and approval summary work from 360 px wide. The review screen is optimised for 1280 px and above and remains usable at 1024 px with a stacked layout. |
| **Data correctness** | Money and quantities use exact decimal types end to end. All timestamps stored in UTC and displayed in the workspace timezone. |
| **Auditability** | Every state-changing action is attributable to a user or a named system process. |
| **Internationalisation** | English UI. Number, currency and date formatting follow the workspace's locale. Dates are displayed in an unambiguous format. |
| **Observability** | Errors are captured with a request ID that the user can quote to support. No business document content in logs. |
| **Maintainability** | TypeScript strict mode, typed database access, documented module boundaries, automated tests as described in TESTING_STRATEGY.md. |
| **Legal (before any pilot, M-11)** | Terms of service, privacy policy and a data processing agreement template, reviewed by a lawyer. These are documents, not code, and are not part of the MVP build. |

---

## 11. Out of scope for MVP

- Real AI or OCR extraction (the provider interface is built; the provider is simulated).
- Email inbox ingestion, EDI (X12 850, EDIFACT ORDERS), customer self-service portal, public API.
- ERP or accounting integrations (the outbox and data model are prepared).
- Tax calculation, invoicing, payments, credit limit checks.
- Picking, packing, shipping, partial shipments, returns.
- Multiple stock locations in the UI, lot or expiry tracking.
- Unit-of-measure conversion tables.
- PO revisions and change orders, sales order amendments.
- Multi-level or value-based approval rules.
- Custom roles, SSO (SAML), SCIM provisioning.
- Multi-currency and FX conversion.
- Billing and subscriptions.
- Dark mode, languages other than English, native mobile apps.

---

## 12. Future features

Grouped by theme, roughly in recommended order. Each needs its own approval.

**Intake channels**
- Real AI extraction with an evaluation harness and per-customer accuracy tracking.
- Dedicated inbound email address per workspace that creates intakes from attachments.
- CSV and Excel PO uploads with column mapping.
- EDI (X12 850 and 855, EDIFACT ORDERS and ORDRSP) through a partner.
- Customer portal for direct order entry.

**Integrations**
- ERP and accounting connectors (candidates: QuickBooks Online, Xero, NetSuite, Dynamics 365 Business Central, Sage, SAP Business One, Odoo, Acumatica).
- Outbound webhooks and a versioned REST API with per-workspace API keys.
- Order acknowledgements sent back to customers.

**Order management**
- PO revisions and change orders linked to the original.
- Value-based and multi-level approvals; approval delegation.
- Credit limits pulled from the ERP.
- Partial fulfilment and shipment tracking.
- Assignment rules and service-level timers.

**Catalog and inventory**
- Unit-of-measure conversions (case, inner pack, each).
- Contract and tiered pricing; substitutes.
- Multiple locations; available-to-promise including incoming supplier deliveries.
- Lot and expiry tracking for food and health verticals.

**Platform**
- SSO (SAML, Microsoft Entra ID, Google Workspace), SCIM, custom roles.
- Dark mode; French (Canada), German, French, Spanish and Dutch UI.
- Push notifications for approvers.
- Billing and usage metering.
- Audit export to customer security tools.

**Insight**
- Extraction accuracy by field and by customer.
- Exception trends; customer ordering patterns.

---

## 13. Success metrics

These metrics are instrumented from day one. **No targets are set until a pilot establishes a baseline**, to avoid inventing numbers.

| Metric | Definition | Why it matters |
|---|---|---|
| Time to submit | Median time from upload to submission for approval | Core efficiency gain |
| Time to approve | Median time from submission to approval | Approval bottlenecks |
| Correction rate | Share of AI-suggested fields edited by reviewers, by field and customer | Extraction quality (once real AI exists) |
| Exceptions per intake | Average count, by code | Data quality and product focus |
| Duplicates caught | Count of intakes cancelled as duplicate or overridden | Direct cost avoided |
| Manual match rate | Share of lines matched manually versus by alias or SKU | Value of alias learning over time |
| Extraction failure rate | Failed runs divided by runs | Reliability |
| Weekly active reviewers | Distinct users who submitted at least one intake | Adoption |

---

## 14. Assumptions requiring review

| ID | Assumption | Effect if wrong |
|---|---|---|
| A-01 | Customers have roughly 5 to 250 employees and 1 to 30 OrderPilot users per workspace. | Larger customers need SSO, custom roles and approval rules earlier. |
| A-02 | Up to around 1,000 customer POs per workspace per month; up to 500 lines per PO. | Higher volumes need queue-based processing and pagination on the review screen. |
| A-03 | Up to 50,000 products and 10,000 customers per workspace. | Larger catalogs need dedicated search infrastructure. |
| A-04 | POs arrive mainly as PDF attachments, both digital and scanned. | If Excel or EDI dominates, intake priorities change. |
| A-05 | POs are in English using Latin script. | Multilingual extraction and UI required sooner. |
| A-06 | Review happens on desktop; approvals and dashboards may happen on phones or tablets. | Review screen would need a mobile design. |
| A-07 | Customers keep an ERP or accounting system as the system of record for invoicing and shipping. | If not, OrderPilot would need invoicing and fulfilment, which is a much larger product. |
| A-08 | Each business sells in one base currency. | Multi-currency becomes MVP scope. |
| A-09 | Most users belong to one workspace; implementers may belong to several. | No change; the model supports both. |
| A-10 | The sender of a PO is a known customer, but document content is untrusted input. | Security model assumes untrusted content regardless. |
| A-11 | One customer PO document produces one sales order. | Split shipments or split orders would need a different model. |
| A-12 | Small teams can staff a separate approver; very small teams can switch independent approval off. | Default for D-05 may need to change. |

---

## 15. Decisions requiring approval

Each decision has a recommendation. Decisions marked ★ are the most important to settle before implementation starts.

**Status.** Only the decisions in §15.1 are approved. **Every decision in §15.2 is unresolved**: the recommendation is a proposal, not an approval. All ★ decisions, and those marked "Phase 2", must be settled before Phase 2 begins.

### 15.1 Approved decisions

| ID | Decision | Approved outcome |
|---|---|---|
| P1-1 | Development phases | Revised phase plan with Phases 4A and 4B ([DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)) |
| P1-2 | Typeface | Geist Sans and Geist Mono |
| P1-3 | Logo | Simple geometric placeholder mark; final design later |
| P1-4 | AI suggestion colour | Violet, used exclusively for unconfirmed AI suggestions |
| P1-5 | Version control | Local Git repository and local commits only; no remote, no push |
| P1-6 | Package versions | Stable, mutually compatible versions verified before installing; exact versions pinned; no beta or canary releases |
| P1-7 | Development preview | Interactive, development-only preview with the fictional workspace "Northstar Distribution" (§7.13) |
| C-01 to C-10, M-01 to M-11, S-02 to S-04 | Review corrections | Applied in v0.2 of the planning documents. S-01 not adopted: `after()` may start work early, but the database queue remains the source of truth |
| D-01 | Commercial and deployment model | **Approved (Phase 2A review):** Shared multi-tenant SaaS. Dedicated customer instances may be considered later, from the same codebase. |
| D-02 | Terminology | **Approved (Phase 2A review):** "Customer PO" for inbound orders and "Sales order" for approved orders; database tables `inbound_orders` and `sales_orders`. |
| D-04 | Roles | **Approved (Phase 2A review):** Six fixed workspace roles, one role per user per workspace. |
| D-05 | Independent approval | **Approved (Phase 2A review):** Enabled by default. **Only the Owner** may disable it, and the change writes an audit record. |
| D-06 | Verification rules | **Approved (Phase 2A review):** Every AI-suggested value requires human confirmation. Low-confidence values require individual confirmation. High-confidence lines may be confirmed in bulk (audited). |
| D-09 | Inventory model | **Approved (Phase 2A review):** Reserve stock when an order is approved; deduct stock when the allocated quantity is fulfilled. On hand never goes negative. |
| D-10 | Insufficient stock at approval | **Approved (Phase 2A review):** Partial reservation with the remainder backordered, or request changes, chosen per line. |
| D-11 | Locations | **Approved (Phase 2A review):** Multiple stock locations in the database; one default location in the initial interface. |
| D-12 | Currency | **Approved (Phase 2A review):** One base currency per workspace (USD, GBP, CAD or EUR). |
| D-14 | Pricing authority | **Approved (Phase 2A review):** Customer-specific price takes priority over list price. Price differences require human review. |
| D-16 | Duplicate policy | **Approved (Phase 2A review):** Duplicate purchase orders require an Approver override with a reason, under the duplicate safety requirements in DATABASE_ARCHITECTURE.md §12.1. |
| D-21 | Sales order numbering | **Approved (Phase 2A review):** Sequential numbering per workspace with no gaps for committed sales orders. |
| D-34 | Submitting intakes that need an override | **Approved (Phase 2A review):** Processors may submit orders containing exceptions that require an Approver override. Approval stays blocked until the Approver resolves every required override with a written reason. |
| D-35 | Backorders | **Approved (Phase 2A review):** Allocated and backordered quantities are recorded separately. No backorder fulfilment in the MVP. A future **"Mark backorder handled externally"** action (FR-SO-08) requires a reason, records actor and timestamp, writes an audit event, never changes inventory and never implies that OrderPilot fulfilled the backorder. |
| Q-1 to Q-5 | Database open questions | Approved; recorded in DATABASE_ARCHITECTURE.md §18 |
| Phase 2 plan | Milestones | 2A local Supabase and schema; 2B RLS, permissions and audit foundation; 2C authentication, MFA, invitations and workspaces; 2D business transactions, extraction jobs, integrity and concurrency tests. Each milestone approved separately |

### 15.2 Unresolved decisions

| ID | Decision | Recommendation | Alternatives |
|---|---|---|---|
| ★ D-03 | **Account provisioning** | Invite-only. The platform operator creates workspaces and invites the first Owner. A seeded, resettable demo workspace is used for sales demos. Self-service sign-up later. | Public self-service sign-up from day one (needs abuse protection, billing, onboarding). |
| ★ D-07 | **Extraction in MVP** | Deterministic simulated provider for a curated demo set; unknown documents go to manual entry with no fabricated values; UI labelled "Simulated". Choose the real provider after an evaluation on real anonymised POs. Candidates include Anthropic's Claude models (native PDF and image input), Azure AI Document Intelligence, AWS Textract and Google Document AI. | Integrate a real provider in MVP (cost, data processing agreement and evaluation needed first). |
| D-08 | **File types and limits** | PDF, PNG and JPEG; 20 MB; 50 pages. TIFF, CSV, Excel and email files later. | Broader types now. |
| D-13 | **Tax** | No tax calculation. Printed tax amounts are captured for reference only. The ERP remains responsible for tax. | Basic VAT or sales tax calculation (jurisdiction complexity, high error risk). |
| D-15 | **Missing price on PO** | Apply the expected price, label it with its source, raise a warning. This is a company business rule, not invented PO data. | Treat as blocking. |
| D-17 | **Units of measure** | One selling unit per product in MVP. A unit mismatch is blocking; the reviewer converts and records the conversion. Conversion tables in a later phase. | Build unit conversions into MVP (more scope, but a frequent real-world problem). |
| D-18 | **Learning customer item aliases** | Mappings the reviewer marks "Remember" are saved as aliases at approval, attributed and audited, and editable afterwards. | Save immediately on confirmation (risk of saving mappings from orders that are later rejected). |
| D-19 | **Sales order changes** | Confirmed sales orders are immutable. To change one: cancel (releases stock) and process again. Amendments later. | Allow line edits after approval (requires re-approval rules). |
| D-20 | **Fulfilment scope** | Only whole-order "Mark fulfilled" in MVP, so inventory stays correct. No picking, shipping or partial shipments. | No fulfilment at all (stock would never be consumed); or partial shipments (more scope). |
| ★ D-22 | **Document retention** | Originals are kept for the life of the workspace and never deleted by users. Define a retention period per region with legal advice (tax record rules typically require several years). | Fixed period for all regions. |
| ★ D-23 | **Hosting region and data residency** | Start with one EU region (for example Frankfurt or London) for the shared environment, which satisfies the strictest of the four markets. Offer US or Canadian hosting through dedicated instances (D-01) when a customer requires it. Requires a data processing agreement with each provider. | US region first; or multiple shared regions from the start. |
| ★ D-24 | **Authentication strength** | Email and password plus TOTP MFA, required for Owners and Admins and optional for others. Google and Microsoft sign-in later; SAML SSO for enterprise later. | MFA optional for everyone; or magic links only. |
| ★ D-25 | **Transactional email** | Supabase's built-in email is rate-limited and meant for testing only. A custom SMTP provider is required before inviting any external user. Choosing it is a purchase decision. | n/a |
| ★ D-26 | **Hosting plans** | Free tiers only for private development. Vercel's Hobby plan is restricted to non-commercial use, and Supabase's free plan pauses inactive projects and has no point-in-time recovery. Paid plans are needed before prospect demos or pilots. | n/a; needs your purchase approval when the time comes. |
| D-27 | **Audit records and data protection** | Audit records are immutable and reference users by ID. On a personal-data erasure request the user's profile is pseudonymised while audit facts remain. Needs legal review for GDPR, UK GDPR and PIPEDA. | Delete audit records containing the user (breaks accountability). |
| D-28 | **Dark mode** | Not in MVP. Design tokens are prepared so it can be added later. | Include in MVP. |
| D-29 | **Languages** | English UI in MVP; locale-aware formatting. French (Canada) assessed before selling in Quebec. | Multilingual from the start. |
| D-30 | **Error monitoring service** | Use a hosted error monitoring tool (for example Sentry) with personal and business data scrubbing. It is a third-party data processor and needs approval. | Vercel logs only. |
| D-31 | **CSV import** | Include CSV import for customers, products and opening stock in MVP (Should have). A realistic demo or pilot is impractical without it. | Manual entry only. |
| D-32 | **Customer-specific prices** | Include in MVP (Should have) so price validation is meaningful. Scheduled in Phase 3. | List price only. |
| D-33 | **Trademark and domain check** | Check trademark and domain availability for "OrderPilot" in the US, UK, EU and Canada before investing in brand assets or public marketing. Development continues under the name meanwhile. | Rename now; or defer the check until after pilots (risk of a forced rename). |

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **Workspace / organisation** | One business (tenant) using OrderPilot. All data belongs to exactly one workspace. |
| **Customer PO / intake / inbound order** | A customer's purchase order document and the draft being reviewed from it. |
| **Sales order** | The confirmed order created when an intake is approved. |
| **Extraction run** | One attempt to extract structured data from a document. Its output is stored unchanged. |
| **Provenance** | Where a value came from (AI, user, system default), its confidence, and whether a person confirmed it. |
| **Exception** | A validation problem on an intake. Blocking exceptions must be resolved or overridden. |
| **Override** | An approver's explicit, reasoned decision to proceed despite a blocking exception. |
| **Customer item alias** | A mapping from a customer's part number to one of our products. |
| **On hand / reserved / available** | Physical stock; stock committed to confirmed sales orders; on hand minus reserved. |
| **Backorder** | Ordered quantity that could not be reserved at approval. |
| **Outbox event** | A record written in the same transaction as a business change, for later delivery to integrations. |
| **Platform operator** | The vendor (you) who provisions and supports workspaces. |
