"use client";

import { Check } from "lucide-react";
import type { Dispatch, KeyboardEvent } from "react";

import {
  ProvenanceMarker,
  isUnconfirmedSuggestion,
  provenanceFieldClass,
} from "@/components/provenance/provenance-marker";
import { CustomerStatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";

import { CUSTOMERS, customerById } from "../fixtures";
import { fmt } from "../format";

import type { FieldState, ReviewState } from "./model";
import type { ReviewAction } from "./reducer";

type Props = {
  state: ReviewState;
  dispatch: Dispatch<ReviewAction>;
  editable: boolean;
  actor: string;
  onFocusPage: (page: number | undefined) => void;
};

function displayValue(field: FieldState): string {
  if (!field.value) return "";
  if (field.key.endsWith("_date") || field.key === "po_date") return fmt.date(field.value);
  return field.value;
}

export function HeaderPanel({ state, dispatch, editable, actor, onFocusPage }: Props) {
  const customer = customerById(state.customerId);

  return (
    <section aria-labelledby="header-heading" className="space-y-4">
      <h2
        id="header-heading"
        className="text-caption font-medium tracking-[0.04em] text-subtle-foreground uppercase"
      >
        Order
      </h2>

      {/* Customer */}
      <div
        id="field-customer"
        tabIndex={-1}
        data-unconfirmed={!state.customerConfirmed || undefined}
        className={cn(
          "rounded-lg border p-3 outline-none",
          state.customerConfirmed ? "border-border bg-white" : "border-ai-500/40 bg-ai-50",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-caption font-medium text-subtle-foreground">Customer</p>
            {customer ? (
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-body font-medium text-navy-900">
                {customer.name}
                <span className="font-mono text-caption font-normal text-subtle-foreground">
                  {customer.accountNumber}
                </span>
                <CustomerStatusBadge status={customer.status} />
              </p>
            ) : (
              <p className="mt-0.5 text-body text-subtle-foreground">
                Not identified on the document
              </p>
            )}
            {!state.customerConfirmed && state.customerReason ? (
              <p className="mt-1 text-small text-ai-800">Suggested: {state.customerReason}</p>
            ) : null}
            {state.customerConfirmed ? (
              <p className="mt-1 inline-flex items-center gap-1 text-small text-success-700">
                <Check aria-hidden className="size-3.5" /> Confirmed by {actor}
              </p>
            ) : null}
          </div>
          {editable ? (
            <div className="flex flex-wrap items-center gap-2">
              {!state.customerConfirmed && customer ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => dispatch({ type: "confirmCustomer" })}
                >
                  <Check aria-hidden />
                  Confirm customer
                </Button>
              ) : null}
              <Select
                value={state.customerConfirmed ? (state.customerId ?? undefined) : undefined}
                onValueChange={(id) => dispatch({ type: "chooseCustomer", customerId: id })}
              >
                <SelectTrigger className="h-8 w-44 text-small" aria-label="Choose another customer">
                  <SelectValue placeholder={customer ? "Change customer" : "Choose customer"} />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMERS.filter((c) => c.status !== "inactive").map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </div>

      {/* Header fields */}
      <div className="grid gap-3 sm:grid-cols-2">
        {state.header.map((field) => (
          <HeaderField
            key={field.key}
            field={field}
            editable={editable}
            onFocus={() => onFocusPage(field.page)}
            onConfirm={() => dispatch({ type: "confirmField", key: field.key, by: actor })}
            onEdit={(value) => dispatch({ type: "editField", key: field.key, value, by: actor })}
            onChoose={(value) =>
              dispatch({ type: "chooseAlternative", key: field.key, value, by: actor })
            }
          />
        ))}
        <ShipTo state={state} dispatch={dispatch} editable={editable} />
        <BillTo state={state} />
      </div>
    </section>
  );
}

function HeaderField({
  field,
  editable,
  onFocus,
  onConfirm,
  onEdit,
  onChoose,
}: {
  field: FieldState;
  editable: boolean;
  onFocus: () => void;
  onConfirm: () => void;
  onEdit: (value: string) => void;
  onChoose: (value: string) => void;
}) {
  const id = `field-${field.key}`;
  const unconfirmed = isUnconfirmedSuggestion(field.state);
  const isDate = field.key.endsWith("date");
  const wide = field.key === "notes";
  const readOnlyDefault = field.state === "system_default";

  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.altKey &&
      event.key === "Enter" &&
      unconfirmed &&
      field.state !== "ambiguous" &&
      editable
    ) {
      event.preventDefault();
      onConfirm();
    }
  };

  return (
    <div
      className={cn(
        "rounded-md p-2.5",
        provenanceFieldClass(field.state),
        !unconfirmed && field.state !== "missing" && "bg-white ring-1 ring-border ring-inset",
        wide && "sm:col-span-2",
      )}
      data-unconfirmed={unconfirmed || undefined}
      onFocusCapture={onFocus}
      onKeyDown={onKeyDown}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        {field.state === "ambiguous" ? (
          <span id={`${id}-label`} className="text-caption font-medium text-subtle-foreground">
            {field.label}
          </span>
        ) : (
          <Label htmlFor={id} className="text-caption text-subtle-foreground">
            {field.label}
          </Label>
        )}
        <ProvenanceMarker
          provenance={{
            state: field.state,
            confidence: field.confidence,
            page: field.page,
            by: field.by,
            aiValue: field.aiValue && isDate ? fmt.date(field.aiValue) : field.aiValue,
            alternatives: field.alternatives?.map((a) => a.label),
            sourceLabel: field.sourceLabel,
          }}
        />
      </div>

      {field.state === "ambiguous" && field.alternatives ? (
        <div
          id={id}
          role="group"
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          className="space-y-2 outline-none"
        >
          <div className="flex flex-wrap gap-2">
            {field.alternatives.map((alt) => (
              <Button
                key={alt.value}
                size="sm"
                disabled={!editable}
                onClick={() => onChoose(alt.value)}
              >
                {fmt.date(alt.value)}
              </Button>
            ))}
          </div>
          {field.printedAs ? (
            <p className="text-caption text-subtle-foreground">
              Printed as <span className="font-mono">{field.printedAs}</span>. {field.hint}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Input
            id={id}
            value={isDate ? displayValue(field) : field.value}
            readOnly={!editable || readOnlyDefault || isDate}
            placeholder={field.state === "missing" ? "Not found on document" : undefined}
            onChange={(event) => onEdit(event.target.value)}
            className={cn("h-8 bg-white", unconfirmed && "border-ai-500/40")}
          />
          {editable && unconfirmed ? (
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={onConfirm}
              aria-label={`Confirm ${field.label}`}
            >
              <Check aria-hidden />
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ShipTo({
  state,
  dispatch,
  editable,
}: {
  state: ReviewState;
  dispatch: Dispatch<ReviewAction>;
  editable: boolean;
}) {
  const customer = customerById(state.customerId);
  const addresses = customer?.addresses.filter((a) => a.type === "shipping") ?? [];
  const selected = addresses.find((a) => a.id === state.shipToId);

  return (
    <div
      id="field-ship_to"
      tabIndex={-1}
      className={cn(
        "rounded-md p-2.5 outline-none sm:col-span-2",
        selected ? "bg-white ring-1 ring-border ring-inset" : provenanceFieldClass("missing"),
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-caption font-medium text-subtle-foreground">Ship-to</span>
        <ProvenanceMarker provenance={{ state: selected ? "user_entered" : "missing" }} />
      </div>
      {selected ? (
        <p className="text-body text-navy-900">
          <span className="font-medium">{selected.label}</span> · {selected.lines.join(", ")}
        </p>
      ) : null}
      {editable && state.customerConfirmed ? (
        <Select
          value={state.shipToId ?? undefined}
          onValueChange={(id) => dispatch({ type: "setShipTo", addressId: id })}
        >
          <SelectTrigger
            className={cn("h-8 bg-white", selected && "mt-2")}
            aria-label="Select a saved ship-to address"
          >
            <SelectValue placeholder="Select a saved address" />
          </SelectTrigger>
          <SelectContent>
            {addresses.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}: {a.lines[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : !selected ? (
        <p className="text-small text-muted-foreground">
          {state.customerConfirmed
            ? "Not found on document."
            : "Confirm the customer to choose a saved address."}
        </p>
      ) : null}
    </div>
  );
}

function BillTo({ state }: { state: ReviewState }) {
  const customer = customerById(state.customerId);
  const billing = customer?.addresses.find((a) => a.type === "billing" && a.isDefault);
  return (
    <div className="rounded-md bg-white p-2.5 ring-1 ring-border ring-inset sm:col-span-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-caption font-medium text-subtle-foreground">Bill-to</span>
        {billing && state.customerConfirmed ? (
          <ProvenanceMarker
            provenance={{ state: "system_default", sourceLabel: "Customer default" }}
          />
        ) : null}
      </div>
      <p className="text-body text-navy-900">
        {billing && state.customerConfirmed ? (
          <>
            <span className="font-medium">{billing.label}</span> · {billing.lines.join(", ")}
          </>
        ) : (
          <span className="text-muted-foreground">
            Applied from the customer record once the customer is confirmed.
          </span>
        )}
      </p>
    </div>
  );
}
