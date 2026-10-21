# OrderPilot: Design System and Information Architecture

| | |
|---|---|
| **Status** | Draft v0.2: typeface, logo direction and AI colour approved (P1-2 to P1-4) |
| **Date** | 2026-10-20 |
| **Implementation** | Tailwind CSS tokens + shadcn/ui components (see §17) |

---

## 1. Brand foundation

**Name:** OrderPilot.

**One-line positioning:** Every customer PO, checked and approved before it becomes an order.

**Personality**

| We are | We are not |
|---|---|
| Precise | Flashy |
| Calm under load | Alarmist |
| Trustworthy, explicit about what is certain and what is not | Hype-driven ("AI magic") |
| Quietly premium | Decorative |
| Built for people who process orders all day | Built for a screenshot |

**Visual direction:** deep navy for structure and authority, electric blue for action and focus, light neutral canvas for long working sessions. Restraint is the premium signal: few colours, precise alignment, excellent numbers.

**Things we deliberately avoid**

- Gradient-heavy hero areas, glassmorphism, glowing cards.
- Decorative illustrations, mascots, stock photography.
- "Sparkle" iconography for AI. We describe what happened ("Suggested from document") instead.
- Vanity charts and placeholder metrics. Every number on screen is real or explicitly marked as demo data.
- Deep or clever navigation. Everything is at most two clicks from the sidebar.

---

## 2. Design principles

1. **The document is the source of truth.** The original PO is always one glance away from any extracted value.
2. **Certainty is visible.** A user can always tell whether a value is an AI suggestion, a person's confirmation, an edit, a system default or missing.
3. **The screen clears as work progresses.** Unconfirmed suggestions carry a distinct colour; confirming removes it. A finished review looks calm.
4. **Problems come with their fix.** Every exception says what is wrong, why it matters and what to do, with the action right there.
5. **Density with clarity.** Order desks need many rows on screen. Use tight but consistent spacing, strong alignment and tabular numbers rather than oversized cards.
6. **Electric blue is a signal, not decoration.** It marks the primary action, focus and selection. If everything is blue, nothing is.
7. **Consequences before commitment.** Irreversible actions (approve, cancel, fulfil, stock changes) state exactly what will happen first.

---

## 3. Logo direction (for approval)

- **Wordmark:** "OrderPilot" set in the UI typeface at semibold weight, slightly tightened tracking, navy on light, white on navy.
- **Mark (placeholder approved, P1-3):** a simple geometric symbol built from two strokes: a forward chevron that also reads as a check mark ("guided" and "verified"). Electric blue on navy, single colour, no gradients. A designer produces the final mark later.
- **Uses:** sidebar header (mark + wordmark), collapsed sidebar and favicon (mark only), sign-in page (wordmark).
- **Before investing in the brand:** check trademark and domain availability for "OrderPilot" in the US, UK, EU and Canada (D-33 in PRODUCT_REQUIREMENTS.md). Final logo design by a designer is recommended.

---

## 4. Colour system

All pairs below were measured against WCAG 2.2 contrast formulas. Normal text needs 4.5:1, large text and UI component boundaries need 3:1.

### 4.1 Palette

**Navy (structure)**

| Token | Hex | Use |
|---|---|---|
| `navy-950` | `#08142B` | Sidebar background |
| `navy-900` | `#0B1B36` | Primary text, headings |
| `navy-800` | `#132A52` | Sidebar hover, dark surfaces |
| `navy-700` | `#1C3A6E` | Sidebar active background |

**Electric blue (action)**

| Token | Hex | Use |
|---|---|---|
| `blue-50` | `#EEF3FF` | Selected row, info background |
| `blue-100` | `#DCE6FF` | Hover on selected items |
| `blue-200` | `#B8CCFF` | Subtle borders on info elements |
| `blue-400` | `#5B8AFF` | Active indicator on navy |
| `blue-500` | `#3D72FF` | Focus ring |
| `blue-600` | `#1F5BFF` | **Primary buttons, links** |
| `blue-700` | `#1747D1` | Primary hover and pressed; text on `blue-50` |

