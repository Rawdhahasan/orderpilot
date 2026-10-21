/**
 * Maps stable database error codes (docs/DATABASE_ARCHITECTURE.md §7.5) to
 * messages for people. Never shows SQL, constraint names or other workspaces'
 * identifiers.
 */
type DbError = { code?: string; message?: string } | null | undefined;

const MESSAGES: Record<string, string> = {
  mfa_required:
    "This action needs two-factor authentication. Verify with your authenticator app and try again.",
  last_owner: "A workspace must keep at least one active Owner. Make someone else an Owner first.",
  invitation_invalid: "This invitation link is not valid.",
  invitation_used: "This invitation has already been used.",
  invitation_expired: "This invitation has expired. Ask your workspace admin to send a new one.",
  invitation_revoked: "This invitation was withdrawn. Ask your workspace admin to send a new one.",
  invitation_email_mismatch:
    "This invitation was sent to a different email address. Sign in with that address to accept it.",
  membership_suspended: "Your access to this workspace is suspended. Ask a workspace Owner.",
  rate_limited: "Too many invitations were sent recently. Try again later.",
  not_found: "We couldn't find that. It may have been removed, or you may not have access.",
  insufficient_privilege: "You don't have permission to do that. Ask a workspace Owner.",
  invalid_state: "That change isn't possible right now. Refresh the page and try again.",
};

export function messageForDbError(error: DbError): string {
  const message = error?.message ?? "";
  const key = message.split(":")[0]?.trim() ?? "";
  if (key === "validation_failed") {
    const detail = message.slice(message.indexOf(":") + 1).trim();
    return detail
      ? detail.charAt(0).toUpperCase() + detail.slice(1) + "."
      : "Check the details and try again.";
  }
  if (key in MESSAGES) return MESSAGES[key]!;
  if (error?.code === "42501") return MESSAGES.insufficient_privilege!;
  if (error?.code === "23514" || error?.code === "22023" || error?.code === "22P02")
    return "Check the details and try again.";
  return "Something went wrong. Try again in a moment.";
}
