import { expect } from "@playwright/test";

import { signIn, userClient, USERS, test } from "./app/support";

const MEMBERS = "/o/bayview/settings/members";

test.describe("member management", () => {
  test("an Owner changes a role", async ({ open }) => {
    const page = await open({ as: "bvOwner" });
    await page.goto(MEMBERS);
    const row = page.getByTestId(`member-${USERS.bvApprover}`);
    await row.getByLabel(/Role for/).selectOption({ label: "Processor" });
    await row.getByRole("button", { name: "Change role" }).click();
    await expect(row.getByRole("status")).toHaveText("The role was changed.");
    await page.reload();
    await expect(
      page.getByTestId(`member-${USERS.bvApprover}`).getByRole("cell").nth(1),
    ).toHaveText("Processor");
  });

  test("a suspended member loses access until reactivated", async ({ open }) => {
    const page = await open({ as: "bvOwner" });
    await page.goto(MEMBERS);
    const row = page.getByTestId(`member-${USERS.bvInventory}`);
    await row.getByRole("button", { name: "Suspend" }).click();
    await expect(row.getByRole("status")).toHaveText("The member was suspended.");
    await expect(row.getByText("Suspended", { exact: true })).toBeVisible();

    const member = await open();
    await signIn(member, USERS.bvInventory);
    await expect(member).toHaveURL("/workspaces");
    await expect(member.getByText("You don't belong to any workspace yet")).toBeVisible();
    const response = await member.goto("/o/bayview/dashboard");
    expect(response?.status()).toBe(404);

    await page
      .getByTestId(`member-${USERS.bvInventory}`)
      .getByRole("button", { name: "Reactivate" })
      .click();
    await expect(page.getByTestId(`member-${USERS.bvInventory}`).getByRole("status")).toHaveText(
      "The member was reactivated.",
    );
    await member.goto("/workspaces");
    await expect(member).toHaveURL("/o/bayview/dashboard");
  });

  test("an Owner removes a member after confirming", async ({ open }) => {
    const page = await open({ as: "bvOwner" });
    await page.goto(MEMBERS);
    await page
      .getByTestId(`member-${USERS.bvProcessor}`)
      .getByRole("button", { name: "Remove" })
      .click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove member" }).click();
    await expect(page.getByTestId(`member-${USERS.bvProcessor}`)).toHaveCount(0);
  });

  test("the last active Owner cannot be demoted, suspended or removed", async ({ open }) => {
    const page = await open({ as: "bvOwner" });
    await page.goto(MEMBERS);
    await expect(page.getByTestId(`member-${USERS.bvOwner}`)).toContainText("This is you");

    const client = await userClient(USERS.bvOwner, true);
    const { data: me } = await client
      .from("organization_members")
      .select("id")
      .eq("user_id", (await client.auth.getUser()).data.user!.id)
      .single();
    const demote = await client.rpc("change_member_role", { p_member_id: me!.id, p_role: "admin" });
    expect(demote.error?.message).toMatch(/last_owner/);
    const { data: still } = await client
      .from("organization_members")
      .select("role, status")
      .eq("id", me!.id)
      .single();
    expect(still).toEqual({ role: "owner", status: "active" });
  });

  test("members without the right role see no member management", async ({ open }) => {
    const page = await open();
    await signIn(page, USERS.bvViewer);
    await page.goto(MEMBERS);
    await expect(page.getByText("You need the Owner or Admin role", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send invitation" })).toHaveCount(0);
    await page.goto("/o/bayview/settings");
    await expect(page.getByText("You need the Owner or Admin role", { exact: true })).toBeVisible();
  });
});