**Neutrals (canvas and text)**

| Token | Hex | Use |
|---|---|---|
| `white` | `#FFFFFF` | Surfaces: cards, tables, inputs |
| `neutral-25` | `#F6F7F9` | App canvas |
| `neutral-50` | `#F0F2F5` | Table header, subtle fills |
| `neutral-100` | `#E7EAEF` | Row hover |
| `neutral-200` | `#DFE3EA` | Dividers and card borders (decorative only) |
| `neutral-400` | `#8A94A6` | Input borders, checkbox outlines |
| `neutral-500` | `#667085` | Muted text (placeholders, metadata) |
| `neutral-600` | `#4E586A` | Secondary text |
| `neutral-700` | `#3A4354` | Body text on dense tables |

**Semantic**

| Meaning | Background (`-50`) | Foreground (`-700`) | Strong text on background (`-800`) |
|---|---|---|---|
| Success | `#E8F6EF` | `#0B7A50` | `#086440` |
| Warning | `#FFF4E6` | `#A84E00` | `#863E00` |
| Danger | `#FDEDEC` | `#C2281F` | `#9E1F18` |
| Info | `blue-50` | `blue-700` | `blue-700` |
| **AI suggestion** | `#F3F0FF` | `#5B37D6` | `#4A2AB8` |

AI accent line: `ai-500` `#7C5CFA`.

### 4.2 Measured contrast

| Pair | Ratio | Requirement | Result |
|---|---|---|---|
| `navy-900` text on white | 17.15 | 4.5 | Pass |
| `navy-900` text on canvas `neutral-25` | 16.00 | 4.5 | Pass |
| `neutral-700` text on white | 9.95 | 4.5 | Pass |
| `neutral-600` secondary text on white | 7.17 | 4.5 | Pass |
| `neutral-600` secondary text on canvas | 6.69 | 4.5 | Pass |
| `neutral-500` muted text on white | 4.97 | 4.5 | Pass |
| `neutral-500` muted text on canvas | 4.64 | 4.5 | Pass (minimum; do not use on darker fills) |
| `neutral-400` input border on white | 3.06 | 3.0 (UI component) | Pass |
| White text on `blue-600` primary button | 5.25 | 4.5 | Pass |
| White text on `blue-700` hover | 7.35 | 4.5 | Pass |
| `blue-600` link on white | 5.25 | 4.5 | Pass |
| `blue-600` link on canvas | 4.90 | 4.5 | Pass |
| `blue-700` text on `blue-50` | 6.61 | 4.5 | Pass |
| `blue-500` focus ring on white | 4.16 | 3.0 | Pass |
| White text on `navy-950` sidebar | 18.34 | 4.5 | Pass |
| `#A3AEC2` muted sidebar text on `navy-950` | 8.20 | 4.5 | Pass |
| `blue-400` active indicator on `navy-950` | 5.70 | 3.0 | Pass |
| `success-700` on white | 5.37 | 4.5 | Pass |
| `success-800` on `success-50` | 6.49 | 4.5 | Pass |
| `warning-700` on white | 5.59 | 4.5 | Pass |
| `warning-800` on `warning-50` | 7.15 | 4.5 | Pass |
| `danger-700` on white | 5.81 | 4.5 | Pass |
| `danger-800` on `danger-50` | 6.95 | 4.5 | Pass |
| White text on `danger-700` destructive button | 5.81 | 4.5 | Pass |
| `ai-700` on white | 7.09 | 4.5 | Pass |
| `ai-800` on `ai-50` | 8.09 | 4.5 | Pass |
| `ai-500` accent line on white | 4.40 | 3.0 (non-text) | Pass |
| `neutral-200` divider on white | 1.29 | n/a | Decorative only; never the sole boundary of an input |

### 4.3 Colour rules

