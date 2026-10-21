"use client";

import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { INITIAL_FORM_STATE } from "@/features/form-state";
import { updateWorkspaceSettings } from "@/features/settings/actions";

export type SettingsValues = {
  id: string;
  slug: string;
  name: string;
  sales_order_prefix: string;
  timezone: string;
  price_tolerance_pct: number;
  confidence_threshold: number;
  duplicate_lookback_days: number;
  require_independent_approval: boolean;
};

export function SettingsForm({ values, isOwner }: { values: SettingsValues; isOwner: boolean }) {
  const [state, action] = useActionState(updateWorkspaceSettings, INITIAL_FORM_STATE);
  const e = state.fieldErrors ?? {};
  // Turning independent approval off is Owner-only (D-05); the database enforces it too.
  const lockApproval = !isOwner && values.require_independent_approval;
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="organizationId" value={values.id} />
      <input type="hidden" name="slug" value={values.slug} />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Workspace name"
          name="name"
          defaultValue={values.name}
          required
          error={e.name}
        />
        <Field
          label="Time zone"
          name="timezone"
          defaultValue={values.timezone}
          required
          help="For example Europe/London or America/Chicago."
          error={e.timezone}
        />
        <Field
          label="Sales order prefix"
          name="sales_order_prefix"
          defaultValue={values.sales_order_prefix}
          required
          help="1–6 capital letters or digits."
          error={e.sales_order_prefix}
        />
        <Field
          label="Duplicate check window (days)"
          name="duplicate_lookback_days"
          type="number"
          min={1}
          max={365}
          defaultValue={values.duplicate_lookback_days}
          error={e.duplicate_lookback_days}
        />
        <Field
          label="Price tolerance (%)"
          name="price_tolerance_pct"
          type="number"
          min={0}
          max={100}
          step="0.01"
          defaultValue={values.price_tolerance_pct}
          error={e.price_tolerance_pct}
        />
        <Field
          label="Extraction confidence threshold (%)"
          name="confidence_threshold"
          type="number"
          min={0}
          max={100}
          step="1"
          defaultValue={Math.round(values.confidence_threshold * 100)}
          error={e.confidence_threshold}
        />
      </div>
      <div className="flex items-start gap-3 rounded-md border border-border p-3">
        {lockApproval ? (
          <input type="hidden" name="require_independent_approval" value="on" />
        ) : null}
        <Switch
          id="require_independent_approval"
          name={lockApproval ? undefined : "require_independent_approval"}
          defaultChecked={values.require_independent_approval}
          disabled={lockApproval}
          aria-describedby="require_independent_approval-help"
        />
        <div>
          <Label htmlFor="require_independent_approval">Require independent approval</Label>
          <p
            id="require_independent_approval-help"
            className="mt-0.5 text-caption text-subtle-foreground"
          >
            The person who submits a customer PO cannot also approve it.
            {lockApproval ? " Only an Owner can turn this off." : null}
          </p>
        </div>
      </div>
      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}
