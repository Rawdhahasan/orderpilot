import { expect, test } from "@playwright/test";

import { linkFromMail, password, signedInPage, signIn, USERS } from "./app/support";

test.describe("workspaces", () => {
  test("another workspace, or one that does not exist, looks the same: not found", async ({
    page,
  }) => {
    await signIn(page, USERS.nsViewer);
    for (const path of [
      "/o/bayview/dashboard",
      "/o/bayview/settings/members",
      "/o/no-such-workspace/dashboard",
    ]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
      await expect(page.getByText("Bayview")).toHaveCount(0);
    }
  });

  test("a person in two workspaces chooses and switches between them", async ({ browser }) => {
    const owner = await signedInPage(browser, "bvOwner");
    await owner.goto("/o/bayview/settings/members");
    await owner.getByLabel("Email").fill(USERS.nsProcessor);
    await owner.getByLabel("Role", { exact: true }).selectOption({ label: "Viewer" });
    await owner.getByRole("button", { name: "Send invitation" }).click();
    await expect(owner.getByRole("status")).toContainText("Invitation sent");
    const link = await linkFromMail(
      USERS.nsProcessor,
      /https?:\/\/[^"'\s<]+\/invite\/[0-9a-f]{64}/,
    );

    const page = await (await browser.newContext()).newPage();
    await page.goto(link);
    await page.getByRole("link", { name: "Sign in to accept" }).click();
    await expect(page).toHaveURL(/\/sign-in\?next=%2Finvite%2F/);
    await page.getByLabel("Email").fill(USERS.nsProcessor);
    await page.getByLabel("Password").fill(password());
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(new URL(link).pathname);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page).toHaveURL("/o/bayview/dashboard");
    await expect(page.getByText("You are signed in as Viewer")).toBeVisible();

    await page.goto("/workspaces");
    await expect(page.getByRole("link", { name: /Northstar Distribution/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Bayview/ })).toBeVisible();

    await page.goto("/o/bayview/dashboard");
    await page.getByTestId("workspace-switcher").click();
    await page.getByRole("menuitem", { name: /Northstar Distribution/ }).click();
    await expect(page).toHaveURL("/o/northstar/dashboard");
    await expect(page.getByText("You are signed in as Processor")).toBeVisible();
  });

  test("signed-in pages show no fictional preview data", async ({ browser }) => {
    const page = await signedInPage(browser, "nsOwner");
    for (const segment of [
      "dashboard",
      "customer-pos",
      "approvals",
      "sales-orders",
      "customers",
      "products",
      "inventory",
      "audit",
    ]) {
      await page.goto(`/o/northstar/${segment}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("[data-phase-notice]").first()).toBeVisible();
      await expect(page.getByTestId("preview-banner")).toHaveCount(0);
      await expect(page.getByText(/Fictional Data/i)).toHaveCount(0);
    }
  });

  test("app pages send a nonce-based CSP without unsafe-eval", async ({ request }) => {
    const response = await request.get("/sign-in");
    const csp = response.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