- **Violet means "unconfirmed AI suggestion" and nothing else (approved, P1-4).** It disappears when a person confirms or edits the value.
- **Electric blue** only for primary actions, links, focus and selection.
- **Red** only for blocking problems, errors and destructive actions.
- **Amber** for warnings and states waiting on someone.
- **Green** for completed and healthy states; never for "AI is confident".
- **Colour is never the only signal.** Every coloured state also has text and, where useful, an icon.

---

## 5. Typography

**Approved (P1-2):** Geist Sans for UI and Geist Mono for identifiers (both free under the SIL Open Font License, loaded via `next/font`, self-hosted, no external requests).
**Requirement:** all numeric columns use tabular figures (`font-variant-numeric: tabular-nums`). Verify the chosen font supports this at kickoff; Inter is the fallback if it does not.

| Style | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | 30 / 36 | 600 | Sign-in page and empty-state headlines only |
| `h1` | 24 / 32 | 600 | Page titles |
| `h2` | 18 / 28 | 600 | Section titles |
| `h3` | 16 / 24 | 600 | Card and panel titles |
| `body` | 14 / 20 | 400 | Default UI text |
| `body-strong` | 14 / 20 | 500 | Emphasis, table primary column |
| `small` | 13 / 18 | 400 | Table cells, helper text |
| `caption` | 12 / 16 | 500 | Labels, badges, metadata |
| `mono` | 13 / 18 | 450 | SKUs, PO numbers, sales order numbers, references |

Rules: headings use −0.01em letter spacing; no all-caps paragraphs; uppercase only for very short overlines with +0.04em spacing; maximum line length for prose about 72 characters.

---

## 6. Spacing, layout and breakpoints

**Spacing scale (4 px base):** 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

**App shell**

| Element | Size |
|---|---|
| Sidebar | 248 px expanded, 64 px collapsed |
| Top bar | 56 px |
| Page padding | 24 px desktop, 16 px mobile |
| Form max width | 720 px |
| Review screen | Three regions: document (flexible), draft (min 560 px), exceptions rail (320 px) |

**Breakpoints**

| Name | Min width | Typical device |
|---|---|---|
| `sm` | 640 | Large phone |
| `md` | 768 | Tablet portrait |
| `lg` | 1024 | Tablet landscape, small laptop |
| `xl` | 1280 | Laptop (review screen target) |
| `2xl` | 1536 | Desktop |

**Table density:** 44 px rows by default; a compact 36 px option for heavy users (later).

---

## 7. Shape, borders and elevation

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 4 px | Badges, chips |
| `radius-md` | 6 px | Buttons, inputs |
| `radius-lg` | 8 px | Cards, popovers, menus |
| `radius-xl` | 12 px | Dialogs, sheets |

- Cards are **flat**: white surface, 1 px `neutral-200` border, no shadow.
- Shadows only for floating layers: `shadow-sm` for menus and popovers, `shadow-lg` for dialogs.
- Focus: 2 px `blue-500` ring with 2 px offset on every interactive element.

---

## 8. Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion-micro` | 100 ms | ease-out | Checkbox, confirm tick |
| `motion-fast` | 150 ms | ease-out | Hover, press |
| `motion-base` | 200 ms | `cubic-bezier(0.2, 0, 0, 1)` | Menus, popovers, tooltips |
| `motion-slow` | 250 ms | `cubic-bezier(0.2, 0, 0, 1)` | Sheets, dialogs |

Purposeful uses only: a field's violet tint fading out when confirmed; a list row briefly highlighting when its status changes in real time; exception counts updating. With `prefers-reduced-motion`, all non-essential transitions are removed and skeletons do not shimmer.

---

## 9. Components

Built on shadcn/ui and customised with OrderPilot tokens.

### 9.1 Buttons

| Variant | Look | Use |
|---|---|---|
| Primary | `blue-600` fill, white text | One per view: the main next step ("Submit for approval", "Approve order") |
| Secondary | White fill, `neutral-400` border, navy text | Other actions |
| Ghost | Text only | Tertiary actions in toolbars |
| Destructive | `danger-700` fill, white text | Cancel order, remove member |
| Link | `blue-600` text, underline on hover | Inline navigation |

