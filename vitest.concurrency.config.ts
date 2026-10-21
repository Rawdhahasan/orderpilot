import { defineConfig } from "vitest/config";

/**
 * Concurrency suite (Phase 2D): real parallel transactions against the LOCAL
 * Supabase stack only. Run with `corepack pnpm test:concurrency`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/concurrency/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
