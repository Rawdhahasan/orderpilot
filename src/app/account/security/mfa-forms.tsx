"use client";

import { useActionState, useState, useTransition } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import {
  removeMfaFactor,
  startMfaEnrollment,
  verifyMfaEnrollment,
  type Enrollment,
} from "@/features/account/actions";
import { INITIAL_FORM_STATE } from "@/features/form-state";

export function EnrollMfa() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, action] = useActionState(verifyMfaEnrollment, INITIAL_FORM_STATE);

  if (state.ok) return <FormMessage ok message={state.message} />;

  if (!enrollment || "error" in enrollment) {
    return (
      <div className="space-y-3">
        {enrollment && "error" in enrollment ? (
          <FormMessage ok={false} message={enrollment.error} />
        ) : null}
        <Button
          variant="primary"
          pending={starting}
          onClick={() => startTransition(async () => setEnrollment(await startMfaEnrollment()))}
        >
          Set up an authenticator app
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-small text-body-foreground">
        <li>Open an authenticator app on your phone.</li>
        <li>Scan the QR code, or enter the setup key.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-wrap items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI from the Auth server */}
        <img
          src={enrollment.qrCode}
          alt="QR code for your authenticator app"
          width={176}
          height={176}
          className="rounded-md border border-border bg-white p-2"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-caption font-medium text-subtle-foreground">Setup key</p>
          <code
            data-testid="mfa-secret"
            className="block break-all rounded-sm bg-neutral-50 px-2 py-1 font-mono text-small text-navy-900"
          >
            {enrollment.secret}
          </code>
        </div>
      </div>
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="factorId" value={enrollment.factorId} />
        <FormMessage ok={state.ok} message={state.message} />
        <Field
          label="Authentication code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          error={state.fieldErrors?.code}
        />
        <SubmitButton variant="primary">Turn on two-factor authentication</SubmitButton>
      </form>
    </div>
  );
}

export function RemoveFactor({ factorId }: { factorId: string }) {
  const [state, action] = useActionState(removeMfaFactor, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="factorId" value={factorId} />
      <SubmitButton size="sm">Remove</SubmitButton>
      <FormMessage ok={state.ok} message={state.message} />
    </form>
  );
}
