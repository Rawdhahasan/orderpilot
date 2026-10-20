import { devices, type PlaywrightTestConfig } from "@playwright/test";

/**
 * Chromium day to day; all three engines before a phase is signed off
 * (S-04): run with PW_ALL_BROWSERS=1 after `playwright install`.
 */
export const projects: PlaywrightTestConfig["projects"] = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ...(process.env.PW_ALL_BROWSERS
    ? [
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
      ]
    : []),
];

export const shared: PlaywrightTestConfig = {
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  projects,
};
