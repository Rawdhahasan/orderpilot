import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PreviewShell } from "@/preview/components/preview-shell";
import { assertPreviewAvailable } from "@/preview/guard";
import { PersonaProvider } from "@/preview/persona";

/**
 * Development preview (docs/TECHNICAL_ARCHITECTURE.md §20). This file is only
 * compiled by the development server; the guard is a second line of defence.
 */
export const metadata: Metadata = {
  title: { default: "Development preview", template: "%s · Preview · OrderPilot" },
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: { children: ReactNode }) {
  assertPreviewAvailable();
  return (
    <PersonaProvider>
      <PreviewShell>{children}</PreviewShell>
    </PersonaProvider>
  );
}
