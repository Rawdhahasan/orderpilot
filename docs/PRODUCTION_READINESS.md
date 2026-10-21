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
| AI | Real extraction provider (§4) | **Needed for the AI value proposition** |

## 4. Real AI extraction: integration plan

The workflow already treats extraction as untrusted suggestions, so a real
provider changes one module.

- **Where it plugs in:** implement `ExtractionProvider` (`src/server/extraction/provider.ts`) and add a case to `activeProvider()` in `worker.ts`, selected by `EXTRACTION_PROVIDER`.
- **Input:** the stored document bytes, MIME type and page count; optionally the workspace locale and customer hint. Sending customer names or the catalogue to the provider is a data-sharing decision.
- **Output contract:** the provider must return `extraction.v1` (`contract.ts`): raw text per field with confidence and page. The response is validated with Zod; anything that does not parse becomes a transient or permanent failure, never a guess.
- **Our parsing stays authoritative:** dates and numbers are re-parsed by `normalize.ts` with the customer's date order; ambiguity is detected by our code.
- **Reliability:** provider timeout shorter than the 120-second lease; rate limits and 5xx as transient failures (retried with backoff); unreadable documents as permanent; idempotent completion is already enforced by claim tokens.
- **Safety:** values are always suggestions until a person confirms them; the hard gate refuses unconfirmed AI values; the "Simulated extraction" label is replaced by a provider label.
- **Before choosing a provider:** an evaluation harness on anonymised real POs (with customer permission) comparing field and line accuracy, cost per page, latency, data retention and processing region (TECHNICAL_ARCHITECTURE.md §9.4). A candidate such as an Anthropic Claude model would read the PDF directly and return JSON matching `extraction.v1`.
- **Configuration:** the API key lives only in a server-side environment variable; no key is needed or stored today.

## 5. Launch blockers (decisions or work outside this codebase)

1. Accounts, region and plans for hosting, database and email (D-23, D-25, D-26).
2. Real extraction provider, with an evaluation and data terms (D-07).
3. Backups, retention and recovery targets (R-08, D-22).
4. Malware scanning, per-account throttling, error monitoring (D-30).
5. Independent penetration test; legal documents (M-11).
6. Manual accessibility passes and usability sessions.
