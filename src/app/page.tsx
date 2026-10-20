import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LogoMark } from "@/components/app-shell/logo";

export const metadata: Metadata = { title: "OrderPilot" };

/**
 * Phase 1 has no signed-in product yet. In development this page links to
 * the development preview; production builds contain no preview routes, so
 * the link is not rendered there.
 */
export default function HomePage() {
  const showPreviewLink = process.env.NODE_ENV === "development";

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center"
    >
      <LogoMark className="size-11" />
      <h1 className="mt-5 text-display font-semibold tracking-[-0.02em] text-navy-900">
        OrderPilot
      </h1>
      <p className="mt-2 max-w-md text-body text-subtle-foreground">
        Every customer PO, checked and approved before it becomes an order.
      </p>
      <p className="mt-6 text-small text-muted-foreground">Sign-in arrives in Phase 2.</p>
      {showPreviewLink ? (
        <Link
          href="/preview/dashboard"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-body font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Open the development preview
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </main>
  );
}
