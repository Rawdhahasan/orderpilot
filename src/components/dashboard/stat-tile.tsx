import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type StatTileProps = {
  label: string;
  /** `null` means there is not enough data; no placeholder number is ever shown. */
  value: string | null;
  context?: ReactNode;
  insufficientReason?: string;
  href?: string;
  emphasis?: "default" | "attention";
  className?: string;
};

/** Stat tiles (DESIGN_SYSTEM.md §9.8). Every count links to the records behind it. */
export function StatTile({
  label,
  value,
  context,
  insufficientReason = "This appears once there is enough activity to measure.",
  href,
  emphasis = "default",
  className,
}: StatTileProps) {
  const body = (
    <>
      <p className="flex items-center justify-between gap-2 text-small font-medium text-subtle-foreground">
        {label}
        {href ? (
          <ArrowUpRight
            aria-hidden
            className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary"
          />
        ) : null}
      </p>
      {value === null ? (
        <div data-state="insufficient-data">
          <p className="mt-2 text-body font-medium text-navy-900">Not enough data yet</p>
          <p className="mt-0.5 text-caption text-muted-foreground">{insufficientReason}</p>
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-display font-semibold tabular text-navy-900">{value}</p>
          {context ? <p className="mt-0.5 text-small text-subtle-foreground">{context}</p> : null}
        </>
      )}
    </>
  );

  const classes = cn(
    "group block rounded-lg border bg-white p-4 transition-colors duration-150",
    emphasis === "attention" ? "border-warning-700/40" : "border-border",
    href && "hover:border-blue-200 hover:bg-blue-50/40",
    className,
  );

  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
