import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig, { PREVIEW_PAGE_EXTENSION, pageExtensionsFor } from "../../next.config";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

describe("development preview isolation (TECHNICAL_ARCHITECTURE.md §20)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("compiles preview routes only for the development server", () => {
    expect(pageExtensionsFor(PHASE_DEVELOPMENT_SERVER)).toContain(PREVIEW_PAGE_EXTENSION);
    expect(pageExtensionsFor(PHASE_PRODUCTION_BUILD)).not.toContain(PREVIEW_PAGE_EXTENSION);
    expect(pageExtensionsFor(PHASE_PRODUCTION_SERVER)).not.toContain(PREVIEW_PAGE_EXTENSION);
  });

  it("ignores environment flags when deciding page extensions", () => {
    vi.stubEnv("ORDERPILOT_PREVIEW", "1");
    vi.stubEnv("NEXT_PUBLIC_PREVIEW", "true");
    vi.stubEnv("PREVIEW", "true");
    const config = nextConfig(PHASE_PRODUCTION_BUILD);
    expect(config.pageExtensions).toEqual(["tsx", "ts"]);
  });

  it("returns not-found at runtime in production", async () => {
    const { assertPreviewAvailable, isPreviewAvailable } = await import("@/preview/guard");
    expect(isPreviewAvailable("production")).toBe(false);
    expect(isPreviewAvailable("development")).toBe(true);
    expect(() => assertPreviewAvailable("production")).toThrow("NEXT_NOT_FOUND");
    expect(() => assertPreviewAvailable("development")).not.toThrow();
  });
});
