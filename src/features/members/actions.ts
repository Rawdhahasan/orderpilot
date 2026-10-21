"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ROLES } from "@/domain/auth/roles";
import { messageForDbError } from "@/lib/db-errors";
import { serverEnv } from "@/server/env";
import { sendMail } from "@/server/mail/send";
import { createAdminClient } from "@/server/privileged/admin";
import { createClient } from "@/server/supabase/server";

import { passwordSchema } from "../auth/schemas";
import { fieldErrorsFrom, type FormState } from "../form-state";

const role = z.enum(ROLES);

function membersPath(slug: string) {
  return `/o/${slug}/settings/members`;
}

/**
 * Invite someone (FR-ORG-03). The database checks the caller's role, MFA,
 * Owner-grant rules and rate limit; the token is then issued server-side and
 * emailed to the local Mailpit inbox only.
 */
export async function inviteMember(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      organizationId: z.uuid(),
      slug: z.string().min(1).max(40),
      email: z.email("Enter a valid email address.").max(320),
      role,
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { organizationId, slug, email, role: invitedRole } = parsed.data;

  const supabase = await createClient();
  const { data: invitationId, error } = await supabase.rpc("invite_member", {
    p_organization_id: organizationId,
    p_email: email,
    p_role: invitedRole,
  });
  if (error || !invitationId) return { ok: false, message: messageForDbError(error) };

  const admin = createAdminClient();
  const { data: token, error: tokenError } = await admin.rpc("issue_invitation_token", {
    p_invitation_id: invitationId,
  });
  if (tokenError || !token)
    return {
      ok: false,
      message: "The invitation was created but its link could not be issued. Try sending it again.",
    };

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single();
  const link = `${serverEnv().APP_BASE_URL}/invite/${token}`;
  try {
    await sendMail({
      to: email.trim().toLowerCase(),
      subject: `You're invited to ${org?.name ?? "a workspace"} on OrderPilot`,
      text: `You've been invited to join ${org?.name ?? "a workspace"} on OrderPilot.\n\nAccept the invitation: ${link}\n\nThe link works once and expires in 7 days.`,
      html: `<p>You've been invited to join <strong>${escapeHtml(org?.name ?? "a workspace")}</strong> on OrderPilot.</p><p><a href="${link}">Accept the invitation</a></p><p>The link works once and expires in 7 days.</p>`,
    });
  } catch {
    return {
      ok: false,
      message: "The invitation was created but the email could not be sent. Try sending it again.",
    };
  }
  revalidatePath(membersPath(slug));
  return { ok: true, message: `Invitation sent to ${email}.` };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function memberAction(
  form: FormData,
  run: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { code?: string; message?: string } | null }>,
  done: string,
): Promise<FormState> {
  const slug = z.string().min(1).max(40).safeParse(form.get("slug"));
  if (!slug.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { error } = await run(supabase);
  if (error) return { ok: false, message: messageForDbError(error) };
  revalidatePath(membersPath(slug.data));
  return { ok: true, message: done };
}

export async function revokeInvitation(_: FormState, form: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(form.get("invitationId"));
  if (!id.success) return { ok: false, message: "Choose an invitation." };
  return memberAction(
    form,
    (s) => s.rpc("revoke_invitation", { p_invitation_id: id.data }),
    "The invitation was withdrawn.",
  );
}

export async function changeMemberRole(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ memberId: z.uuid(), role })
    .safeParse({ memberId: form.get("memberId"), role: form.get("role") });
  if (!parsed.success) return { ok: false, message: "Choose a role." };
  return memberAction(
    form,
    (s) =>
      s.rpc("change_member_role", { p_member_id: parsed.data.memberId, p_role: parsed.data.role }),
    "The role was changed.",
  );
}

export async function setMemberStatus(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ memberId: z.uuid(), status: z.enum(["active", "suspended"]) })
    .safeParse({ memberId: form.get("memberId"), status: form.get("status") });
  if (!parsed.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  return memberAction(
    form,
    (s) =>
      s.rpc("set_member_status", {
        p_member_id: parsed.data.memberId,
        p_status: parsed.data.status,
      }),
    parsed.data.status === "suspended"
      ? "The member was suspended."
      : "The member was reactivated.",
  );
}

export async function removeMember(_: FormState, form: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(form.get("memberId"));
  if (!id.success) return { ok: false, message: "Choose a member." };
  return memberAction(
    form,
    (s) => s.rpc("remove_member", { p_member_id: id.data }),
    "The member was removed.",
  );
}

/** Accept as the signed-in user. The database checks the token, email, expiry and replay. */
export async function acceptInvitation(_: FormState, form: FormData): Promise<FormState> {
  const token = z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .safeParse(form.get("token"));
  if (!token.success)
    return { ok: false, message: messageForDbError({ message: "invitation_invalid" }) };
  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc("accept_invitation", { p_token: token.data });
  if (error || !slug) return { ok: false, message: messageForDbError(error) };
  redirect(`/o/${slug}/dashboard`);
}

/**
 * New person: create their account for the invited email, sign them in, then
 * accept. The email is proven by possession of the link sent to it.
 */
export async function createAccountAndAccept(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      token: z.string().regex(/^[0-9a-f]{64}$/),
      fullName: z.string().trim().min(1, "Enter your name.").max(120),
      password: passwordSchema,
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      path: ["confirm"],
      message: "The passwords do not match.",
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const admin = createAdminClient();
  const { data: rows } = await admin.rpc("describe_invitation", { p_token: parsed.data.token });
  const invitation = Array.isArray(rows) ? rows[0] : undefined;
  if (!invitation || invitation.state !== "pending") {
    return {
      ok: false,
      message: messageForDbError({
        message: `invitation_${invitation?.state === "accepted" ? "used" : (invitation?.state ?? "invalid")}`,
      }),
    };
  }

  const created = await admin.auth.admin.createUser({
    email: invitation.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (created.error) {
    if (created.error.code === "email_exists")
      return {
        ok: false,
        message:
          "An OrderPilot account already exists for this email. Sign in to accept the invitation.",
      };
    if (created.error.code === "weak_password")
      return { ok: false, fieldErrors: { password: "Choose a stronger password." } };
    return { ok: false, message: "We couldn't create your account. Try again." };
  }

  const supabase = await createClient();
  const signedIn = await supabase.auth.signInWithPassword({
    email: invitation.email,
    password: parsed.data.password,
  });
  if (signedIn.error)
    return { ok: false, message: "Your account was created. Sign in to accept the invitation." };
  const { data: slug, error } = await supabase.rpc("accept_invitation", {
    p_token: parsed.data.token,
  });
  if (error || !slug) return { ok: false, message: messageForDbError(error) };
  redirect(`/o/${slug}/dashboard`);
}
