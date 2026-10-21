"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import {
  approveIntake,
  rejectIntake,
  requestChanges,
  type ApproveResult,
  type Shortfall,
} from "@/features/approval/actions";
import { INITIAL_FORM_STATE } from "@/features/form-state";

type Scope = { slug: string; intakeId: string; version: number };

function ReasonForm({
  scope,
  kind,
  onCancel,
}: {
  scope: Scope;
  kind: "changes" | "reject";
  onCancel: () => void;
}) {
  const [state, action] = useActionState(
    kind === "changes" ? requestChanges : rejectIntake,
    INITIAL_FORM_STATE,
  );
  return (
    <ActionForm
      action={action}
      className="space-y-3 rounded-md border border-border p-3"
      noValidate
    >
      <input type="hidden" name="slug" value={scope.slug} />
      <input type="hidden" name="intakeId" value={scope.intakeId} />
      <input type="hidden" name="version" value={scope.version} />
      <FormMessage ok={state.ok} message={state.message} />
      <Field
        label={kind === "changes" ? "What should the reviewer change?" : "Why is it rejected?"}
        name="reason"
        required
        error={state.fieldErrors?.reason}
      />
      <div className="flex gap-2">
        <SubmitButton variant={kind === "reject" ? "destructive" : "primary"}>
          {kind === "changes" ? "Request changes" : "Reject"}
        </SubmitButton>
        <Button variant="ghost" onClick={onCancel}>
          Back
        </Button>
      </div>
    </ActionForm>
  );
}

/** FR-APR-03, FR-APR-06, FR-APR-08. */
export function DecisionPanel({
  scope,
  canApprove,
  blockedReason,
  productNames,
}: {
  scope: Scope;
  canApprove: boolean;
  blockedReason: string | null;
  productNames: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ApproveResult | null>(null);
  const [choices, setChoices] = useState<Record<string, "backorder" | "changes">>({});
  const [mode, setMode] = useState<"none" | "changes" | "reject">("none");

  const approve = (decisions: Record<string, "backorder"> = {}) =>
    start(async () => setResult(await approveIntake({ ...scope, decisions })));

  if (result?.kind === "approved") {
    return (
      <p role="status" className="rounded-md bg-success-50 px-3 py-2 text-body text-success-800">
        {result.alreadyApproved ? "This order was already approved as " : "Approved. Sales order "}
        <Link
          href={`/o/${scope.slug}/sales-orders/${result.salesOrderId}`}
          className="font-mono font-semibold underline"
        >
          {result.orderNumber}
        </Link>
        {result.alreadyApproved ? "." : " was created."}
      </p>
    );
  }
  if (mode !== "none")
    return <ReasonForm scope={scope} kind={mode} onCancel={() => setMode("none")} />;

  if (result?.kind === "needs_stock_decision") {
    const shortfalls: Shortfall[] = result.shortfalls;
    const allChosen = shortfalls.every((s) => choices[s.line_id]);
    const anyChanges = shortfalls.some((s) => choices[s.line_id] === "changes");
    return (
      <div
        className="space-y-3 rounded-md border border-warning-200 bg-warning-50 p-3"
        role="group"
        aria-labelledby="stock-heading"
      >
        <p id="stock-heading" className="font-medium text-navy-900">
          Not enough stock for {shortfalls.length} line{shortfalls.length === 1 ? "" : "s"}
        </p>
        {shortfalls.map((s) => (
          <fieldset key={s.line_id} className="space-y-1 rounded-md bg-white p-2 text-small">
            <legend className="font-medium text-navy-900">
              Line {s.line_no}: {productNames[s.product_id] ?? "product"} · ordered {s.requested},
              can reserve {s.available}
            </legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`d-${s.line_id}`}
                checked={choices[s.line_id] === "backorder"}
                onChange={() => setChoices((c) => ({ ...c, [s.line_id]: "backorder" }))}
              />
              Reserve {s.available} and backorder {Number(s.requested) - Number(s.available)}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`d-${s.line_id}`}
                checked={choices[s.line_id] === "changes"}
                onChange={() => setChoices((c) => ({ ...c, [s.line_id]: "changes" }))}
              />
              Send back for changes
            </label>
          </fieldset>
        ))}
        <div className="flex gap-2">
          {anyChanges ? (
            <Button variant="primary" disabled={!allChosen} onClick={() => setMode("changes")}>
              Continue to request changes
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!allChosen}
              pending={pending}
              onClick={() =>
                approve(
                  Object.fromEntries(shortfalls.map((s) => [s.line_id, "backorder" as const])),
                )
              }
            >
              Approve with backorders
            </Button>
          )}
          <Button variant="ghost" onClick={() => setResult(null)}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {result?.kind === "refused" ? <FormMessage ok={false} message={result.message} /> : null}
      {blockedReason ? <p className="text-small text-warning-800">{blockedReason}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={!canApprove}
          pending={pending}
          onClick={() => approve()}
        >
          Approve
        </Button>
        <Button onClick={() => setMode("changes")}>Request changes</Button>
        <Button variant="ghost" onClick={() => setMode("reject")}>
          Reject
        </Button>
      </div>
    </div>
  );
}