Sizes: 32 px (tables, toolbars), 36 px (default), 40 px (primary page actions). Minimum touch target 24 × 24 px, 44 px on touch layouts. Buttons that start server work show an inline spinner and are disabled until the result arrives.

### 9.2 Form controls

- Label above the field, helper text below, error text below with icon, in `danger-700`.
- Inputs: white, 1 px `neutral-400` border, 36 px high; focus ring as in §7.
- Required fields marked "Required" in text, not only with an asterisk.
- Numeric inputs right-aligned with tabular figures; currency symbol as a prefix adornment.
- Comboboxes for customer and product selection show the match reason and score inline.
- Validation timing: on blur and on submit; never while the user is still typing a value.

### 9.3 Data tables

- White surface, `neutral-50` header with `caption` style labels, `neutral-200` row dividers, `neutral-100` hover, `blue-50` selected.
- Sticky header; first column sticky on narrow screens.
- Numbers right-aligned with tabular figures; identifiers in mono; text left-aligned.
- Sortable columns show direction; filters appear as removable chips above the table.
- Server-side pagination with "1–50 of 2,341"; virtualised rows on the review screen.
- Row actions in a trailing "more" menu; primary row click opens the record.
- Empty, loading (skeleton rows) and error states are part of the component.

### 9.4 Status badges

Each badge has a text label and a leading dot or icon.

| Entity | Status | Tone |
|---|---|---|
| Intake | Received, Extracting | Neutral, with progress icon |
| Intake | Extraction failed | Danger |
| Intake | In review | Info (blue) |
| Intake | Awaiting approval | Warning (amber) |
| Intake | Approved | Success |
| Intake | Rejected | Danger |
| Intake | Cancelled | Neutral |
| Sales order | Confirmed | Info |
| Sales order | Fulfilled | Success |
| Sales order | Cancelled | Neutral |
| Customer | Active / On hold / Inactive | Success / Warning / Neutral |
| Stock | In stock / Low / Out of stock / Over-committed | Success / Warning / Danger / Danger with alert icon |
| Exception | Blocking / Warning | Danger / Warning |

### 9.5 Exception items

```
┌───────────────────────────────────────────────┐
│ ● Unit mismatch · Line 4                      │  danger dot + title + scope
│ PO says 5 CS; product sells in EA.            │  plain-language explanation
│ [Convert quantity]  [Show on document]        │  resolution actions
└───────────────────────────────────────────────┘
```

Grouped as Blocking, then Warnings, then Resolved (collapsed). Selecting an item scrolls to and focuses the field. Overridden items show the approver's name and reason.

### 9.6 Provenance markers

The most important component in the product. It shows where each value came from and whether a person has verified it.

| State | Visual treatment | Label and tooltip |
|---|---|---|
| **AI suggested** (at or above threshold) | `ai-50` field background, 2 px `ai-500` left bar, chip in `ai-800` on `ai-50` with a document-scan icon | "Suggested · 97%". Tooltip: "Read from page 1. Confirm or edit." |
| **AI suggested, low confidence** (below threshold) | Same as above, chip in warning tone | "Check · 61%". Must be confirmed individually. |
| **Ambiguous** | Same as low confidence, with alternatives listed | "Ambiguous: 4 Nov or 11 Apr" |
| **Confirmed** | Normal field, small `success-700` check icon | Tooltip: "Confirmed by Jordan, 09:14" |
| **Edited** | Normal field, small pencil icon | Tooltip: "AI suggested 12. Changed by Jordan, 09:15" |
| **Entered by user** | Normal field, no marker | Tooltip on focus: "Entered by Jordan" |
| **System default** | Normal field, neutral chip | "Catalog price" or "Customer price" |
| **Missing** | Empty field, dashed `neutral-400` border | Placeholder: "Not found on document". Never a sample value. |

Rules:

