import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** One sentence on what belongs here and one primary action. No illustration. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-state="empty"
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-6 py-12 text-center",
        className,
      )}
    >
      <p className="text-h3 font-semibold text-navy-900">{title}</p>
      {description ? (
        <p className="max-w-md text-body text-subtle-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
