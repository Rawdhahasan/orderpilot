import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/** Data tables (DESIGN_SYSTEM.md §9.3): real table markup, sticky header, tabular numbers. */
function Table({ className, ...props }: ComponentProps<"table">) {
  // The container scrolls sideways on narrow screens, so it must be reachable
  // by keyboard (WCAG 2.1.1, axe scrollable-region-focusable).
  return (
    <div
      data-slot="table-container"
      tabIndex={0}
      className="relative w-full overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <table
        className={cn("w-full caption-bottom border-collapse text-small", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("bg-neutral-50", className)} {...props} />;
}

function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors duration-150 hover:bg-neutral-25 data-[state=selected]:bg-selected",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-9 px-3 text-left align-middle text-caption font-medium whitespace-nowrap text-subtle-foreground first:pl-4 last:pr-4",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      className={cn("h-11 px-3 align-middle text-body-foreground first:pl-4 last:pr-4", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return <caption className={cn("mt-3 text-small text-muted-foreground", className)} {...props} />;
}

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow };
