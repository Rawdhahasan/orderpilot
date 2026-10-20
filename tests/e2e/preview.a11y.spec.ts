import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { viewAs } from "./helpers";
import { PREVIEW_ROUTES, SETTINGS_ROUTE } from "./routes";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} → ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(", ")}`,
    );
}

test.describe("accessibility (WCAG 2.2 AA, axe-core)", () => {
  for (const width of [1440, 390]) {
    for (const route of PREVIEW_ROUTES) {
      test(`${route.path} at ${width} px has no serious or critical violations`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route.path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await seriousViolations(page)).toEqual([]);
      });
    }
  }

  test("settings (as Owner) have no serious or critical violations", async ({ page }) => {
    await page.goto(SETTINGS_ROUTE);
    await viewAs(page, "Sofia Brandt");
    for (const tab of ["Workspace", "Members", "Order rules"]) {
      await page.getByRole("tab", { name: tab }).click();
      expect(await seriousViolations(page), tab).toEqual([]);
    }
  });

  test("open dialogs have no serious or critical violations", async ({ page }) => {
    await page.goto("/preview/approvals/in-001040");
    await page.getByRole("button", { name: "Override…" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});
