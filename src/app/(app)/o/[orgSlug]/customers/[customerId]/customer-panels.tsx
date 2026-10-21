"use client";

import { useActionState, useState } from "react";

import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { addAlias, saveAddress, setCustomerStatus } from "@/features/customers/actions";
import { INITIAL_FORM_STATE } from "@/features/form-state";

type Scope = { organizationId: string; slug: string; customerId: string };

function Hidden({ scope, extra = {} }: { scope: Scope; extra?: Record<string, string> }) {
  return (
    <>
      {Object.entries({ ...scope, ...extra }).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

/** FR-CUST-04: hold with a reason, release, deactivate, reactivate. */
export function StatusActions({
  scope,
  status,
  canHold,
  canDeactivate,
}: {
  scope: Scope;
  status: "active" | "on_hold" | "inactive";
  canHold: boolean;
  canDeactivate: boolean;
}) {
  const [state, action] = useActionState(setCustomerStatus, INITIAL_FORM_STATE);
  const [holding, setHolding] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        {canHold && status === "active" && !holding ? (
          <Button size="sm" onClick={() => setHolding(true)}>
            Place on hold
          </Button>
        ) : null}
        {canHold && status === "on_hold" ? (
          <ActionForm action={action}>
            <Hidden scope={scope} extra={{ status: "active" }} />
            <SubmitButton size="sm">Release hold</SubmitButton>
          </ActionForm>
        ) : null}
        {canDeactivate && status !== "inactive" ? (
          <ActionForm action={action}>
            <Hidden scope={scope} extra={{ status: "inactive" }} />
            <SubmitButton size="sm" variant="ghost">
              Deactivate
            </SubmitButton>
          </ActionForm>
        ) : null}
        {canDeactivate && status === "inactive" ? (
          <ActionForm action={action}>
            <Hidden scope={scope} extra={{ status: "active" }} />
            <SubmitButton size="sm">Reactivate</SubmitButton>
          </ActionForm>
        ) : null}
      </div>
      {holding ? (
        <ActionForm
          action={action}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          noValidate
        >
          <Hidden scope={scope} extra={{ status: "on_hold" }} />
          <Field
            className="flex-1"
            label="Hold reason"
            name="reason"
            required
            error={state.fieldErrors?.reason}
            placeholder="Credit limit exceeded"
          />
          <SubmitButton size="sm" variant="primary">
            Place on hold
          </SubmitButton>
          <Button size="sm" variant="ghost" onClick={() => setHolding(false)}>
            Cancel
          </Button>
        </ActionForm>
      ) : null}
      <FormMessage ok={state.ok} message={state.message} />
    </div>
  );
}

export type AddressValues = {
  id: string;
  type: "billing" | "shipping";
  label: string | null;
  line1: string;
  line2: string | null;
  line3: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string;
  is_default: boolean;
};

/** FR-CUST-03: add or edit an address. */
export function AddressForm({
  scope,
  address,
  onDone,
}: {
  scope: Scope;
  address?: AddressValues;
  onDone?: () => void;
}) {
  const [state, action] = useActionState(saveAddress, INITIAL_FORM_STATE);
  const e = state.fieldErrors ?? {};
  const id = address?.id ?? "new";
  return (
    <ActionForm action={action} className="space-y-3" noValidate>
      <Hidden scope={scope} extra={{ addressId: address?.id ?? "" }} />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="grid gap-3 sm:grid-cols-2">
        <NativeSelect
          id={`type-${id}`}
          label="Type"
          name="type"
          defaultValue={address?.type ?? "shipping"}
          options={[
            { value: "shipping", label: "Shipping" },
            { value: "billing", label: "Billing" },
          ]}
        />
        <Field
          id={`label-${id}`}
          label="Label"
          name="label"
          defaultValue={address?.label ?? ""}
          placeholder="Main warehouse"
          error={e.label}
        />
        <Field
          id={`line1-${id}`}
          className="sm:col-span-2"
          label="Address line 1"
          name="line1"
          defaultValue={address?.line1}
          required
          error={e.line1}
        />
        <Field
          id={`line2-${id}`}
          label="Address line 2"
          name="line2"
          defaultValue={address?.line2 ?? ""}
        />
        <Field
          id={`line3-${id}`}
          label="Address line 3"
          name="line3"
          defaultValue={address?.line3 ?? ""}
        />
        <Field id={`city-${id}`} label="City" name="city" defaultValue={address?.city ?? ""} />
        <Field
          id={`region-${id}`}
          label="State or region"
          name="region"
          defaultValue={address?.region ?? ""}
        />
        <Field
          id={`postal-${id}`}
          label="Postal code"
          name="postal_code"
          defaultValue={address?.postal_code ?? ""}
        />
        <Field
          id={`country-${id}`}
          label="Country"
          name="country_code"
          defaultValue={address?.country_code ?? ""}
          required
          maxLength={2}
          help="Two letters, for example US or GB."
          error={e.country_code}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id={`default-${id}`} name="is_default" defaultChecked={address?.is_default} />
        <Label htmlFor={`default-${id}`}>Default address of this type</Label>
      </div>
      <div className="flex gap-2">
        <SubmitButton variant="primary" size="sm">
          {address ? "Save address" : "Add address"}
        </SubmitButton>
        {onDone ? (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Close
          </Button>
        ) : null}
      </div>
    </ActionForm>
  );
}

export function EditAddress({ scope, address }: { scope: Scope; address: AddressValues }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="mt-3 rounded-md border border-border p-3">
      <AddressForm scope={scope} address={address} onDone={() => setOpen(false)} />
    </div>
  ) : (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => setOpen(true)}
      aria-label={`Edit address ${address.label ?? address.line1}`}
    >
      Edit
    </Button>
  );
}

/** FR-CUST-05: map a part number. */
export function AliasForm({
  scope,
  products,
}: {
  scope: Scope;
  products: { id: string; label: string }[];
}) {
  const [state, action] = useActionState(addAlias, INITIAL_FORM_STATE);
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} className="space-y-3" noValidate>
      <Hidden scope={scope} />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Customer part number"
          name="customer_part_number"
          required
          error={e.customer_part_number}
        />
        <NativeSelect
          label="Our product"
          name="productId"
          options={[
            { value: "", label: "Choose a product" },
            ...products.map((p) => ({ value: p.id, label: p.label })),
          ]}
          error={e.productId}
        />
        <Field
          label="Their description"
          name="customer_description"
          error={e.customer_description}
        />
      </div>
      <SubmitButton size="sm" variant="primary">
        Map part number
      </SubmitButton>
    </ActionForm>
  );
}
