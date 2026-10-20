import { notFound } from "next/navigation";

/**
 * Second line of defence for the development preview: production builds do
 * not compile preview routes at all (next.config.ts), and if a preview module
 * were ever executed in production this guard returns not-found.
 */
export function isPreviewAvailable(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production";
}

export function assertPreviewAvailable(nodeEnv?: string): void {
  if (!isPreviewAvailable(nodeEnv)) notFound();
}

export const PREVIEW_BASE_PATH = "/preview";
