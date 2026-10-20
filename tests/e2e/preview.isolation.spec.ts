import { expect, test, type Page } from "@playwright/test";

const PREVIEW_ONLY = "Preview only — nothing was saved";

async function storageState(page: Page) {
  return page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    databases: (await indexedDB.databases()).length,
  }));
}

test.describe("preview isolation: no persistence, no network, no backend", () => {
  test("makes no requests outside the local development server", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname !== "localhost" && url.protocol !== "data:" && url.protocol !== "blob:")
        external.push(request.url());
    });
    for (const path of [
      "/preview/dashboard",
      "/preview/customer-pos/in-001042",
      "/preview/approvals/in-001041",
      "/preview/inventory",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    expect(external).toEqual([]);
  });

  test("review changes stay in memory and disappear on reload", async ({ page }) => {
    await page.goto("/preview/customer-pos/in-001042");
    await page.getByRole("button", { name: "Confirm customer", exact: true }).click();
    await expect(page.getByText("Confirmed by Priya Raman", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Confirm Customer PO number" }).click();
    await expect(page.getByRole("button", { name: "Confirm Customer PO number" })).toHaveCount(0);

    expect(await storageState(page)).toEqual({ local: 0, session: 0, cookie: "", databases: 0 });

    await page.reload();
    await expect(page.getByRole("button", { name: "Confirm customer", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm Customer PO number" })).toBeVisible();
  });

  test("actions that would change records say nothing was saved", async ({ page }) => {
    await page.goto("/preview/customer-pos/in-001042");
    await page.getByRole("button", { name: "Take over" }).click();
    await expect(page.getByText(PREVIEW_ONLY)).toBeVisible();
    await page.reload();
    await expect(page.getByText("Assigned to Jordan Ellis")).toBeVisible();
  });

  test("the persona switcher is visual only and resets on reload", async ({ page }) => {
    await page.goto("/preview/dashboard");
    await page.getByTestId("persona-switcher").click();
    await expect(
      page.getByText("Visual demonstration only. Not an authorisation mechanism."),
    ).toBeVisible();
    await page.getByRole("menuitemradio", { name: /Sam Patel/ }).click();
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Approvals/ }),
    ).toHaveCount(0);
    expect(await storageState(page)).toEqual({ local: 0, session: 0, cookie: "", databases: 0 });
    await page.reload();
    await expect(page.getByTestId("persona-switcher")).toContainText("Priya Raman");
  });
});
