import { expect, test } from "@playwright/test";

import { formAlert, password, signIn, totp, totpSecret, userClient, USERS } from "./app/support";

test.describe("two-factor authentication (D-24)", () => {
  test("an Owner is challenged at sign-in; a wrong code is refused", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(USERS.nsOwner);
    await page.getByLabel("Password").fill(password());
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in\/verify/);

    // Before verifying, the workspace is not reachable.
    await page.goto("/o/northstar/settings");
    await expect(page).toHaveURL(/\/sign-in\/verify\?next=/);

    const right = totp(totpSecret(USERS.nsOwner));
    await page.getByLabel("Authentication code").fill(right === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(formAlert(page)).toContainText("That code is not valid");

    await page.getByLabel("Authentication code").fill(totp(totpSecret(USERS.nsOwner)));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL("/o/northstar/settings");
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }),
    ).toBeVisible();
  });

  test("an Owner cannot remove their only authenticator", async ({ page }) => {
    await signIn(page, USERS.nsOwner, { secret: totpSecret(USERS.nsOwner) });
    await page.goto("/account/security");
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(formAlert(page)).toContainText("must keep two-factor authentication");
    await page.reload();
    await expect(page.getByText("On", { exact: true })).toBeVisible();
  });

  test("an Admin without MFA must enrol before using the workspace", async ({ page }) => {
    await signIn(page, USERS.nsAdmin);
    await page.goto("/o/northstar/dashboard");
    await expect(page).toHaveURL(/\/account\/security\?required=1&next=/);
    await page.goto("/o/northstar/settings/members");
    await expect(page).toHaveURL(/\/account\/security\?required=1/);

    await page.getByRole("button", { name: "Set up an authenticator app" }).click();
    await expect(page.getByRole("img", { name: /QR/i })).toBeVisible();
    const secret = (await page.getByTestId("mfa-secret").innerText()).replace(/\s/g, "");
    await page.getByLabel("Authentication code").fill(totp(secret));
    await page.getByRole("button", { name: "Turn on two-factor authentication" }).click();
    // The page refreshes into the enrolled state.
    await expect(page.getByText("On", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Continue to your workspace" }).click();
    await expect(page).toHaveURL("/o/northstar/settings/members");
    await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
    // Only Owners grant Owner (the database enforces this too: pgTAP 009).
    await expect(
      page.getByLabel("Role", { exact: true }).locator("option", { hasText: "Owner" }),
    ).toHaveCount(0);
  });

  test("the database refuses an Admin's privileged action without an MFA session", async () => {
    const client = await userClient(USERS.bvAdmin);
    const { data: org } = await client
      .from("organizations")
      .select("id")
      .eq("slug", "bayview")
      .single();
    expect(org?.id).toBeTruthy();
    const { error } = await client.rpc("invite_member", {
      p_organization_id: org!.id,
      p_email: "x@bayview.example",
      p_role: "viewer",
    });
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/mfa_required/);
    const update = await client
      .from("customers")
      .update({ name: "Renamed" })
      .eq("organization_id", org!.id)
      .select("id");
    expect(update.data ?? []).toEqual([]);
  });
});
