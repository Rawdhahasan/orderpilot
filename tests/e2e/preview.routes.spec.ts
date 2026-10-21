import { expect, test } from "@playwright/test";

import { viewAs } from "./helpers";
import { BANNER, PREVIEW_ROUTES, SETTINGS_ROUTE } from "./routes";

test.describe("development preview routes", () => {
  for (const route of PREVIEW_ROUTES) {
    test(`${route.path} renders with fictional labelling`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));

      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(page.getByTestId("preview-banner")).toHaveText(BANNER);
      await expect(page.locator("[data-fictional]").first()).toBeVisible();
      expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain(
        "noindex",
      );
      expect(errors).toEqual([]);
    });
  }

  test("settings render for an Owner and explain the role for others", async ({ page }) => {
    await page.goto(SETTINGS_ROUTE);
    await expect(page.getByText("You need the Owner or Admin role", { exact: true })).toBeVisible();
    await viewAs(page, "Sofia Brandt");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.getByTestId("preview-banner")).toHaveText(BANNER);
  });

  test("unknown preview records show the generic not-found page", async ({ page }) => {
    // The preview layout streams first, so the development server answers 200
    // and renders the not-found page inside it (Next.js streaming behaviour).
    await page.goto("/preview/customer-pos/in-999999");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  });

  test("the sign-in page links to the preview in development", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.getByRole("link", { name: "Open the development preview" }).click();
    await expect(page).toHaveURL(/\/preview\/dashboard$/);
  });
});
