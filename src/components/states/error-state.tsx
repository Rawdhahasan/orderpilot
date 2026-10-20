import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** What happened, what to do, Try again, and a request ID (DESIGN_SYSTEM.md §9.12). */
export function ErrorState({
  title = "We couldn't load this",
  description = "Something went wrong on our side. Try again in a moment.",
  requestId,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  requestId?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-state="error"
      className={cn("flex flex-col items-center gap-1 px-6 py-12 text-center", className)}
    >
      <p className="text-h3 font-semibold text-navy-900">{title}</p>
      <p className="max-w-md text-body text-subtle-foreground">{description}</p>
      {onRetry ? (
        <Button className="mt-3" onClick={onRetry}>
          <RotateCw aria-hidden />
          Try again
        </Button>
      ) : null}
      {requestId ? (
        <p className="mt-2 font-mono text-caption text-muted-foreground">Reference: {requestId}</p>
      ) : null}
    </div>
  );
}
