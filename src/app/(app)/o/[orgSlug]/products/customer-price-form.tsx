"use client";

import { useActionState } from "react";

import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { INITIAL_FORM_STATE } from "@/features/form-state";
import { addCustomerPrice } from "@/features/products/actions";

export function CustomerPriceForm({
  organizationId,
  slug,
  productId,
  customers,
}: {
  organizationId: string;
  slug: string;
  productId: string;
  customers: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(addCustomerPrice, INITIAL_FORM_STATE);
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} className="space-y-3" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="productId" value={productId} />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="grid gap-3 sm:grid-cols-4">
        <NativeSelect
          label="Customer"
          name="customerId"
          options={[
            { value: "", label: "Choose a customer" },
            ...customers.map((c) => ({ value: c.id, label: c.name })),
          ]}
          error={e.customerId}
        />
        <Field label="Price" name="unit_price" inputMode="decimal" required error={e.unit_price} />
        <Field label="Valid from" name="valid_from" type="date" required error={e.valid_from} />
        <Field label="Valid to" name="valid_to" type="date" error={e.valid_to} />
      </div>
      <SubmitButton size="sm" variant="primary">
        Add customer price
      </SubmitButton>
    </ActionForm>
  );
}
