"use client";

import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { resetPassword } from "@/features/auth/actions";
import { INITIAL_FORM_STATE } from "@/features/form-state";

export function ResetForm() {
  const [state, action] = useActionState(resetPassword, INITIAL_FORM_STATE);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <FormMessage ok={state.ok} message={state.message} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password}
      />
      <Field
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirm}
      />
      <SubmitButton variant="primary" size="lg" className="w-full">
        Save password
      </SubmitButton>
    </form>
  );
}