- Violet appears only for unconfirmed suggestions (§4.3).
- Sales order screens show **no** AI markers: they contain confirmed data only. They show provenance in the timeline instead.
- The confidence number is shown, but never as the reason something is "correct"; the product language is always "suggested".

### 9.7 Document viewer

- PDF.js canvas with page thumbnails (collapsible), page navigation, zoom (fit width, fit page, 50–200 %), rotate, download.
- When a field with a page reference is focused, the viewer jumps to that page and briefly highlights it. Exact field highlighting arrives with a real provider that returns positions.
- If rendering fails: message plus download button; review can continue.
- Keyboard: `[` and `]` for previous and next page; `+` and `−` for zoom when the viewer has focus.

### 9.8 Stat tiles

- Show a label, a value, and context ("Oldest: 2 h 10 min").
- Values always come from live queries. When there is not enough data, the tile shows "Not enough data yet" with a short explanation.
- No trend arrows or percentage changes unless both periods have enough data.
- In demo workspaces, the persistent banner states that data is demo data.

### 9.9 Timeline

Vertical list of events: icon by event type, actor, action in plain language, time (relative with absolute on hover), and expandable detail for field changes ("Quantity: 12 → 120. AI suggested 12."). Overrides and approvals visually emphasised.

### 9.10 Dialogs and confirmations

- Title is the action as a question: "Approve this order?"
- Body states the consequence in specifics: "This creates sales order SO-2026-000413 and reserves stock for 12 lines. 1 line will be backordered (20 EA)."
- Primary button names the action: "Approve order", never "OK".
- Reason fields are required where the product requires a reason; the button stays disabled until filled.

### 9.11 Toasts and banners

- **Toasts** (bottom right, 5 s, pause on hover): confirmations of completed background actions, always with a link to the result.
- **Banners** (top of page, persistent): demo workspace, simulated extraction, offline, intake read-only, changes requested by approver, and **"Development Preview — Fictional Data"** on every development preview page (P1-7).

### 9.12 Empty, loading and error states

| State | Pattern |
|---|---|
| Empty | One sentence on what belongs here, one primary action. No illustration. |
| Loading | Skeletons matching the final layout. |
| Error | What happened, what to do, **Try again**, and a request ID in small text. |
| No permission | Which role is needed and who to ask (workspace Owners). |

---

## 10. Data formatting rules

| Data | Format | Example |
|---|---|---|
| Currency | Workspace currency via `Intl.NumberFormat` and locale | `$1,240.50`, `£1,240.50`, `1.240,50 €` |
| Unit prices | Up to 4 decimals when needed, else 2 | `$0.0125`, `$12.40` |
| Quantities | Product's decimals, with unit | `24 EA`, `12.5 KG` |
| Dates | Unambiguous: day, abbreviated month, year | `14 Oct 2026` (`Oct 14, 2026` for `en-US` workspaces) |
| Times | Workspace timezone, 24-hour for non-US locales | `09:14`, `9:14 AM` |
| Relative time | Lists and timelines, with absolute on hover | `2 h ago` |
| Identifiers | Mono, never truncated in the middle | `SO-2026-000412`, `IN-001042` |
| Empty values | En dash in tables, "Not provided" in forms | `–` |

Numeric dates such as `04/11/2026` are **never** displayed.

---

## 11. Iconography

- Lucide icons, 16 px in dense UI and 20 px in navigation, 1.5 px stroke, `currentColor`.
- Icons accompany text labels; icon-only buttons have accessible names and tooltips.
- A small, fixed icon vocabulary: upload, document, scan (AI suggestion), check (confirmed), pencil (edited), alert (blocking), triangle (warning), clock (waiting), package (stock), user, shield (permissions), history (audit).

---

## 12. Information architecture

### 12.1 Navigation

