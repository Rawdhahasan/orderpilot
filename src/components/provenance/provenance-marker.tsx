"use client";

import { Check, CircleHelp, Pencil, ScanText } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProvenanceState } from "@/domain/orders/statuses";
import { cn } from "@/lib/cn";

/**
 * Provenance markers (DESIGN_SYSTEM.md §9.6), the most important component in
 * the product. Violet is used only for unconfirmed AI suggestions.
 */
export type Provenance = {
  state: ProvenanceState;
  /** 0 to 1, for AI suggestions. */
  confidence?: number;
  page?: number;
  /** Person who confirmed, edited or entered the value. */
  by?: string;
  /** Pre-formatted time of that action. */
  at?: string;
  /** The original AI value, shown after an edit. */
  aiValue?: string;
  /** Alternatives for an ambiguous value, for example ["4 Nov", "11 Apr"]. */
  alternatives?: string[];
  /** Source label for system defaults, for example "Customer default". */
  sourceLabel?: string;
};

/** True only for states that show the violet treatment. */
export function isUnconfirmedSuggestion(state: ProvenanceState): boolean {
  return state === "suggested" || state === "suggested_low" || state === "ambiguous";
}

/** Field container treatment that accompanies the marker. */
export function provenanceFieldClass(state: ProvenanceState): string {
  switch (state) {
    case "suggested":
      return "bg-ai-50 shadow-[inset_2px_0_0_var(--ai-500)]";
    case "suggested_low":
    case "ambiguous":
      return "bg-ai-50 shadow-[inset_2px_0_0_var(--warning-700)]";
    case "missing":
      return "border border-dashed border-neutral-400 bg-white";
    default:
      return "";
  }
}

function percent(confidence: number | undefined): string {
  return confidence === undefined ? "" : ` · ${Math.round(confidence * 100)}%`;
}

export function provenanceText(p: Provenance): { label: string; detail: string } {
  const page = p.page ? `Read from page ${p.page}. ` : "";
  switch (p.state) {
    case "suggested":
      return { label: `Suggested${percent(p.confidence)}`, detail: `${page}Confirm or edit.` };
    case "suggested_low":
      return {
        label: `Check${percent(p.confidence)}`,
        detail:
          p.confidence === undefined
            ? `${page}Check this value against the document and confirm it individually.`
            : `${page}Low confidence: confirm this value individually.`,
      };
    case "ambiguous":
      return {
        label: `Ambiguous: ${(p.alternatives ?? []).join(" or ")}`,
        detail: `${page}Choose the intended value.`,
      };
    case "confirmed":
      return {
        label: "Confirmed",
        detail: `Confirmed${p.by ? ` by ${p.by}` : ""}${p.at ? `, ${p.at}` : ""}`,
      };
    case "edited":
      return {
        label: "Edited",
        detail: `${p.aiValue ? `AI suggested ${p.aiValue}. ` : ""}Changed${p.by ? ` by ${p.by}` : ""}${p.at ? `, ${p.at}` : ""}`,
      };
    case "user_entered":
      return { label: "Entered by user", detail: `Entered${p.by ? ` by ${p.by}` : ""}` };
    case "system_default":
      return {
        label: p.sourceLabel ?? "System default",
        detail: "Applied by a company rule, not read from the document.",
      };
    case "missing":
      return { label: "Not found on document", detail: "No value was found. Nothing is guessed." };
  }
}

export function ProvenanceMarker({
  provenance,
  className,
}: {
  provenance: Provenance;
  className?: string;
}) {
  const { label, detail } = provenanceText(provenance);
  const { state } = provenance;

  if (state === "user_entered") {
    return <span className="sr-only">{detail}</span>;
  }

  if (state === "confirmed" || state === "edited") {
    const Icon = state === "confirmed" ? Check : Pencil;
    return (
      <Tooltip>
        <TooltipTrigger
          type="button"
          data-provenance={state}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-sm",
            state === "confirmed" ? "text-success-700" : "text-subtle-foreground",
            "hover:bg-neutral-100",
            className,
          )}
        >
          <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
          <span className="sr-only">
            {label}. {detail}
          </span>
        </TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
    );
  }

  if (state === "missing") {
    return (
      <span data-provenance={state} className={cn("text-caption text-muted-foreground", className)}>
        {label}
      </span>
    );
  }

  const toneClass =
    state === "suggested"
      ? "bg-ai-50 text-ai-800 ring-ai-500/30"
      : state === "system_default"
        ? "bg-neutral-50 text-neutral-700 ring-neutral-200"
        : "bg-warning-50 text-warning-800 ring-warning-700/30";
  const Icon = state === "system_default" ? CircleHelp : ScanText;

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        data-provenance={state}
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-caption font-medium whitespace-nowrap ring-1 ring-inset",
          toneClass,
          className,
        )}
      >
        <Icon aria-hidden className="size-3" />
        {label}
        <span className="sr-only">. {detail}</span>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}
