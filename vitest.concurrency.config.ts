import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Concurrency suite (Phase 2D): real parallel transactions against the LOCAL
 * Supabase stack only. Run with `corepack pnpm test:concurrency`. Also runs the
 * extraction worker against a mock Gemini server (no real AI calls).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The extraction worker is run directly; the server-only guard applies in Next.js.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/concurrency/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
