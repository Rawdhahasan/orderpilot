"use client";

import { useActionState, useState } from "react";

import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/features/form-state";
import { cancelOrder, fulfilOrder, markBackorderHandled } from "@/features/sales/actions";

type Scope = { slug: string; salesOrderId: string; version: number };

function Hidden({ scope }: { scope: Scope }) {
  return (
    <>
      <input type="hidden" name="slug" value={scope.slug} />
      <input type="hidden" name="salesOrderId" value={scope.salesOrderId} />
      <input type="hidden" name="version" value={scope.version} />
    </>
  );
}

export function OrderActions({
  scope,
  canFulfil,
  canCancel,
  backordered,
}: {
  scope: Scope;
  canFulfil: boolean;
  canCancel: boolean;
  backordered: boolean;
}) {
  const [fulfil, fulfilAction] = useActionState(fulfilOrder, INITIAL_FORM_STATE);
  const [cancel, cancelAction] = useActionState(cancelOrder, INITIAL_FORM_STATE);
  const [cancelling, setCancelling] = useState(false);
  return (
    <div className="space-y-3">
      <FormMessage ok={fulfil.ok} message={fulfil.message} />
      <FormMessage ok={cancel.ok} message={cancel.message} />
      {canFulfil ? (
        <ActionForm action={fulfilAction} className="space-y-1">
          <Hidden scope={scope} />
          <SubmitButton variant="primary">Mark fulfilled</SubmitButton>
          <p className="text-caption text-subtle-foreground">
            Issues the reserved quantities from stock.
            {backordered ? " Backordered quantities are not fulfilled through OrderPilot." : ""}
          </p>
        </ActionForm>
      ) : null}
      {canCancel ? (
        cancelling ? (
          <ActionForm
            action={cancelAction}
            className="space-y-2 rounded-md border border-border p-3"
            noValidate
          >
            <Hidden scope={scope} />
            <Field
              label="Reason for cancelling"
              name="reason"
              required
              error={cancel.fieldErrors?.reason}
            />
            <div className="flex gap-2">
              <SubmitButton variant="destructive">Cancel order</SubmitButton>
              <Button variant="ghost" onClick={() => setCancelling(false)}>
                Keep it
              </Button>
            </div>
          </ActionForm>
        ) : (
          <Button variant="ghost" onClick={() => setCancelling(true)}>
            Cancel order
          </Button>
        )
      ) : null}
    </div>
  );
}

export function HandledExternally({
  slug,
  salesOrderId,
  lineId,
  lineNo,
}: {
  slug: string;
  salesOrderId: string;
  lineId: string;
  lineNo: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(markBackorderHandled, INITIAL_FORM_STATE);
  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={`Mark backorder on line ${lineNo} handled externally`}
      >
        Mark handled externally
      </Button>
    );
  }
  return (
    <ActionForm action={action} className="mt-2 space-y-2" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="salesOrderId" value={salesOrderId} />
      <input type="hidden" name="lineId" value={lineId} />
      <FormMessage ok={state.ok} message={state.message} />
      <Field
        id={`handled-${lineId}`}
        label="How was it handled?"
        name="reason"
        required
        error={state.fieldErrors?.reason}
      />
      <p className="text-caption text-subtle-foreground">
        This records the decision only. Stock is not changed and it is not shown as fulfilled.
      </p>
      <div className="flex gap-2">
        <SubmitButton size="sm" variant="primary">
          Record
        </SubmitButton>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </ActionForm>
  );
}
