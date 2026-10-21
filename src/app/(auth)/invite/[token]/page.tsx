import type { Metadata } from "next";
import Link from "next/link";

import { ROLE_LABELS, type Role } from "@/domain/auth/roles";
import { getAuth } from "@/server/auth/context";
import { createAdminClient } from "@/server/privileged/admin";

import { AcceptForm, CreateAccountForm } from "./invite-forms";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

type Invitation = { organization_name: string; email: string; role: Role; state: string };

const STATE_MESSAGES: Record<string, { title: string; body: string }> = {
  invalid: {
    title: "Invitation not found",
    body: "This invitation link is not valid. Check that you copied the whole link.",
  },
  accepted: {
    title: "Invitation already used",
    body: "This invitation has already been accepted. Sign in to continue.",
  },
  expired: {
    title: "Invitation expired",
    body: "This invitation has expired. Ask your workspace admin to send a new one.",
  },
  revoked: {
    title: "Invitation withdrawn",
    body: "This invitation was withdrawn. Ask your workspace admin to send a new one.",
  },
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let invitation: Invitation | undefined;
  if (/^[0-9a-f]{64}$/.test(token)) {
    const { data } = await createAdminClient().rpc("describe_invitation", { p_token: token });
    invitation = (Array.isArray(data) ? data[0] : undefined) as Invitation | undefined;
  }
  const state = invitation?.state ?? "invalid";

  if (!invitation || state !== "pending") {
    const message = STATE_MESSAGES[state] ?? STATE_MESSAGES.invalid!;
    return (
      <>
        <h1 className="text-h1 font-semibold text-navy-900">{message.title}</h1>
        <p className="mt-1 text-body text-subtle-foreground">{message.body}</p>
        <p className="mt-6 text-small">
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Go to sign in
          </Link>
        </p>
      </>
    );
  }

  const auth = await getAuth();
  const roleLabel = ROLE_LABELS[invitation.role];
  const intro = (
    <>
      <h1 className="text-h1 font-semibold text-navy-900">Join {invitation.organization_name}</h1>
      <p className="mt-1 text-body text-subtle-foreground">
        You&apos;ve been invited as{" "}
        <strong className="font-medium text-navy-900">{roleLabel}</strong>.
        {invitation.role === "owner" || invitation.role === "admin"
          ? " This role requires two-factor authentication."
          : ""}
      </p>
    </>
  );

  if (auth.user) {
    if (auth.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return (
        <>
          {intro}
          <p
            role="alert"
            className="mt-6 rounded-md bg-warning-50 px-3 py-2 text-small text-warning-800"
          >
            This invitation was sent to a different email address than the one you&apos;re signed in
            with. Sign out, then open the link again.
          </p>
          <p className="mt-6 text-small">
            <Link href="/account" className="font-medium text-primary hover:underline">
              Go to your account to sign out
            </Link>
          </p>
        </>
      );
    }
    return (
      <>
        {intro}
        <AcceptForm token={token} />
      </>
    );
  }

  return (
    <>
      {intro}
      <p className="mt-4 text-small text-subtle-foreground">
        Create your password to accept. Your account email is {invitation.email}.
      </p>
      <CreateAccountForm token={token} email={invitation.email} />
      <p className="mt-6 border-t border-border pt-4 text-small text-subtle-foreground">
        Already have an OrderPilot account?{" "}
        <Link
          href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}
          className="font-medium text-primary hover:underline"
        >
          Sign in to accept
        </Link>
      </p>
    </>
  );
}
