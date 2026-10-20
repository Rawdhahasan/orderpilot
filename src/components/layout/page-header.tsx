import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}
    >
      <div className="min-w-0">
        <h1 className="text-h1 font-semibold text-navy-900">{title}</h1>
        {description ? (
          <p className="mt-1 text-body text-subtle-foreground">{description}</p>
        ) : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({
  children,
  action,
  id,
}: {
  children: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2
        id={id}
        className="text-caption font-medium tracking-[0.04em] text-subtle-foreground uppercase"
      >
        {children}
      </h2>
      {action}
    </div>
  );
}
