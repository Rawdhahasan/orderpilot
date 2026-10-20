import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

import { fieldControlClass } from "./input";

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldControlClass, "min-h-20 py-2", className)}
      {...props}
    />
  );
}

export { Textarea };
