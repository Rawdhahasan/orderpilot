import path from "node:path";

import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * Page extensions used by every phase. Development preview routes are named
 * `*.preview.tsx` and are only recognised by the development server, so a
 * production build never compiles them. No environment variable changes this
 * (docs/TECHNICAL_ARCHITECTURE.md §20).
 */
export const BASE_PAGE_EXTENSIONS = ["tsx", "ts"] as const;
export const PREVIEW_PAGE_EXTENSION = "preview.tsx";

export function pageExtensionsFor(phase: string): string[] {
  return phase === PHASE_DEVELOPMENT_SERVER
    ? [PREVIEW_PAGE_EXTENSION, ...BASE_PAGE_EXTENSIONS]
    : [...BASE_PAGE_EXTENSIONS];
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

export default function config(phase: string): NextConfig {
  return {
    pageExtensions: pageExtensionsFor(phase),
    poweredByHeader: false,
    reactStrictMode: true,
    devIndicators: false,
    // Do not let `next dev` write agent instruction files into the repository.
    agentRules: false,
    // The project root is this folder, not the home directory above it.
    turbopack: { root: path.resolve(".") },
    async headers() {
      return [{ source: "/:path*", headers: securityHeaders }];
    },
  };
}