```
Sidebar
├─ [Logo]  Workspace switcher (if more than one)
├─ WORK
│  ├─ Dashboard
│  ├─ Customer POs         (count: in review)
│  └─ Approvals            (count: awaiting; Approver+ only)
├─ RECORDS
│  ├─ Sales orders
│  ├─ Customers
│  ├─ Products
│  └─ Inventory
├─ ADMIN
│  ├─ Audit log            (Owner, Admin, Approver)
│  └─ Settings             (Owner, Admin; others see Profile only)
└─ User menu: profile, security (MFA), sign out

Top bar: breadcrumb · global search (Should) · [Upload PO] (Processor+)
```

Eight destinations, three groups, no nested menus. Items a role cannot use are hidden, not disabled.

### 12.2 URL map

| Page | URL |
|---|---|
| Dashboard | `/o/{slug}/dashboard` |
| Customer PO list | `/o/{slug}/customer-pos?status=in_review` |
| Intake review | `/o/{slug}/customer-pos/{intakeId}` |
| Approval queue | `/o/{slug}/approvals` |
| Approval summary | `/o/{slug}/approvals/{intakeId}` |
| Sales orders | `/o/{slug}/sales-orders`, `/o/{slug}/sales-orders/{id}` |
| Customers | `/o/{slug}/customers`, `/o/{slug}/customers/{id}` |
| Products | `/o/{slug}/products`, `/o/{slug}/products/{id}` |
| Inventory | `/o/{slug}/inventory`, `/o/{slug}/inventory/{productId}` |
| Audit log | `/o/{slug}/audit` |
| Settings | `/o/{slug}/settings/workspace`, `/members`, `/order-rules` |

Filters and sort live in the query string, so any view can be bookmarked and shared.

### 12.3 Dashboard information architecture

The dashboard is a **work surface first, report second**. Modules appear by role.

| Region | Module | Owner | Admin | Approver | Processor | Inventory Mgr | Viewer |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| 1. Needs your attention | Assigned to me (in review, changes requested) | ✓ | ✓ | ✓ | ✓ | | |
| | Unassigned in review | ✓ | ✓ | ✓ | ✓ | | |
| | Extraction failed | ✓ | ✓ | ✓ | ✓ | | |
| | Awaiting approval (count, oldest wait) | ✓ | ✓ | ✓ | | | |
| | Override required (submitted intakes waiting for an override, C-01) | ✓ | ✓ | ✓ | | | |
| | Confirmed orders awaiting fulfilment | ✓ | ✓ | ✓ | | ✓ | |
| | Pending invitations | ✓ | ✓ | | | | |
| 2. Pipeline | Counts by intake status, oldest age per status | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3. Records | Recent sales orders | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Inventory alerts (over-committed, out, low) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Open backorders (M-02) | ✓ | ✓ | ✓ | | ✓ | |
| 4. Performance | Approved this week; median upload-to-approval time | ✓ | ✓ | ✓ | | | ✓ |
| | Exceptions by type (last 30 days) | ✓ | ✓ | ✓ | | | |
| 5. Activity | Recent activity feed | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Rules: every count links to the filtered list behind it; no module shows a number that cannot be clicked through to the records that produce it; at most one small chart (approved orders per day for 14 days), shown only with at least 7 days of data.

---

## 13. Key screen layouts

Low-fidelity wireframes to agree structure before visual design.

### 13.1 Dashboard (desktop)

