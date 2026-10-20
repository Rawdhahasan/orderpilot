import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/** Loading placeholders that match the final layout (DESIGN_SYSTEM.md §9.12). */
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-neutral-100 motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
