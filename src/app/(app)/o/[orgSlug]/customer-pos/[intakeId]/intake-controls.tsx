"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/features/form-state";
import { refreshIntake, retryExtraction, switchToManualEntry } from "@/features/intake/actions";
import { assignToMe, cancelIntake, submitForApproval } from "@/features/review/actions";

type Scope = { slug: string; intakeId: string; version: number };

function Hidden({ scope }: { scope: Scope }) {
  return (
    <>
      <input type="hidden" name="slug" value={scope.slug} />
      <input type="hidden" name="intakeId" value={scope.intakeId} />
      <input type="hidden" name="version" value={scope.version} />
    </>
  );
}

/** While extracting: polls (and re-triggers the worker) until the status changes. */
export function ExtractionPoller({ intakeId }: { intakeId: string }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const { status } = await refreshIntake(intakeId);
      if (stopped) return;
      if (status && status !== "extracting") router.refresh();
      else setTimeout(tick, 2500);
    };
    const first = setTimeout(tick, 1200);
    return () => {
      stopped = true;
      clearTimeout(first);
    };
  }, [intakeId, router]);
  return null;
}

export function FailedActions({ scope }: { scope: Scope }) {
  const [retry, retryAction] = useActionState(retryExtraction, INITIAL_FORM_STATE);
  const [manual, manualAction] = useActionState(switchToManualEntry, INITIAL_FORM_STATE);
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionForm action={retryAction}>
        <Hidden scope={scope} />
        <SubmitButton variant="primary">Retry extraction</SubmitButton>
      </ActionForm>
      <ActionForm action={manualAction}>
        <Hidden scope={scope} />
        <SubmitButton>Enter manually</SubmitButton>
      </ActionForm>
      <FormMessage ok={retry.ok || manual.ok} message={retry.message ?? manual.message} />
    </div>
  );
}

export function AssignButton({ scope }: { scope: Scope }) {
  const [state, action] = useActionState(assignToMe, INITIAL_FORM_STATE);
  return (
    <ActionForm action={action} className="inline-flex items-center gap-2">
      <Hidden scope={scope} />
      <SubmitButton size="sm" variant="ghost">
        Assign to me
      </SubmitButton>
      {state.message && !state.ok ? <FormMessage ok={false} message={state.message} /> : null}
    </ActionForm>
  );
}

export function SubmitPanel({
  scope,
  blocking,
  overrideRequired,
}: {
  scope: Scope;
  blocking: number;
  overrideRequired: number;
}) {
  const [state, action] = useActionState(submitForApproval, INITIAL_FORM_STATE);
  return (
    <ActionForm action={action} className="space-y-3" noValidate>
      <Hidden scope={scope} />
      <FormMessage ok={state.ok} message={state.message} />
      <Field label="Note for the approver (optional)" name="note" />
      {overrideRequired > 0 ? (
        <p className="text-small text-warning-800">
          {overrideRequired} exception{overrideRequired === 1 ? "" : "s"} will need an approver
          override.
        </p>
      ) : null}
      <SubmitButton variant="primary" disabled={blocking > 0}>
        Submit for approval
      </SubmitButton>
      {blocking > 0 ? (
        <p className="text-small text-subtle-foreground">
          Resolve the blocking exceptions above to submit.
        </p>
      ) : null}
    </ActionForm>
  );
}

export function CancelPanel({ scope }: { scope: Scope }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(cancelIntake, INITIAL_FORM_STATE);
  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Cancel this PO
      </Button>
    );
  }
  return (
    <ActionForm
      action={action}
      className="space-y-3 rounded-md border border-border p-3"
      noValidate
    >
      <Hidden scope={scope} />
      <FormMessage ok={state.ok} message={state.message} />
      <NativeSelect
        label="Why is it cancelled?"
        name="reason"
        error={state.fieldErrors?.reason}
        options={[
          { value: "", label: "Choose a reason" },
          { value: "duplicate", label: "Duplicate" },
          { value: "not_a_purchase_order", label: "Not a purchase order" },
          { value: "sent_in_error", label: "Sent in error" },
          { value: "other", label: "Other" },
        ]}
      />
      <Field label="Note" name="note" error={state.fieldErrors?.note} />
      <div className="flex gap-2">
        <SubmitButton variant="destructive">Cancel PO</SubmitButton>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </ActionForm>
  );
}
