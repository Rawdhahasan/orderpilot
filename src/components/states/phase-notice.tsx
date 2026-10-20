import { Milestone } from "lucide-react";

import { cn } from "@/lib/cn";

/** States clearly which future phase delivers an unbuilt feature. */
export function PhaseNotice({
  phase,
  feature,
  className,
  compact = false,
}: {
  phase: string;
  feature: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <p
      data-phase-notice={phase}
      className={cn(
        "inline-flex items-start gap-1.5 text-small text-subtle-foreground",
        !compact && "rounded-md border border-dashed border-neutral-400 bg-white px-3 py-2",
        className,
      )}
    >
      <Milestone aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {feature} arrives in <strong className="font-medium text-navy-900">Phase {phase}</strong>.
      </span>
    </p>
  );
}
