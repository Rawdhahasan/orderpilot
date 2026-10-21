"use client";

import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { signIn } from "@/features/auth/actions";
import { INITIAL_FORM_STATE } from "@/features/form-state";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, INITIAL_FORM_STATE);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage ok={state.ok} message={state.message} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton variant="primary" size="lg" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
