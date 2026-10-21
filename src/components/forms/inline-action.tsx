"use client";

import { useActionState, type ComponentProps } from "react";

import { FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { INITIAL_FORM_STATE, type FormState } from "@/features/form-state";

/** A one-button form for a single server action (archive, reactivate, …), with its result message. */
export function InlineAction({
  action,
  fields,
  label,
  variant = "secondary",
  size = "sm",
  ariaLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  label: string;
  variant?: ComponentProps<typeof SubmitButton>["variant"];
  size?: ComponentProps<typeof SubmitButton>["size"];
  ariaLabel?: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_FORM_STATE);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1.5">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} size={size} aria-label={ariaLabel}>
        {label}
      </SubmitButton>
      {state.message ? <FormMessage ok={state.ok} message={state.message} /> : null}
    </form>
  );
}
