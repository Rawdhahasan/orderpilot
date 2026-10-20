"use client";

import { Toaster as Sonner } from "sonner";

/** Toasts: bottom right, 5 s, pause on hover (DESIGN_SYSTEM.md §9.11). */
function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      duration={5000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-lg! border! border-border! bg-white! text-navy-900! shadow-lg! font-sans! text-body!",
          description: "text-subtle-foreground! text-small!",
          actionButton: "bg-primary! text-white!",
        },
      }}
    />
  );
}

export { Toaster };