```
┌──────────┬──────────────────────────────────────────────────────────────────────┐
│ ◆ Order  │ Dashboard                                             [Upload PO]   │
│   Pilot  ├──────────────────────────────────────────────────────────────────────┤
│          │ NEEDS YOUR ATTENTION                                                 │
│ WORK     │ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐          │
│ Dashboard│ │ Assigned to me  │ │ Awaiting        │ │ Extraction      │          │
│ Customer │ │ 2               │ │ approval  3     │ │ failed  1       │          │
│  POs   6 │ │ Oldest 35 min   │ │ Oldest 2 h 10 m │ │ IN-001044       │          │
│ Approvals│ └─────────────────┘ └─────────────────┘ └─────────────────┘          │
│        3 │ PIPELINE                                                             │
│ RECORDS  │ Received 0 · Extracting 1 · In review 6 · Awaiting approval 3 ·      │
│ Sales    │ Approved today 14                                                    │
│  orders  │ ┌──────────────────────────────────┐ ┌─────────────────────────────┐ │
│ Customers│ │ Recent sales orders              │ │ Inventory alerts            │ │
│ Products │ │ SO-2026-000412  Harbor & Pine …  │ │ ▲ Over-committed  2         │ │
│ Inventory│ │ SO-2026-000411  Northgate …      │ │ ● Out of stock    5         │ │
│ ADMIN    │ └──────────────────────────────────┘ └─────────────────────────────┘ │
│ Audit log│ ┌──────────────────────────────────┐ ┌─────────────────────────────┐ │
│ Settings │ │ This week                        │ │ Recent activity             │ │
│          │ │ Approved 61 · Median 1 h 42 m    │ │ Ahmed approved IN-001041 …  │ │
│ [User]   │ └──────────────────────────────────┘ └─────────────────────────────┘ │
└──────────┴──────────────────────────────────────────────────────────────────────┘
```
(Numbers in wireframes are layout placeholders, not data.)

### 13.2 Intake review (desktop, ≥ 1280 px)

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Customer POs / IN-001042   [In review]   Assigned to Jordan     Saved 10:42      │
│ Harbor & Pine Supply · PO 88213                  [Cancel intake] [Submit for approval]│
├────────────────────────────┬──────────────────────────────────┬───────────────────┤
│ DOCUMENT                   │ ORDER                            │ EXCEPTIONS        │
│ ┌────────────────────────┐ │ Customer    Harbor & Pine  ✓     │ Blocking (2)      │
│ │                        │ │ PO number   88213   [Suggested 97%]│ ● Unit mismatch  │
│ │   page 1 of 2          │ │ PO date     14 Oct 2026  ✓       │   Line 4          │
│ │   (jumps to the page   │ │ Requested   [Ambiguous: 4 Nov /  │ ● Ambiguous date  │
│ │    of the focused      │ │              11 Apr]             │   Requested date  │
│ │    field)              │ │ Ship-to     [Not found on doc.]  │ Warnings (1)      │
│ │                        │ │ ──────────────────────────────── │ ▲ Low stock       │
│ └────────────────────────┘ │ LINES (12)  [Confirm high-       │   Line 7          │
│ ◀ 1/2 ▶  − 100% +  ⤓       │              confidence lines]   │ Resolved (4) ▸    │
│                            │ #  Cust. part  Product     Qty   │                   │
│                            │ 1  HP-221      SKU-1001    24 EA ✓│                  │
│                            │ 4  HP-907      SKU-2207    5 CS ⚠ │                  │
│                            │ …                                │                   │
├────────────────────────────┴──────────────────────────────────┴───────────────────┤
│ 2 blocking exceptions · 5 unconfirmed fields              [Submit for approval]  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

At 1024–1279 px the exceptions rail becomes a drawer. Below 1024 px, Document and Order become tabs.

### 13.3 Approval summary (works from 360 px)

```
┌───────────────────────────────────────────────┐
│ Approve IN-001042?                            │
│ Harbor & Pine Supply · PO 88213               │
│ Ship to: Main warehouse, Leeds LS1 …          │
│ Subtotal £4,812.40 · 12 lines                 │
├───────────────────────────────────────────────┤
│ OVERRIDE REQUIRED (1)                         │
│  ● Customer on hold        [Override…]        │
│ CHANGES FROM AI SUGGESTION (3)            ▸   │
│ DECISIONS (4)                             ▸   │
│  • Unit converted: line 4, 5 CS → 60 EA       │
│  • Price: line 9 uses customer price          │
│  • Override: duplicate PO (Ahmed, reason …)   │
│ STOCK                                         │
│  ▲ Line 7: 60 requested, 40 available         │
│ ALIASES TO REMEMBER (1)                   ▸   │
│ NOTE FROM JORDAN                              │
│  "Customer confirmed by phone."               │
│ [View document]                               │
├───────────────────────────────────────────────┤
│ [Request changes]  [Reject]   [Approve order] │
└───────────────────────────────────────────────┘
```

