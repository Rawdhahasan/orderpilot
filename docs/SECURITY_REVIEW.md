# OrderPilot internal security review (Phase 6)

Scope: the MVP as built locally, against OWASP ASVS 4.0 Level 2 (the target in
PRODUCT_REQUIREMENTS.md §10). This is an internal engineering review, not an
external penetration test; an independent test is required before any external
user (Phase 7).

Status key: **Met** (control in place and tested), **Partly** (in place with a
known limitation), **Open** (not yet addressed; owner phase noted).

## V1 Architecture

| Control | Status | Evidence |
|---|---|---|
| Tenant isolation enforced in the database | Met | RLS on every table and the stock view; composite foreign keys; pgTAP `006` covers every tenant table for every role |
| Business rules enforced by the database, not the UI | Met | Hard gate, status guard triggers (all roles, including the service role), role-checked functions; pgTAP `010` negative controls |
| Privileged (service-role) access isolated | Met | Only `src/server/privileged`; ESLint rule blocks imports from UI, domain, lib, config and preview |
| Destructive local commands cannot target other databases | Met | `scripts/dev/assert-local-db.mjs` before reset, tests and E2E; unit-tested |

## V2 Authentication

| Control | Status | Evidence |
|---|---|---|
| Invite-only accounts, no public sign-up (D-03) | Met | Auth config; E2E `public sign-up is disabled` |
| Passwords at least 12 characters | Met | Auth config and server validation |
| TOTP MFA mandatory for Owners and Admins (D-24) | Met | Application redirect and database gate; pgTAP `009`, E2E `app.mfa` |
| Privileged access bound to a live AAL2 session | Met | `private.session_is_aal2`; pgTAP `010` and E2E `app.zz-revocation` |
| No account enumeration | Met | Identical sign-in and reset responses; E2E |
| Brute-force protection | Partly | Supabase Auth rate limits per IP; no per-account lockout in the application (Phase 7, with deployed Auth settings) |
| Lost authenticator recovery | Partly | Operator procedure with audit and session revocation; an already-issued access token stays valid for reads until expiry (≤ 1 hour) — Supabase cannot revoke issued JWTs |

## V3 Session management

| Control | Status | Evidence |
|---|---|---|
| Sessions validated with the Auth server on every request | Met | `getUser()` in the proxy and server; tampered cookie E2E |
| Sign out, sign out everywhere, global sign-out after password reset | Met | Account actions; E2E |
| Cookies `HttpOnly`, `SameSite`, `Secure` in production | Partly | Set by `@supabase/ssr`; `Secure` depends on HTTPS deployment (Phase 7) |

## V4 Access control

| Control | Status | Evidence |
|---|---|---|
| Server-side authorisation for every action | Met | Every write goes through RLS or a role-checked function; client roles never trusted |
| Other workspaces' records look not found | Met | `not_found` everywhere; E2E cross-workspace |
| Independent approval (D-05) | Met | Database check; pgTAP and E2E |
| Last active Owner protection | Met | Trigger; pgTAP and E2E |

## V5 Validation, sanitisation and encoding

| Control | Status | Evidence |
|---|---|---|
| Input validated on the server (Zod) and in the database (constraints) | Met | Server actions, check constraints |
| Output encoding | Met | React escaping; no `dangerouslySetInnerHTML` (ESLint rule) |
| CSV export injection | Met | Formula characters neutralised and every field quoted |
| Redirect targets | Met | `safeNextPath`; unit tests and E2E |

## V8 Data protection

| Control | Status | Evidence |
|---|---|---|
| Secrets never in the repository or logs | Met | `.env.local` git-ignored; env errors print names only; commits scanned |
| Sensitive responses not cached | Met | `no-store` on documents and exports |
| Original documents immutable and private | Met | Private bucket, no update/delete policies, immutable stored rows |
| Backups and retention | Open | Phase 7 (R-08, D-22) |

## V12 Files and resources

| Control | Status | Evidence |
|---|---|---|
| File type from content, size and page limits | Met | `verifyDocument`; E2E with a fake PDF |
| Direct uploads with short-lived signed URLs | Met | Server issues one URL per pending document after the role check |
| Malware scanning of uploads | Open | Not in MVP; required before external customers (Phase 7) |
| Rejected uploads leave no intake and the object is removed | Met | `reject_document` and storage removal |

## V13 API and V14 configuration

| Control | Status | Evidence |
|---|---|---|
| Content Security Policy with nonces, no `unsafe-eval` in production | Met | Proxy; production E2E |
| `style-src 'unsafe-inline'` | Partly | Needed by Radix and Sonner inline styles; accepted risk, revisit with nonce-able styles |
| Frame protection | Met | `frame-ancestors 'none'` except the document route (`'self'`) |
| Security headers | Met | `nosniff`, `Referrer-Policy`, `Permissions-Policy`; production E2E |
| Internal worker route authenticated | Met | Constant-time bearer comparison with `INTERNAL_JOB_SECRET`; unknown callers get 404 |
| Scheduled worker trigger in deployed environments | Open | Local uses `after()`, page polling and `pg_cron` recovery; a `pg_net` or platform cron trigger is configured with the deployment (Phase 7, TD-03) |

## V7 Logging and monitoring

| Control | Status | Evidence |
|---|---|---|
| Immutable audit trail with actor, workspace, record, time, reason | Met | `audit_events` append-only for all roles; pgTAP `008`, `010` |
| Document download events | Open | FR-AUD-07 (Should) |
| Error monitoring and alerting | Open | Phase 7 (D-30) |

## Findings to carry into Phase 7

1. Independent penetration test and dependency audit before any external user.
2. Malware scanning for uploaded documents.
3. Per-account sign-in throttling and alerting on repeated MFA failures.
4. Backup, restore and retention procedures, including storage objects.
5. Error monitoring with data scrubbing; alert on integrity-report violations.
