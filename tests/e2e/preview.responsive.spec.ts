import { expect, test } from "@playwright/test";

const WIDTHS = [320, 390, 768, 1024, 1440];
const PAGES = [
  "/preview/dashboard",
  "/preview/customer-pos",
  "/preview/customer-pos/in-001042",
  "/preview/approvals/in-001041",
  "/preview/sales-orders/so-000408",
  "/preview/customers",
  "/preview/products",
  "/preview/inventory",
  "/preview/audit",
  "/preview/components",
];

test.describe("responsive layout (DESIGN_SYSTEM.md §15)", () => {
  for (const width of WIDTHS) {
    test(`no horizontal page scroll at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        // Poll so that sidebar and layout transitions have finished.
        await expect
          .poll(
            () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
            { message: `${path} overflows` },
          )
          .toBeLessThanOrEqual(0);
      }
    });
  }

  test("sidebar adapts: off-canvas on phones, icon rail on tablets, expanded on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/preview/dashboard");
    await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();

    await page.setViewportSize({ width: 800, height: 900 });
    const sidebar = page.getByRole("complementary", { name: "Sidebar" });
    await expect(sidebar).toBeVisible();
    await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(64);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(248);
  });

  test("review screen shows three regions from 1280 px and tabs below 1024 px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/preview/customer-pos/in-001042");
    await expect(page.getByRole("region", { name: "Original document" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Exceptions" })).toBeVisible();

    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(page.getByRole("complementary", { name: "Exceptions" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Exceptions \(\d+\)/ })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("tab", { name: "Document" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Exceptions/ })).toBeVisible();
  });
});
