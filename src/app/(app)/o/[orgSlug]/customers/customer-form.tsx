"use client";

import { useActionState } from "react";

import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect, TextArea } from "@/components/forms/native-select";
import { createCustomer, updateCustomer } from "@/features/customers/actions";
import { INITIAL_FORM_STATE } from "@/features/form-state";

export type CustomerValues = {
  id?: string;
  name: string;
  account_number: string | null;
  email: string | null;
  phone: string | null;
  payment_terms: string | null;
  date_order_hint: string;
  notes: string | null;
};

const DATE_HINTS = [
  { value: "unknown", label: "Not known" },
  { value: "mdy", label: "Month/day/year (US)" },
  { value: "dmy", label: "Day/month/year" },
  { value: "ymd", label: "Year-month-day" },
];

export function CustomerForm({
  organizationId,
  slug,
  values,
  readOnly = false,
}: {
  organizationId: string;
  slug: string;
  values?: CustomerValues;
  readOnly?: boolean;
}) {
  const editing = Boolean(values?.id);
  const [state, action] = useActionState(
    editing ? updateCustomer : createCustomer,
    INITIAL_FORM_STATE,
  );
  const e = state.fieldErrors ?? {};
  const similar = (state as { similar?: string[] }).similar;
  return (
    <ActionForm action={action} className="space-y-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="slug" value={slug} />
      {values?.id ? <input type="hidden" name="customerId" value={values.id} /> : null}
      <FormMessage ok={state.ok} message={state.message} />
      {similar?.length ? (
        <div className="rounded-md border border-warning-200 bg-warning-50 p-3 text-small text-warning-800">
          <p className="font-medium">Existing customers with similar names:</p>
          <ul className="mt-1 list-disc pl-5">
            {similar.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <input type="hidden" name="confirmDuplicate" value="yes" />
        </div>
      ) : null}
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field
          className="sm:col-span-2"
          label="Name"
          name="name"
          defaultValue={values?.name}
          required
          error={e.name}
        />
        <Field
          label="Account number"
          name="account_number"
          defaultValue={values?.account_number ?? ""}
          error={e.account_number}
          help="Unique in this workspace."
        />
        <Field
          label="Payment terms"
          name="payment_terms"
          defaultValue={values?.payment_terms ?? ""}
          error={e.payment_terms}
          placeholder="Net 30"
        />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={values?.email ?? ""}
          error={e.email}
        />
        <Field label="Phone" name="phone" defaultValue={values?.phone ?? ""} error={e.phone} />
        <NativeSelect
          label="Date format on their POs"
          name="date_order_hint"
          defaultValue={values?.date_order_hint ?? "unknown"}
          options={DATE_HINTS}
          help="Helps resolve dates like 03/04/2026."
        />
        <TextArea
          className="sm:col-span-2"
          label="Notes"
          name="notes"
          defaultValue={values?.notes ?? ""}
          error={e.notes}
        />
      </fieldset>
      {readOnly ? null : (
        <SubmitButton variant="primary">
          {editing ? "Save customer" : similar?.length ? "Create anyway" : "Create customer"}
        </SubmitButton>
      )}
    </ActionForm>
  );
}
