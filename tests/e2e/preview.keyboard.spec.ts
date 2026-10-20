import { expect, test } from "@playwright/test";

/** Safari and WebKit move between links with Option+Tab; Tab alone skips them by default. */
const tabKey = (browserName: string) => (browserName === "webkit" ? "Alt+Tab" : "Tab");

test.describe("keyboard navigation", () => {
  test("skip link is the first stop and moves focus to the main content", async ({
    page,
    browserName,
  }) => {
    await page.goto("/preview/dashboard");
    await page.keyboard.press(tabKey(browserName));
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("every interactive element shows a visible focus indicator", async ({
    page,
    browserName,
  }) => {
    await page.goto("/preview/customer-pos");
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(tabKey(browserName));
      const outline = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return "none";
        const style = getComputedStyle(el);
        return style.outlineStyle !== "none" && style.outlineWidth !== "0px"
          ? "outline"
          : style.boxShadow !== "none"
            ? "ring"
            : "none";
      });
      expect(outline).not.toBe("none");
    }
  });

  test("main navigation works by keyboard and marks the current page", async ({ page }) => {
    await page.goto("/preview/dashboard");
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: /^Inventory/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/preview\/inventory$/);
    await expect(nav.getByRole("link", { name: /^Inventory/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("mobile menu opens and closes by keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/preview/dashboard");
    await page.getByRole("button", { name: "Open navigation" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  });

  test("review shortcuts move between values that need confirmation", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/preview/customer-pos/in-001042");
    await page.getByLabel("Customer PO number", { exact: true }).focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByLabel("PO date", { exact: true })).toBeFocused();
    await page.getByLabel("Customer PO number", { exact: true }).focus();
    await page.keyboard.press("Alt+Enter");
    await expect(page.getByRole("button", { name: "Confirm Customer PO number" })).toHaveCount(0);
  });

  test("dialogs trap focus and return it on close", async ({ page }) => {
    await page.goto("/preview/customer-pos/in-001042");
    const trigger = page.getByRole("button", { name: "Keyboard shortcuts" });
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });
});
