// Manual recovery for a lost authenticator (D-24, docs/runbooks/lost-authenticator.md).
// Removes every MFA factor of one user and records an audit event in each of
// their workspaces. Run only after verifying the person's identity out of band.
//   corepack pnpm ops:reset-mfa <email> "<reason, including how identity was verified>"
// Local stack only in this phase: the script refuses non-local Supabase URLs.
import { createClient } from "@supabase/supabase-js";

import { localStatus } from "../dev/local-supabase.mjs";

const [email, reason] = process.argv.slice(2);
if (!email || !reason || reason.trim().length < 10) {
  console.error('Usage: corepack pnpm ops:reset-mfa <email> "<reason of at least 10 characters>"');
  process.exit(1);
}

const status = localStatus();
const admin = createClient(status.API_URL, status.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: profile, error: profileError } = await admin
  .from("profiles")
  .select("id")
  .eq("email", email.trim().toLowerCase())
  .maybeSingle();
if (profileError || !profile) {
  console.error("No account was found for that email.");
  process.exit(1);
}

const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({
  userId: profile.id,
});
if (listError) throw new Error(`Could not list factors: ${listError.message}`);
for (const factor of factors.factors) {
  const { error } = await admin.auth.admin.mfa.deleteFactor({ userId: profile.id, id: factor.id });
  if (error) throw new Error(`Could not remove a factor: ${error.message}`);
}

const { error: auditError } = await admin.rpc("record_mfa_reset", {
  p_user_id: profile.id,
  p_reason: reason.trim(),
});
if (auditError)
  throw new Error(`Factors were removed but the audit event failed: ${auditError.message}`);
console.log(
  `Removed ${factors.factors.length} factor(s). The user must enrol MFA again at next sign-in if their role requires it.`,
);
