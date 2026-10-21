"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { safeNextPath } from "@/lib/safe-redirect";
import { serverEnv } from "@/server/env";
import { createClient } from "@/server/supabase/server";

import { fieldErrorsFrom, type FormState } from "../form-state";

import { passwordSchema } from "./schemas";

const email = z
  .email("Enter a valid email address.")
  .max(320)
  .transform((v) => v.trim().toLowerCase());

function isRateLimited(error: { status?: number; code?: string } | null) {
  return (
    error?.status === 429 ||
    error?.code === "over_request_rate_limit" ||
    error?.code === "over_email_send_rate_limit"
  );
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ email, password: z.string().min(1, "Enter your password.").max(200) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // One message for every failure, so it never reveals whether an account exists.
    return {
      ok: false,
      message: isRateLimited(error)
        ? "Too many attempts. Wait a few minutes and try again."
        : "Email or password is incorrect.",
    };
  }

  const next = safeNextPath(form.get("next"));
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.nextLevel === "aal2" && level.currentLevel !== "aal2") {
    redirect(`/sign-in/verify?next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export async function verifySignIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code."),
    })
    .safeParse({ code: form.get("code") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) return { ok: false, message: "No authenticator is set up for this account." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data.code,
  });
  if (error) {
    return {
      ok: false,
      message: isRateLimited(error)
        ? "Too many attempts. Wait a few minutes and try again."
        : "That code is not valid. Check your authenticator app and try again.",
    };
  }
  redirect(safeNextPath(form.get("next")));
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email }).safeParse({ email: form.get("email") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${serverEnv().APP_BASE_URL}/auth/callback?next=/reset-password`,
  });
  if (isRateLimited(error))
    return { ok: false, message: "Too many requests. Wait a few minutes and try again." };
  // The same answer whether or not the address has an account.
  return {
    ok: true,
    message:
      "If an account exists for that address, we've sent a link to reset the password. It expires in one hour.",
  };
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, {
      path: ["confirm"],
      message: "The passwords do not match.",
    })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, message: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "same_password"
          ? "Choose a password you have not used here before."
          : "We couldn't update your password. Request a new link and try again.",
    };
  }
  // Signing out everywhere ends any session an attacker may have had.
  await supabase.auth.signOut({ scope: "global" });
  redirect("/sign-in?reset=1");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in");
}
