"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { requestPasswordReset } from "@/features/auth/actions";
import { INITIAL_FORM_STATE } from "@/features/form-state";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, INITIAL_FORM_STATE);
  return (
    <>
      <h1 className="text-h1 font-semibold text-navy-900">Reset your password</h1>
      <p className="mt-1 text-body text-subtle-foreground">
        We&apos;ll email you a link to choose a new password.
      </p>
      <form action={action} className="mt-6 space-y-4" noValidate>
        <FormMessage ok={state.ok} message={state.message} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={state.fieldErrors?.email}
        />
        <SubmitButton variant="primary" size="lg" className="w-full">
          Send reset link
        </SubmitButton>
      </form>
      <p className="mt-6 text-small">
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
