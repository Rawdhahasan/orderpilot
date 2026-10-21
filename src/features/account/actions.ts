"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { serverEnv } from "@/server/env";
import { createClient } from "@/server/supabase/server";

import { passwordSchema } from "../auth/schemas";
import { fieldErrorsFrom, type FormState } from "../form-state";

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      fullName: z
        .string()
        .trim()
        .min(1, "Enter your name.")
        .max(120, "Use at most 120 characters."),
    })
    .safeParse({ fullName: form.get("fullName") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in?next=/account");
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", data.user.id);
  if (error) return { ok: false, message: "We couldn't save your name. Try again." };
  revalidatePath("/account");
  return { ok: true, message: "Your name was updated." };
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      current: z.string().min(1, "Enter your current password."),
      password: passwordSchema,
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      path: ["confirm"],
      message: "The passwords do not match.",
    })
    .refine((v) => v.password !== v.current, {
      path: ["password"],
      message: "Choose a new password.",
    })
    .safeParse({
      current: form.get("current"),
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) redirect("/sign-in?next=/account");

  // Check the current password on a separate, cookie-less client so the
  // signed-in session (and its MFA level) is not replaced.
  const env = serverEnv();
  const checker = createPlainClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const check = await checker.auth.signInWithPassword({
    email: data.user.email,
    password: parsed.data.current,
  });
  if (check.error)
    return { ok: false, fieldErrors: { current: "Your current password is incorrect." } };
  await checker.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "reauthentication_needed")
      return {
        ok: false,
        message: "For your security, sign out and sign in again, then change your password.",
      };
    if (error.code === "insufficient_aal")
      return { ok: false, message: "Verify with your authenticator app first, then try again." };
    return { ok: false, message: "We couldn't change your password. Try again." };
  }
  // End every other session (other devices).
  await supabase.auth.signOut({ scope: "others" });
  return {
    ok: true,
    message: "Your password was changed and your other sessions were signed out.",
  };
}

export async function signOutEverywhere(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/sign-in");
}

export type Enrollment = { factorId: string; qrCode: string; secret: string } | { error: string };

/** Starts TOTP enrollment. Abandoned, unverified factors are cleared first. */
export async function startMfaEnrollment(): Promise<Enrollment> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/sign-in?next=/account/security");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified")
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  if ((factors?.totp ?? []).some((f) => f.status === "verified"))
    return { error: "An authenticator is already set up. Remove it first to replace it." };
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Authenticator app",
  });
  if (error || !data) return { error: "We couldn't start setup. Try again." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyMfaEnrollment(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      factorId: z.uuid(),
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code."),
    })
    .safeParse({ factorId: form.get("factorId"), code: form.get("code") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error)
    return {
      ok: false,
      fieldErrors: { code: "That code is not valid. Check the time on your phone and try again." },
    };
  revalidatePath("/account/security");
  return { ok: true, message: "Two-factor authentication is on." };
}

export async function removeMfaFactor(_: FormState, form: FormData): Promise<FormState> {
  const factorId = z.uuid().safeParse(form.get("factorId"));
  if (!factorId.success) return { ok: false, message: "Choose an authenticator to remove." };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/sign-in?next=/account/security");
  const { data: profile } = await supabase
    .from("profiles")
    .select("mfa_required")
    .eq("id", user.user.id)
    .single();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");
  if (profile?.mfa_required && verified.length <= 1) {
    return {
      ok: false,
      message:
        "Owners and Admins must keep two-factor authentication. Set up a new authenticator before removing this one, or ask a workspace Owner to change your role.",
    };
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factorId.data });
  if (error)
    return {
      ok: false,
      message:
        error.code === "insufficient_aal"
          ? "Verify with your authenticator app first, then try again."
          : "We couldn't remove the authenticator. Try again.",
    };
  revalidatePath("/account/security");
  return { ok: true, message: "The authenticator was removed." };
}
