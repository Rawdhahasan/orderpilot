import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "ai";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-caption font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-neutral-50 text-neutral-700 ring-1 ring-inset ring-neutral-200",
        info: "bg-blue-50 text-blue-700",
        success: "bg-success-50 text-success-800",
        warning: "bg-warning-50 text-warning-800",
        danger: "bg-danger-50 text-danger-800",
        ai: "bg-ai-50 text-ai-800",
      } satisfies Record<Tone, string>,
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
