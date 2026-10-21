# OrderPilot production readiness

What exists today, what a first deployment needs, and what blocks launch.
Nothing here has been deployed; every external step needs your approval
(accounts, plans, region, providers).

## 1. Deployment architecture

| Part | Plan | Decision still needed |
|---|---|---|
| Web app | Next.js on Vercel (or any Node 24 host) | Plan (D-26) |
| Database, Auth, Storage | One Supabase project per environment (staging, production) | Region (D-23), plan (D-26) |
| Email | Transactional provider configured as Supabase SMTP and `MAIL_TRANSPORT` | Provider (D-25) |
| Monitoring | Error monitoring with data scrubbing | Provider (D-30) |
| Extraction | Simulated only; real provider after evaluation (§4) | Provider and data terms (D-07) |

## 2. Setting up an environment

1. **Supabase project:** create it in the chosen region; enable `pg_cron`, `pg_net` and `pgcrypto`.
2. **Schema:** `supabase link` then `supabase db push` applies `supabase/migrations` (21 migrations). Never run `db reset` against it; the local guard (`scripts/dev/assert-local-db.mjs`) refuses linked projects.
3. **Auth settings** (same as `supabase/config.toml`): public sign-up off; email provider on; minimum password 12; TOTP MFA enrol and verify on; secure password change on; site URL and redirect URLs set to the app's URL; SMTP set to the approved provider.
4. **Storage:** the private `source-documents` bucket and its policies come from the migrations; confirm the 20 MB limit and MIME types.
5. **Worker schedule:** store the app URL and `INTERNAL_JOB_SECRET` in Vault, then run `supabase/deploy/schedule-worker.sql`.
6. **App environment:** set every variable in `.env.example` (`DEPLOYMENT_ENV=production`, a new random `INTERNAL_JOB_SECRET`, the project's publishable and secret keys). The secret key goes only into server-side environment variables.
7. **First workspace:** an operator runs `create_organization(...)` with the first Owner's account, then the Owner invites the team in the app.
8. **Smoke test:** sign in, enrol MFA, invite a user, upload a PO (manual entry), approve, fulfil; check the audit log.

The demo workspace (UF-13) is created the same way with `p_is_demo => true`.

## 3. Readiness checklist

| Area | Item | Status |
|---|---|---|
| Security | Tenant isolation (RLS on every table, tested per role) | Done |
| Security | MFA for Owners and Admins, enforced in the database with live-session check | Done |
| Security | Invite-only accounts; no account enumeration | Done |
| Security | CSP with nonces, security headers, frame protection | Done |
| Security | Upload checks: content type, size, pages, hash; private bucket; no overwrite or delete | Done |
| Security | Internal security review (ASVS L2), [SECURITY_REVIEW.md](SECURITY_REVIEW.md) | Done |
| Security | Production dependency audit (`pnpm audit --prod`): no known vulnerabilities | Done |
| Security | Dev-only advisory: `braces` via `eslint-config-next` (lint tooling, not shipped, no patched release yet) | Track |
| Security | Malware scanning of uploads | **Needed before external customers** |
| Security | Per-account sign-in throttling and MFA-failure alerts | **Needed** |
| Security | Independent penetration test | **Needed before launch** |
| Data | Migrations apply cleanly from empty (21) and pass 705 database checks | Done |
| Data | Backups and restore test, including Storage objects; retention (D-22) | **Needed** |
| Data | RPO and RTO targets agreed | **Needed** |
| Reliability | Queue recovery every minute (`pg_cron`), worker schedule (§2 step 5) | Template ready |
| Reliability | Nightly inventory integrity check | Done (writes to audit) |
| Reliability | Error monitoring and alerting on integrity violations | **Needed** |
| Product | Core workflow end to end, imports, exports, audit, dashboard | Done |
| Product | Accessibility: automated WCAG 2.2 AA checks | Done |
| Product | Manual screen-reader passes (VoiceOver, NVDA) | **Needed** |
| Product | Usability sessions with real order processors | **Needed** |
| Legal | Terms, privacy policy, data processing agreement (M-11) | **Needed** |
| AI | Real extraction provider: Google Gemini, free tier, behind limits (§4) | Built; **accuracy on real documents not yet evaluated** |

## 4. Real AI extraction (Google Gemini)

Built and tested with a mocked Gemini API; not yet evaluated on real documents.

- **Provider:** `src/server/extraction/gemini.ts`, official `@google/genai` SDK, server-side only, selected by `AI_EXTRACTION_PROVIDER=gemini`. Default model `gemini-3.8-flash` (free tier, PDFs and images, structured output). Each job keeps the provider it was queued with; there is never an automatic switch to another or a paid provider.
- **Input:** the stored document bytes (inline), MIME type and page count only. No customer list, catalogue or prices are sent.
- **Output:** strict JSON schema (temperature 0): printed text per field with page and the model's own "uncertain" flag; null when absent. Validated with Zod, then mapped to `extraction.v1`. Model confidence is **not** used as a calibrated probability: Gemini values are never bulk-confirmable and show as "Check" until a person confirms each one.
- **Our parsing stays authoritative:** `normalize.ts` parses dates and numbers; product matching, prices, totals checks, duplicates, approval and stock are unchanged and never done by the AI.
- **Free-tier safety:** `reserve_ai_call` checks per-minute, per-day and per-workspace-per-day limits atomically before every call; page and size limits; one call per attempt (no SDK retries), retried by the queue with backoff for 429 per-minute, 5xx, timeouts and invalid answers; a daily quota (Google's or ours) fails at once with a clear message and manual entry. Usage is logged without content (`ai_usage_events`, Settings → AI usage).
- **Data:** on the free tier Google may use submitted content to improve its products. Use fictional documents only until a paid tier with data terms is approved (D-07).
- **Before real customers:** an evaluation on permitted real POs (field and line accuracy, latency, cost), a paid tier or enterprise terms with no training on data, and a processing region decision.

## 5. Launch blockers (decisions or work outside this codebase)

1. Accounts, region and plans for hosting, database and email (D-23, D-25, D-26).
2. AI extraction: accuracy evaluation on permitted real documents and data terms for a paid tier (D-07); the free tier is for fictional documents only.
3. Backups, retention and recovery targets (R-08, D-22).
4. Malware scanning, per-account throttling, error monitoring (D-30).
5. Independent penetration test; legal documents (M-11).
6. Manual accessibility passes and usability sessions.
