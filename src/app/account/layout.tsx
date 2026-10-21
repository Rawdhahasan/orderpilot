import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/app-shell/logo";
import { SkipLink } from "@/components/app-shell/skip-link";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <SkipLink />
      <header className="flex h-14 items-center justify-between border-b border-border bg-white px-4 md:px-6">
        <Link href="/workspaces" aria-label="OrderPilot workspaces" className="text-navy-900">
          <Logo />
        </Link>
        <nav aria-label="Account" className="flex gap-4 text-small font-medium">
          <Link href="/account" className="text-subtle-foreground hover:text-navy-900">
            Profile
          </Link>
          <Link href="/account/security" className="text-subtle-foreground hover:text-navy-900">
            Security
          </Link>
          <Link href="/workspaces" className="text-subtle-foreground hover:text-navy-900">
            Workspaces
          </Link>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl space-y-6 px-4 py-8 outline-none">
        {children}
      </main>
    </div>
  );
}
