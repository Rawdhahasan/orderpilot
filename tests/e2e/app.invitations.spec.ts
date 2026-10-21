import { expect, test, type Page } from "@playwright/test";

import {
  formAlert,
  linkFromMail,
  localSql,
  password,
  signedInPage,
  signIn,
  USERS,
} from "./app/support";

const MEMBERS = "/o/northstar/settings/members";

async function invite(page: Page, email: string, role: string) {
  await page.goto(MEMBERS);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Role", { exact: true }).selectOption({ label: role });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status")).toHaveText(`Invitation sent to ${email}.`);
  return linkFromMail(email, /https?:\/\/[^"'\s<]+\/invite\/[0-9a-f]{64}/);
}

test.describe("invitations (D-03)", () => {
  test("a new person accepts once; the link cannot be replayed", async ({ browser }) => {
    const owner = await signedInPage(browser, "nsOwner");
    const email = "nadia.quinn@northstar.example";
    const link = await invite(owner, email, "Processor");
    await owner.reload();
    await expect(owner.getByRole("cell", { name: email, exact: true })).toBeVisible();

    const invitee = await (await browser.newContext()).newPage();
    await invitee.goto(link);
    await expect(
      invitee.getByRole("heading", { level: 1, name: "Join Northstar Distribution" }),
    ).toBeVisible();
    await expect(invitee.getByText("Processor", { exact: true })).toBeVisible();
    await invitee.getByLabel("Your name").fill("Nadia Quinn");
    await invitee.getByLabel("Password", { exact: true }).fill(password());
    await invitee.getByLabel("Confirm password").fill(password());
    await invitee.getByRole("button", { name: "Create account and join" }).click();
    await expect(invitee).toHaveURL("/o/northstar/dashboard");
    await expect(invitee.getByText("You are signed in as Processor")).toBeVisible();

    // Replay: the same link, signed in or not, is refused.
    await invitee.goto(link);
    await expect(
      invitee.getByRole("heading", { level: 1, name: "Invitation already used" }),
    ).toBeVisible();
    const stranger = await (await browser.newContext()).newPage();
    await stranger.goto(link);
    await expect(
      stranger.getByRole("heading", { level: 1, name: "Invitation already used" }),
    ).toBeVisible();

    await owner.reload();
    await expect(owner.getByTestId(`member-${email}`)).toContainText("Processor");
  });

  test("a withdrawn invitation cannot be used", async ({ browser }) => {
    const owner = await signedInPage(browser, "nsOwner");
    const email = "withdrawn.person@northstar.example";
    const link = await invite(owner, email, "Viewer");
    await owner.reload();
    await owner.getByRole("button", { name: `Withdraw invitation for ${email}` }).click();
    await expect(owner.getByRole("cell", { name: email, exact: true })).toHaveCount(0);

    const invitee = await (await browser.newContext()).newPage();
    await invitee.goto(link);
    await expect(
      invitee.getByRole("heading", { level: 1, name: "Invitation withdrawn" }),
    ).toBeVisible();
    await expect(invitee.getByRole("button", { name: /create account/i })).toHaveCount(0);
  });

  test("an expired invitation cannot be used", async ({ browser }) => {
    const owner = await signedInPage(browser, "nsOwner");
    const email = "late.person@northstar.example";
    const link = await invite(owner, email, "Viewer");
    localSql(
      `update public.organization_invitations set created_at = now() - interval '9 days', expires_at = now() - interval '1 day' where email = '${email}'`,
    );

    const invitee = await (await browser.newContext()).newPage();
    await invitee.goto(link);
    await expect(
      invitee.getByRole("heading", { level: 1, name: "Invitation expired" }),
    ).toBeVisible();
  });

  test("an invalid link reveals nothing", async ({ page }) => {
    for (const token of ["not-a-token", "0".repeat(64)]) {
      await page.goto(`/invite/${token}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Invitation not found" }),
      ).toBeVisible();
      await expect(page.getByText("Northstar")).toHaveCount(0);
    }
  });

  test("an invitation cannot be accepted by a different signed-in account", async ({ browser }) => {
    const owner = await signedInPage(browser, "nsOwner");
    const link = await invite(owner, "someone.else@northstar.example", "Viewer");
    const other = await (await browser.newContext()).newPage();
    await signIn(other, USERS.nsViewer);
    await other.goto(link);
    await expect(formAlert(other)).toContainText("different email address");
    await expect(other.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  });
});
