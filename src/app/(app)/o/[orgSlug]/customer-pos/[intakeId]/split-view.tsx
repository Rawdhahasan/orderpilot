"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * FR-REV-01: document and draft side by side on wide screens; on narrower
 * screens they become two tabs, so neither pushes the other off screen.
 */
export function SplitView({ document, order }: { document: ReactNode; order: ReactNode }) {
  const [tab, setTab] = useState<"order" | "document">("order");
  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Review view"
        className="flex gap-1 border-b border-border xl:hidden"
      >
        {(["order", "document"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-small font-medium",
              tab === t
                ? "border-primary text-navy-900"
                : "border-transparent text-subtle-foreground",
            )}
          >
            {t === "order" ? "Order" : "Original document"}
          </button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className={cn(tab === "document" ? "block" : "hidden", "min-w-0 xl:block")}>
          {document}
        </div>
        <div className={cn(tab === "order" ? "block" : "hidden", "min-w-0 xl:block")}>{order}</div>
      </div>
    </div>
  );
}
