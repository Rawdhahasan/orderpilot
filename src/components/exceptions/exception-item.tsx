import { CheckCircle2, OctagonAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import type { ExceptionSeverity } from "@/domain/orders/statuses";
import { cn } from "@/lib/cn";

export type ExceptionStatus =
  "open" | "override_required" | "resolved" | "acknowledged" | "overridden";

export type ExceptionItemProps = {
  code: string;
  severity: ExceptionSeverity;
  title: string;
  /** "Header" or "Line 4". */
  scope: string;
  message: string;
  status?: ExceptionStatus;
  /** Who resolved or overrode it, and why. */
  resolution?: string;
  actions?: ReactNode;
  selected?: boolean;
};

/** Exception items (DESIGN_SYSTEM.md §9.5): problem, why, and the fix right there. */
export function ExceptionItem({
  code,
  severity,
  title,
  scope,
  message,
  status = "open",
  resolution,
  actions,
  selected = false,
}: ExceptionItemProps) {
  const closed = status === "resolved" || status === "acknowledged" || status === "overridden";
  const Icon = closed
    ? status === "overridden"
      ? ShieldCheck
      : CheckCircle2
    : severity === "blocking"
      ? OctagonAlert
      : TriangleAlert;

  return (
    <article
      data-exception-code={code}
      data-exception-status={status}
      aria-label={`${closed ? (status === "overridden" ? "Overridden" : "Resolved") : severity === "blocking" ? "Blocking" : "Warning"}: ${title}, ${scope}`}
      className={cn(
        "rounded-lg border bg-white p-3 transition-colors duration-150",
        selected ? "border-blue-500 ring-2 ring-ring/20" : "border-border",
        closed && "bg-neutral-25",
      )}
    >
      <div className="flex items-start gap-2">
        <Icon
          aria-hidden
          className={cn(
            "mt-0.5 size-4 shrink-0",
            closed
              ? "text-success-700"
              : severity === "blocking"
                ? "text-danger-700"
                : "text-warning-700",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-body font-medium text-navy-900">
            <span>{title}</span>
            <span className="text-caption font-normal text-muted-foreground">· {scope}</span>
          </p>
          <p
            className={cn(
              "mt-0.5 text-small",
              closed ? "text-muted-foreground" : "text-body-foreground",
            )}
          >
            {message}
          </p>
          {status === "override_required" ? (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-sm bg-warning-50 px-1.5 py-0.5 text-caption font-medium text-warning-800">
              Override required by an approver
            </p>
          ) : null}
          {resolution ? (
            <p className="mt-1.5 text-caption text-subtle-foreground">{resolution}</p>
          ) : null}
          {actions && !closed ? <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
    </article>
  );
}
