"use client";

import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { INITIAL_FORM_STATE } from "@/features/form-state";
import { acceptInvitation, createAccountAndAccept } from "@/features/members/actions";

export function AcceptForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitation, INITIAL_FORM_STATE);
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage ok={state.ok} message={state.message} />
      <SubmitButton variant="primary" size="lg" className="w-full">
        Accept invitation
      </SubmitButton>
    </form>
  );
}

export function CreateAccountForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(createAccountAndAccept, INITIAL_FORM_STATE);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormMessage ok={state.ok} message={state.message} />
      <Field label="Email" name="email-display" value={email} readOnly autoComplete="username" />
      <Field
        label="Your name"
        name="fullName"
        autoComplete="name"
        required
        error={state.fieldErrors?.fullName}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        help="At least 12 characters."
        error={state.fieldErrors?.password}
      />
      <Field
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirm}
      />
      <SubmitButton variant="primary" size="lg" className="w-full">
        Create account and join
      </SubmitButton>
    </form>
  );
}
