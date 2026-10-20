import { defineConfig } from "@playwright/test";

import { shared } from "./playwright.shared";

/** Development preview journeys, run against the development server. */
export default defineConfig({
  ...shared,
  testDir: "./tests/e2e",
  testMatch: /preview\..*\.spec\.ts/,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: {
    command: "NEXT_TELEMETRY_DISABLED=1 next dev --port 3100",
    url: "http://localhost:3100/preview/dashboard",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
