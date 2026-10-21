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

   The script removes every MFA factor for that account and writes an
   `mfa.factor_removed` audit event (process `operator.mfa_reset`, with the
   reason) in each workspace the person belongs to.
4. **Tell the person to sign in and set up a new authenticator.** Owners and
   Admins are sent to the security page and cannot use the workspace until
   they enrol again. Sessions that were already MFA-verified stay valid until
   they expire (at most `jwt_expiry`, 1 hour); ask the person to use
   "Sign out everywhere" after re-enrolling.
5. **Record the outcome** with the request in your support log.

## Never

- Never read out, share or log TOTP secrets, passwords or tokens.
- Never lower a person's role to avoid MFA without the Owner's decision.
- Never run the reset against a database other than the intended one.
