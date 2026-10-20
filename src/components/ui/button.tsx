import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/** Buttons (docs/DESIGN_SYSTEM.md §9.1). One primary button per view. */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
    "transition-[background-color,border-color,color,box-shadow] duration-150 ease-out",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover",
        secondary:
          "border border-input bg-secondary text-secondary-foreground hover:bg-neutral-50 active:bg-neutral-100",
        ghost: "text-navy-900 hover:bg-neutral-100 active:bg-neutral-200",
        destructive: "bg-destructive text-destructive-foreground hover:bg-danger-800",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
        sidebar:
          "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-sidebar-indicator",
      },
      size: {
        sm: "h-8 px-3 text-small",
        md: "h-9 px-3.5 text-body",
        lg: "h-10 px-4 text-body",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows an inline spinner and disables the button while server work runs. */
    pending?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  pending = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
