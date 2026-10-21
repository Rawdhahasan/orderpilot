"use client";

import { useActionState } from "react";

import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect, TextArea } from "@/components/forms/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { INITIAL_FORM_STATE } from "@/features/form-state";
import { changeListPrice, createProduct, updateProduct } from "@/features/products/actions";

export type ProductValues = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  selling_uom: string;
  quantity_decimals: number;
  gtin: string | null;
  reorder_point: number | null;
};

export function ProductForm({
  organizationId,
  slug,
  uoms,
  values,
  readOnly = false,
}: {
  organizationId: string;
  slug: string;
  uoms: { code: string; name: string }[];
  values?: ProductValues;
  readOnly?: boolean;
}) {
  const [state, action] = useActionState(
    values ? updateProduct : createProduct,
    INITIAL_FORM_STATE,
  );
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} className="space-y-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="slug" value={slug} />
      {values ? <input type="hidden" name="productId" value={values.id} /> : null}
      <FormMessage ok={state.ok} message={state.message} />
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field label="SKU" name="sku" defaultValue={values?.sku} required error={e.sku} />
        <Field label="Name" name="name" defaultValue={values?.name} required error={e.name} />
        <NativeSelect
          label="Selling unit"
          name="selling_uom"
          defaultValue={values?.selling_uom ?? "EA"}
          options={uoms.map((u) => ({ value: u.code, label: `${u.code} · ${u.name}` }))}
        />
        <NativeSelect
          label="Allowed quantity decimals"
          name="quantity_decimals"
          defaultValue={String(values?.quantity_decimals ?? 0)}
          options={[0, 1, 2, 3].map((n) => ({
            value: String(n),
            label: n === 0 ? "Whole units only" : `${n} decimal place${n > 1 ? "s" : ""}`,
          }))}
        />
        <Field
          label="GTIN"
          name="gtin"
          defaultValue={values?.gtin ?? ""}
          error={e.gtin}
          help="Optional barcode number; the check digit is verified."
          inputMode="numeric"
        />
        <Field
          label="Reorder point"
          name="reorder_point"
          defaultValue={values?.reorder_point ?? ""}
          error={e.reorder_point}
          inputMode="decimal"
        />
        {values ? null : (
          <>
            <Field
              label="List price"
              name="list_price"
              required
              error={e.list_price}
              inputMode="decimal"
              help="Later changes are made by Owners and Admins and audited."
            />
            <div className="flex items-center gap-2 self-center">
              <Checkbox id="track_inventory" name="track_inventory" defaultChecked />
              <Label htmlFor="track_inventory">Track inventory for this product</Label>
            </div>
          </>
        )}
        <TextArea
          className="sm:col-span-2"
          label="Description"
          name="description"
          defaultValue={values?.description ?? ""}
          error={e.description}
        />
      </fieldset>
      {readOnly ? null : (
        <SubmitButton variant="primary">{values ? "Save product" : "Create product"}</SubmitButton>
      )}
    </ActionForm>
  );
}

export function PriceForm({
  organizationId,
  slug,
  productId,
}: {
  organizationId: string;
  slug: string;
  productId: string;
}) {
  const [state, action] = useActionState(changeListPrice, INITIAL_FORM_STATE);
  return (
    <ActionForm action={action} className="space-y-3" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="productId" value={productId} />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="New list price"
          name="list_price"
          inputMode="decimal"
          required
          error={state.fieldErrors?.list_price}
        />
        <Field label="Reason" name="reason" placeholder="Supplier price increase" />
      </div>
      <SubmitButton size="sm" variant="primary">
        Change price
      </SubmitButton>
    </ActionForm>
  );
}
