"use client";

import { LogOut } from "lucide-react";
import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { changePassword, signOutEverywhere, updateProfile } from "@/features/account/actions";
import { signOut } from "@/features/auth/actions";
import { INITIAL_FORM_STATE } from "@/features/form-state";

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, action] = useActionState(updateProfile, INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage ok={state.ok} message={state.message} />
      <Field
        label="Name"
        name="fullName"
        defaultValue={fullName}
        autoComplete="name"
        required
        error={state.fieldErrors?.fullName}
      />
      <SubmitButton>Save name</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage ok={state.ok} message={state.message} />
      <Field
        label="Current password"
        name="current"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.current}
      />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        help="At least 12 characters."
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
      <SubmitButton>Change password</SubmitButton>
    </form>
  );
}

export function SignOutButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <form action={signOut}>
        <SubmitButton>
          <LogOut aria-hidden />
          Sign out
        </SubmitButton>
      </form>
      <form action={signOutEverywhere}>
        <SubmitButton variant="destructive">Sign out everywhere</SubmitButton>
      </form>
    </div>
  );
}