**Approve order** stays disabled while any Override required item is open, with the text "Override or return 1 item before approving" (C-01).

### 13.4 Sales order detail

Header (number, status, customer, customer PO number, approved by and when; "Fulfilled · 20 EA backordered" when a backorder exists, M-02) · address snapshots · lines table (ordered, allocated, backordered, unit price, price source, total) · side panel with source intake, original document link and timeline · actions: Mark fulfilled, Cancel, Export (Should).

---

## 14. Accessibility (WCAG 2.2 AA)

- Contrast per §4.2; focus always visible (§7) and never obscured by sticky headers.
- Every function available by keyboard. Review screen shortcuts use modifier keys to avoid conflicts with screen readers, and are listed in a dialog opened with `?`:

| Shortcut | Action |
|---|---|
| `Alt + ↓` / `Alt + ↑` | Next / previous unconfirmed field |
| `Alt + Enter` | Confirm focused field |
| `Alt + L` | Confirm focused line |
| `Alt + E` | Focus exceptions panel |
| `Ctrl/⌘ + Enter` | Submit for approval (opens confirmation) |

- Live regions announce save status and exception count changes politely.
- Tables use real table markup with header associations; sort state exposed.
- Provenance and status never rely on colour alone (§4.3, §9.6).
- Targets at least 24 × 24 px (WCAG 2.5.8).
- Content reflows at 320 px width and 200 % zoom for all pages except the document canvas, which offers download and its own zoom.
- Scanned documents are images; the structured draft is the accessible representation, and the original is downloadable.
- Automated axe checks in end-to-end tests plus manual screen-reader passes (VoiceOver and NVDA) each release (TESTING_STRATEGY.md).

---

## 15. Responsive behaviour

| Screen | ≥ 1280 | 1024–1279 | 768–1023 | < 768 |
|---|---|---|---|---|
| Sidebar | Expanded | Collapsible | Collapsed icons | Off-canvas menu |
| Dashboard | 3 columns | 2 columns | 2 columns | 1 column |
| Lists | Full table | Full table | Priority columns, horizontal scroll inside table only | Card list per row |
| Intake review | 3 regions | Document + order, exceptions drawer | Tabs | Read-only summary; editing recommended on larger screens |
| Approval summary | Two columns with document | Single column + document drawer | Single column | Single column (designed for phones) |
| Forms | Centered 720 px | Same | Full width | Full width |

No horizontal page scroll at any width.

---

## 16. Content and microcopy

**Voice:** clear, specific, calm. Say exactly what happened and what to do next.

| Do | Don't |
|---|---|
| "Suggested from document" | "AI magic", "auto-filled for you" |
| "PO 88213 was already received on 18 Oct (SO-2026-000398)." | "Duplicate detected!" |
| "Approve order" | "OK", "Submit" (when the action is approval) |
| "You need the Approver role to approve orders. Ask a workspace Owner." | "Access denied." |
| "We couldn't save your changes. Try again. Reference: 7f3a…" | "Error 500" |
| "Not found on document" | Inventing a placeholder value |

Conventions: sentence case for all UI text; buttons are verb plus noun; numbers with units; dates per §10; avoid jargon such as "intake" in the UI when "customer PO" is clearer.

---

## 17. Implementation notes

- Tokens defined once as CSS custom properties in the global stylesheet and mapped into Tailwind's theme, so classes like `bg-canvas`, `text-muted`, `border-input` are semantic.
- shadcn/ui variables (`--background`, `--foreground`, `--primary`, `--ring`, `--destructive`, and so on) map to OrderPilot tokens.
- Component variants with `class-variance-authority`, the shadcn/ui convention.
- Dark mode (later, D-28): every token gets a dark value under a theme attribute; components only reference semantic tokens, never raw hex values.
- The development preview (TECHNICAL_ARCHITECTURE.md §20) includes a component gallery showing every component state, used for visual review and, from Phase 6, screenshot tests.
