# Runbook: lost authenticator (MFA reset)

Applies to D-24. There is no self-service bypass: a person who loses their
authenticator cannot sign in to an Owner or Admin role until an operator
removes the old factor. Recovery codes are not offered in Phase 2C.

## When to use

A member reports that their phone or authenticator app is lost, reset or
replaced, and they cannot produce a valid 6-digit code.

## Steps

1. **Receive the request through a workspace Owner**, not only from the person.
   Note who asked, when, and through which channel.
2. **Verify identity out of band.** Use a channel already on record (for
   example a known phone number or a video call with someone who knows the
   person). Never verify using details supplied in the same request.
   If anything is doubtful, stop.
3. **Run the reset** (local stack only in this phase; the script refuses any
   non-local Supabase URL):

   ```sh
   corepack pnpm ops:reset-mfa person@example.com "Lost phone; identity confirmed by video call with <Owner>, ticket <ref>"
   ```

   The script removes every MFA factor for that account, **ends all of the
   person's sessions** (their refresh tokens stop working), and writes an
   `mfa.factor_removed` audit event (process `operator.mfa_reset`, with the
   reason and the number of sessions ended) in each workspace the person
   belongs to.
4. **Tell the person to sign in and set up a new authenticator.** Owners and
   Admins are sent to the security page and cannot use the workspace until
   they enrol again.

   **What "ends the sessions" covers.** Privileged database access stops
   immediately: Owner and Admin permissions require that the token's session
   still exists at AAL2 (`private.session_is_aal2`). The app also treats the
   person as signed out on the next request, because it validates every
   session with the Auth server. The one remaining limitation is that an
   access token already issued stays cryptographically valid until it expires
   (at most `jwt_expiry`, 1 hour); during that window it can still be used
   for the non-privileged reads its roles allow, never for Owner or Admin
   actions. Supabase does not support revoking an issued access token.
5. **Record the outcome** with the request in your support log.

## Never

- Never read out, share or log TOTP secrets, passwords or tokens.
- Never lower a person's role to avoid MFA without the Owner's decision.
- Never run the reset against a database other than the intended one.
