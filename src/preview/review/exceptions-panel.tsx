"use client";

import { Crosshair, FileSearch } from "lucide-react";

import { ExceptionItem } from "@/components/exceptions/exception-item";
import { Button } from "@/components/ui/button";

import type { ReviewException } from "./model";

export function ExceptionsPanel({
  open,
  resolved,
  selectedId,
  onSelect,
  onShowOnDocument,
  actor,
}: {
  open: ReviewException[];
  resolved: ReviewException[];
  selectedId: string | null;
  onSelect: (exception: ReviewException) => void;
  onShowOnDocument: (page: number) => void;
  actor: string;
}) {
  const blocking = open.filter((e) => e.severity === "blocking");
  const warnings = open.filter((e) => e.severity === "warning");

  const group = (title: string, items: ReviewException[], closed = false) =>
    items.length ? (
      <section aria-label={title} className="space-y-2">
        <h3 className="text-caption font-medium text-subtle-foreground">
          {title} <span className="tabular">({items.length})</span>
        </h3>
        {items.map((exception) => (
          <ExceptionItem
            key={exception.id}
            code={exception.code}
            severity={exception.severity}
            title={exception.title}
            scope={exception.scope}
            message={closed ? "This problem no longer applies." : exception.message}
            selected={selectedId === exception.id}
            status={closed ? "resolved" : exception.overridable ? "override_required" : "open"}
            resolution={closed ? `Resolved by ${actor} in this preview` : undefined}
            actions={
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7"
                  onClick={() => onSelect(exception)}
                >
                  <Crosshair aria-hidden />
                  Go to {exception.scope === "Header and lines" ? "first value" : "field"}
                </Button>
                {exception.page ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => onShowOnDocument(exception.page!)}
                  >
                    <FileSearch aria-hidden />
                    Show on document
                  </Button>
                ) : null}
              </>
            }
          />
        ))}
      </section>
    ) : null;

  return (
    <div className="space-y-5">
      <p className="sr-only" aria-live="polite">
        {blocking.length} blocking exceptions and {warnings.length} warnings.
      </p>
      {open.length === 0 ? (
        <p className="rounded-lg border border-success-700/30 bg-success-50 px-3 py-2.5 text-small text-success-800">
          No open exceptions. This order is ready to submit.
        </p>
      ) : null}
      {group("Blocking", blocking)}
      {group("Warnings", warnings)}
      {group("Resolved", resolved, true)}
    </div>
  );
}
