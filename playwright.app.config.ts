import { defineConfig, devices } from "@playwright/test";

import { shared } from "./playwright.shared";

const PORT = 3300;

/**
 * Signed-in app journeys against the LOCAL Supabase stack (Phase 2C). Global
 * setup resets OrderPilot's local database, so tests run one at a time and in
 * one browser per run (the journeys change data): choose it with
 * PW_APP_BROWSER=chromium|webkit|firefox (default chromium).
 */
const BROWSERS = {
  chromium: "Desktop Chrome",
  webkit: "Desktop Safari",
  firefox: "Desktop Firefox",
} as const;
const browser = (process.env.PW_APP_BROWSER ?? "chromium") as keyof typeof BROWSERS;
if (!(browser in BROWSERS)) throw new Error(`Unknown PW_APP_BROWSER: ${browser}`);
export default defineConfig({
  ...shared,
  testDir: "./tests/e2e",
  testMatch: /app\..*\.spec\.ts/,
  workers: 1,
  projects: [{ name: browser, use: { ...devices[BROWSERS[browser]] } }],
  globalSetup: "./tests/e2e/app/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `NEXT_TELEMETRY_DISABLED=1 next build && NEXT_TELEMETRY_DISABLED=1 next start --port ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    env: { APP_BASE_URL: `http://localhost:${PORT}` },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
