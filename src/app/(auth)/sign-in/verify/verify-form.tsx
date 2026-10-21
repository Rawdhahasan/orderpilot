"use client";

import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { verifySignIn } from "@/features/auth/actions";
import { INITIAL_FORM_STATE } from "@/features/form-state";

export function VerifyForm({ next }: { next: string }) {
  const [state, action] = useActionState(verifySignIn, INITIAL_FORM_STATE);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage ok={state.ok} message={state.message} />
      <Field
        label="Authentication code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        error={state.fieldErrors?.code}
      />
      <SubmitButton variant="primary" size="lg" className="w-full">
        Verify
      </SubmitButton>
    </form>
  );
}
