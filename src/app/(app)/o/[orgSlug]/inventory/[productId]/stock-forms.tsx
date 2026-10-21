"use client";

import { useActionState } from "react";

import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { INITIAL_FORM_STATE } from "@/features/form-state";
import { adjustStock, receiveStock } from "@/features/inventory/actions";

const REASONS = [
  { value: "", label: "Choose a reason" },
  { value: "cycle_count", label: "Cycle count" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "found", label: "Found" },
  { value: "correction", label: "Correction" },
  { value: "opening_balance", label: "Opening balance" },
];

export function ReceiveForm({
  slug,
  productId,
  unit,
}: {
  slug: string;
  productId: string;
  unit: string;
}) {
  const [state, action] = useActionState(receiveStock, INITIAL_FORM_STATE);
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} className="space-y-3" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="productId" value={productId} />
      <FormMessage ok={state.ok} message={state.message} />
      <Field
        id="receive-quantity"
        label={`Quantity (${unit})`}
        name="quantity"
        inputMode="decimal"
        required
        error={e.quantity}
      />
      <Field
        id="receive-reference"
        label="Reference"
        name="reference"
        placeholder="Delivery note number"
        error={e.reference}
      />
      <Field id="receive-note" label="Note" name="note" error={e.note} />
      <SubmitButton size="sm" variant="primary">
        Receive stock
      </SubmitButton>
    </ActionForm>
  );
}

export function AdjustForm({
  slug,
  productId,
  unit,
}: {
  slug: string;
  productId: string;
  unit: string;
}) {
  const [state, action] = useActionState(adjustStock, INITIAL_FORM_STATE);
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} className="space-y-3" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="productId" value={productId} />
      <FormMessage ok={state.ok} message={state.message} />
      <NativeSelect
        id="adjust-mode"
        label="Adjustment"
        name="mode"
        options={[
          { value: "count", label: "Set to a counted quantity" },
          { value: "delta", label: "Add or remove a quantity (use − to remove)" },
        ]}
      />
      <Field
        id="adjust-quantity"
        label={`Quantity (${unit})`}
        name="quantity"
        inputMode="decimal"
        required
        error={e.quantity}
      />
      <NativeSelect
        id="adjust-reason"
        label="Reason"
        name="reason"
        options={REASONS}
        error={e.reason}
      />
      <Field id="adjust-note" label="Note" name="note" error={e.note} />
      <SubmitButton size="sm">Adjust stock</SubmitButton>
    </ActionForm>
  );
}
