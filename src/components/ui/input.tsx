import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export const fieldControlClass = [
  "w-full min-w-0 rounded-md border border-input bg-white px-3 text-body text-navy-900",
  "placeholder:text-muted-foreground",
  "transition-[border-color,box-shadow] duration-150",
  "focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
  "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
  "read-only:bg-neutral-25",
  "aria-invalid:border-danger-700 aria-invalid:ring-danger-700/20",
].join(" ");

function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldControlClass, "h-9", className)}
      {...props}
    />
  );
}

export { Input };
