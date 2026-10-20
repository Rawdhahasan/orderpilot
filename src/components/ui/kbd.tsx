import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-white px-1 font-mono text-caption text-subtle-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
