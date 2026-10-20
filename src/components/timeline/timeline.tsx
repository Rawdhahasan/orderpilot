import {
  CheckCircle2,
  CircleDot,
  FileUp,
  Package,
  Pencil,
  ScanText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type TimelineKind =
  "upload" | "extraction" | "edit" | "confirm" | "override" | "approval" | "stock" | "other";

const ICONS: Record<TimelineKind, LucideIcon> = {
  upload: FileUp,
  extraction: ScanText,
  edit: Pencil,
  confirm: CheckCircle2,
  override: ShieldCheck,
  approval: CheckCircle2,
  stock: Package,
  other: CircleDot,
};

export type TimelineEntry = {
  id: string;
  kind: TimelineKind;
  actor: string;
  action: ReactNode;
  /** Relative time ("2 h ago"). */
  when: string;
  /** Absolute time, shown on hover and to assistive technology. */
  whenAbsolute: string;
  detail?: ReactNode;
  emphasis?: boolean;
};

/** Timeline (DESIGN_SYSTEM.md §9.9). */
export function Timeline({ entries, className }: { entries: TimelineEntry[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-4", className)}>
      {entries.map((entry, index) => {
        const Icon = ICONS[entry.kind];
        return (
          <li key={entry.id} className="relative flex gap-3">
            {index < entries.length - 1 ? (
              <span aria-hidden className="absolute top-7 bottom-[-1rem] left-3.5 w-px bg-border" />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border bg-white",
                entry.emphasis
                  ? "border-blue-200 text-primary"
                  : "border-border text-subtle-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-body text-navy-900">
                <span className="font-medium">{entry.actor}</span> {entry.action}
              </p>
              <p className="text-caption text-muted-foreground">
                <time title={entry.whenAbsolute}>{entry.when}</time>
                <span className="sr-only"> ({entry.whenAbsolute})</span>
              </p>
              {entry.detail ? (
                <div className="mt-1.5 rounded-md bg-neutral-50 px-2.5 py-1.5 text-small text-body-foreground">
                  {entry.detail}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
