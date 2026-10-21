import { expect } from "@playwright/test";

import { formAlert, linkFromMail, localEnv, password, signIn, USERS, test } from "./app/support";

test.describe("authentication", () => {
  test("the root and protected routes send signed-out visitors to sign in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
    for (const path of [
      "/workspaces",
      "/account",
      "/o/northstar/dashboard",
      "/o/northstar/settings/members",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent(path)}`);
    }
    await expect(page.getByRole("link", { name: /development preview/i })).toHaveCount(0);
  });

  test("wrong password and unknown email get the same message", async ({ page }) => {
    for (const email of [USERS.nsViewer, "nobody@northstar.example"]) {
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("not-the-password-1");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(formAlert(page)).toHaveText("Email or password is incorrect.");
    }
  });

  test("public sign-up is disabled", async ({ request }) => {
    const { supabaseUrl, publishableKey } = localEnv();
    const response = await request.post(`${supabaseUrl}/auth/v1/signup`, {
      headers: { apikey: publishableKey },
      data: { email: "walk.in@northstar.example", password: "a-long-password-1" },
    });
    expect(response.ok()).toBe(false);
    expect(await response.text()).toMatch(/signup.*disabled|signups not allowed/i);
  });

  test("a member signs in, sees only their role's navigation, and signs out", async ({ page }) => {
    await signIn(page, USERS.nsViewer);
    await expect(page).toHaveURL("/o/northstar/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("You are signed in as Viewer")).toBeVisible();
    const nav = page.getByRole("navigation", { name: /main/i });
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Approvals" })).toHaveCount(0);
    await expect(page.getByTestId("preview-banner")).toHaveCount(0);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/sign-in");
    await page.goto("/o/northstar/dashboard");
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });

  test("an external next= target is ignored after sign-in", async ({ page }) => {
    await signIn(page, USERS.nsApprover, { next: "//evil.example/steal" });
    await expect(page).toHaveURL("/o/northstar/dashboard");
  });

  test("an expired or tampered session is treated as signed out", async ({ page, context }) => {
    await signIn(page, USERS.nsApprover);
    const cookies = await context.cookies();
    const auth = cookies.filter((c) => c.name.startsWith("sb-"));
    expect(auth.length).toBeGreaterThan(0);
    // Leave the app first so no in-flight navigation races the next one.
    await page.goto("about:blank");
    await context.clearCookies();
    await context.addCookies(
      auth.map((c) => ({ ...c, value: "base64-eyJhY2Nlc3NfdG9rZW4iOiJleHBpcmVkIn0" })),
    );
    await page.goto("/o/northstar/customers");
    await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent("/o/northstar/customers")}`);
  });

  test("password reset by email, without revealing whether an account exists", async ({ page }) => {
    const message = /If an account exists for that address/;
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("nobody@northstar.example");
    await page.getByRole("button", { name: /send|reset/i }).click();
    await expect(page.getByRole("status")).toHaveText(message);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(USERS.nsInventory);
    await page.getByRole("button", { name: /send|reset/i }).click();
    await expect(page.getByRole("status")).toHaveText(message);

    const link = await linkFromMail(
      USERS.nsInventory,
      /https?:\/\/[^"'\s]+\/auth\/v1\/verify\?[^"'\s]+/,
    );
    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password$/);
    const newPassword = `${password()}-new`;
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: /password/i }).click();
    await expect(page).toHaveURL("/sign-in?reset=1");

    await page.getByLabel("Email").fill(USERS.nsInventory);
    await page.getByLabel("Password").fill(password());
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(formAlert(page)).toHaveText("Email or password is incorrect.");
    await signIn(page, USERS.nsInventory, { password: newPassword });
    await expect(page).toHaveURL("/o/northstar/dashboard");
  });
});
