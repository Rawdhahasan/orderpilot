"use client";

import { useActionState, useState } from "react";

import { ExceptionItem, type ExceptionStatus } from "@/components/exceptions/exception-item";
import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import { EXCEPTION_TITLES, type ExceptionCode } from "@/domain/orders/validation";
import { INITIAL_FORM_STATE } from "@/features/form-state";

import { acknowledgeWarning, overrideException } from "./actions";

export type PanelException = {
  id: string;
  code: string;
  severity: "blocking" | "warning";
  overridable: boolean;
  status: "open" | "resolved" | "acknowledged" | "overridden";
  message: string;
  lineNo: number | null;
  resolution: string | null;
};

function OverrideForm({
  slug,
  intakeId,
  exceptionId,
  onDone,
}: {
  slug: string;
  intakeId: string;
  exceptionId: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState(overrideException, INITIAL_FORM_STATE);
  return (
    <ActionForm action={action} className="w-full space-y-2" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="intakeId" value={intakeId} />
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <FormMessage ok={state.ok} message={state.message} />
      <Field
        id={`override-${exceptionId}`}
        label="Reason for the override"
        name="reason"
        required
        error={state.fieldErrors?.reason}
      />
      <div className="flex gap-2">
        <SubmitButton size="sm" variant="primary">
          Record override
        </SubmitButton>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </ActionForm>
  );
}

function ExceptionActions({
  exception,
  slug,
  intakeId,
  canOverride,
  canAcknowledge,
}: {
  exception: PanelException;
  slug: string;
  intakeId: string;
  canOverride: boolean;
  canAcknowledge: boolean;
}) {
  const [overriding, setOverriding] = useState(false);
  const [ack, ackAction] = useActionState(acknowledgeWarning, INITIAL_FORM_STATE);
  if (overriding)
    return (
      <OverrideForm
        slug={slug}
        intakeId={intakeId}
        exceptionId={exception.id}
        onDone={() => setOverriding(false)}
      />
    );
  return (
    <>
      {canOverride && exception.overridable && exception.severity === "blocking" ? (
        <Button size="sm" onClick={() => setOverriding(true)}>
          Override
        </Button>
      ) : null}
      {canAcknowledge && exception.severity === "warning" ? (
        <ActionForm action={ackAction}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="intakeId" value={intakeId} />
          <input type="hidden" name="exceptionId" value={exception.id} />
          <SubmitButton size="sm" variant="ghost">
            Acknowledge
          </SubmitButton>
          {ack.message ? <FormMessage ok={ack.ok} message={ack.message} /> : null}
        </ActionForm>
      ) : null}
    </>
  );
}

/** Exceptions grouped by severity (FR-REV-07), with overrides (FR-APR-05). */
export function ExceptionsPanel({
  exceptions,
  slug,
  intakeId,
  canOverride,
  canAcknowledge,
  showClosed = true,
}: {
  exceptions: PanelException[];
  slug: string;
  intakeId: string;
  canOverride: boolean;
  canAcknowledge: boolean;
  showClosed?: boolean;
}) {
  const open = exceptions.filter((e) => e.status === "open");
  const blocking = open.filter((e) => e.severity === "blocking");
  const warnings = open.filter((e) => e.severity === "warning");
  const closed = exceptions.filter((e) => e.status !== "open");
  const item = (e: PanelException, status: ExceptionStatus) => (
    <ExceptionItem
      key={e.id}
      code={e.code}
      severity={e.severity}
      title={EXCEPTION_TITLES[e.code as ExceptionCode] ?? e.code}
      scope={e.lineNo ? `Line ${e.lineNo}` : "Header"}
      message={e.message}
      status={status}
      resolution={e.resolution ?? undefined}
      actions={
        <ExceptionActions
          exception={e}
          slug={slug}
          intakeId={intakeId}
          canOverride={canOverride}
          canAcknowledge={canAcknowledge}
        />
      }
    />
  );
  return (
    <section aria-labelledby="exceptions-heading" className="space-y-3">
      <h2 id="exceptions-heading" className="text-h3 font-semibold text-navy-900">
        Exceptions{" "}
        <span className="text-small font-normal text-subtle-foreground">
          {blocking.length} blocking · {warnings.length} warnings
        </span>
      </h2>
      {open.length === 0 ? (
        <p className="text-small text-subtle-foreground">No open exceptions.</p>
      ) : null}
      <div className="space-y-2" data-testid="open-exceptions">
        {blocking.map((e) => item(e, e.overridable ? "override_required" : "open"))}
        {warnings.map((e) => item(e, "open"))}
      </div>
      {showClosed && closed.length > 0 ? (
        <details className="text-small">
          <summary className="cursor-pointer text-subtle-foreground">
            {closed.length} resolved, acknowledged or overridden
          </summary>
          <div className="mt-2 space-y-2">
            {closed.map((e) => item(e, e.status as ExceptionStatus))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
