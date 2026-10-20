import { defineConfig } from "@playwright/test";

import { shared } from "./playwright.shared";

/** Production build checks: the preview must not exist. */
export default defineConfig({
  ...shared,
  testDir: "./tests/e2e",
  testMatch: /production\..*\.spec\.ts/,
  use: { baseURL: "http://localhost:3200" },
  webServer: {
    command:
      "NEXT_TELEMETRY_DISABLED=1 next build && NEXT_TELEMETRY_DISABLED=1 next start --port 3200",
    url: "http://localhost:3200/",
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
