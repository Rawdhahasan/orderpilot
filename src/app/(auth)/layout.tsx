import type { ReactNode } from "react";

import { Logo } from "@/components/app-shell/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10"
    >
      <Logo className="mb-8 text-navy-900" />
      <div className="w-full max-w-sm rounded-xl border border-border bg-white p-6 sm:p-8">
        {children}
      </div>
    </main>
  );
}
