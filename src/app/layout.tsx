import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OrderPilot", template: "%s · OrderPilot" },
  description: "Every customer PO, checked and approved before it becomes an order.",
};

export const viewport: Viewport = {
  themeColor: "#08142B",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers renders every page per request, so Next.js can
  // apply the per-request CSP nonce set by the proxy to its scripts.
  await headers();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
