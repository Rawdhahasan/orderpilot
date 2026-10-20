import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Persistent page-level banners (DESIGN_SYSTEM.md §9.11). */
export function Banner({
  icon: Icon,
  children,
  actions,
  tone = "info",
  className,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  actions?: ReactNode;
  tone?: "info" | "warning" | "preview";
  className?: string;
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-small md:px-6",
        tone === "info" && "bg-blue-50 text-blue-700",
        tone === "warning" && "bg-warning-50 text-warning-800",
        tone === "preview" && "bg-navy-900 text-white",
        className,
      )}
    >
      <p className="flex min-w-0 flex-1 items-center gap-2">
        {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
        <span className="min-w-0">{children}</span>
      </p>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
