import { expect } from "@playwright/test";

import { test } from "./app/support";

// Screenshot comparison for stable screens (TESTING_STRATEGY.md §10, moved to
// Phase 6). One browser only, to limit rendering noise; update baselines with
// `corepack pnpm test:e2e:app --update-snapshots` after an intended change.
test.describe("visual regression (Chromium)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Baselines are kept for Chromium only.",
  );

  for (const [name, path] of [
    ["sign-in", "/sign-in"],
    ["forgot-password", "/forgot-password"],
    ["invitation-not-found", "/invite/not-a-token"],
  ] as const) {
    test(`${name} looks as approved`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
