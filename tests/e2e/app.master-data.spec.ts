import { expect } from "@playwright/test";

import { formAlert, signIn, test, USERS } from "./app/support";

const NS = "/o/northstar";

test.describe("customers (Phase 3)", () => {
  test("a Processor creates a customer after the possible-duplicate warning, then adds an address and a part number", async ({
    page,
  }) => {
    await signIn(page, USERS.nsProcessor);
    await page.goto(`${NS}/customers/new`);
    await page.getByLabel("Name").fill("Harbour and Pine Supply");
    await page.getByRole("button", { name: "Create customer" }).click();
    await expect(formAlert(page)).toContainText("Possible duplicate customer");
    await expect(page.getByText("Harbor & Pine Supply")).toBeVisible();
    await page.getByLabel("Account number").fill("HPS-NEW-1");
    await page.getByRole("button", { name: "Create anyway" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Harbour and Pine Supply" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Addresses" }).click();
    await page.getByLabel("Address line 1").fill("12 Dock Road");
    await page.getByLabel("City").fill("Columbus");
    await page.getByLabel("Country").fill("us");
    await page.getByLabel("Default address of this type").check();
    await page.getByRole("button", { name: "Add address" }).click();
    await expect(page.getByTestId("address-card")).toContainText("12 Dock Road");
    await expect(page.getByTestId("address-card")).toContainText("Default");

    await page.getByRole("link", { name: "Part numbers" }).click();
    await page.getByLabel("Customer part number").fill("HPS-77");
    await page.getByLabel("Our product").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Map part number" }).click();
    await expect(page.getByRole("cell", { name: "HPS-77", exact: true })).toBeVisible();

    // No hold controls for a Processor (Approver and above only).
    await expect(page.getByRole("button", { name: "Place on hold" })).toHaveCount(0);
  });

  test("an Approver places a customer on hold with a reason and releases it", async ({ page }) => {
    await signIn(page, USERS.nsApprover);
    await page.goto(`${NS}/customers?q=Northgate`);
    await page.getByRole("link", { name: "Northgate Facilities" }).click();
    await page.getByRole("button", { name: "Place on hold" }).click();
    await page.getByRole("button", { name: "Place on hold" }).last().click();
    await expect(page.getByText("A hold needs a reason.")).toBeVisible();
    await page.getByLabel("Hold reason").fill("Credit limit exceeded");
    await page.getByRole("button", { name: "Place on hold" }).last().click();
    await expect(page.getByText("The customer is on hold.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Credit limit exceeded")).toBeVisible();
    await page.getByRole("button", { name: "Release hold" }).click();
    await expect(page.getByText("The customer is active.")).toBeVisible();
    // Deactivation is Admin and above.
    await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
  });

  test("customer search filters by name and status", async ({ page }) => {
    await signIn(page, USERS.nsViewer);
    await page.goto(`${NS}/customers?status=inactive`);
    await expect(page.getByRole("link", { name: "Granite Peak Fitness" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northgate Facilities" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "New customer" })).toHaveCount(0);
  });
});

test.describe("products and inventory (Phase 3)", () => {
  test("an Inventory Manager creates a product, receives and counts stock, and sees the history", async ({
    page,
  }) => {
    await signIn(page, USERS.nsInventory);
    await page.goto(`${NS}/products/new`);
    await page.getByLabel("SKU").fill("TAPE-48");
    await page.getByLabel("Name").fill("Packing tape 48 mm");
    await page.getByLabel("Selling unit").selectOption("RL");
    await page.getByLabel("List price").fill("3.20");
    await page.getByLabel("Reorder point").fill("10");
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Packing tape 48 mm" })).toBeVisible();
    // Price changes are Owner/Admin only.
    await expect(page.getByRole("heading", { name: "Change list price" })).toHaveCount(0);

    await page.getByRole("link", { name: "Stock and movement history" }).click();
    await expect(page.getByTestId("stock-on-hand")).toHaveText("0 RL");
    await page.getByLabel("Quantity (RL)").first().fill("1.5");
    await page.getByRole("button", { name: "Receive stock" }).click();
    await expect(formAlert(page)).toContainText("decimal");
    await page.getByLabel("Quantity (RL)").first().fill("40");
    await page.getByLabel("Reference").fill("DN-5512");
    await page.getByRole("button", { name: "Receive stock" }).click();
    await expect(page.getByText("Stock received.")).toBeVisible();
    await expect(page.getByTestId("stock-on-hand")).toHaveText("40 RL");

    await page.getByLabel("Quantity (RL)").last().fill("36");
    await page.getByLabel("Reason").selectOption("cycle_count");
    await page.getByRole("button", { name: "Adjust stock" }).click();
    await expect(page.getByText("Stock adjusted.")).toBeVisible();
    await expect(page.getByTestId("stock-available")).toHaveText("36 RL");
    await expect(page.getByRole("cell", { name: /Adjusted · cycle count/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: /DN-5512/ })).toBeVisible();

    await page.goto(`${NS}/inventory?q=TAPE-48`);
    await expect(page.getByRole("link", { name: "TAPE-48" })).toBeVisible();
  });

  test("an Owner changes a list price and adds a customer price", async ({ open }) => {
    const page = await open({ as: "nsOwner" });
    await page.goto(`${NS}/products?q=JAN-2207`);
    await page.getByRole("link", { name: "JAN-2207" }).click();
    await page.getByLabel("New list price").fill("45.10");
    await page.getByLabel("Reason").fill("Supplier increase");
    await page.getByRole("button", { name: "Change price" }).click();
    await expect(page.getByText("The list price was changed.")).toBeVisible();
    await page.reload();
    await expect(page.getByText(/list price \$45\.10/)).toBeVisible();

    await page
      .getByLabel("Customer", { exact: true })
      .selectOption({ label: "Northgate Facilities" });
    await page.getByLabel("Price", { exact: true }).fill("41.00");
    await page.getByLabel("Valid from").fill("2026-10-01");
    await page.getByRole("button", { name: "Add customer price" }).click();
    await expect(page.getByText("Customer price added.")).toBeVisible();
    await page.getByRole("button", { name: "Add customer price" }).click();
    await expect(formAlert(page)).toContainText("already has a price");
  });

  test("a Viewer sees stock but cannot change it", async ({ page }) => {
    await signIn(page, USERS.nsViewer);
    await page.goto(`${NS}/inventory`);
    await page.getByRole("link", { name: "JAN-1001" }).click();
    await expect(
      page
        .getByRole("heading", { level: 2, name: /Movement history/i })
        .or(page.getByText("Movement history")),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Receive stock" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Adjust stock" })).toHaveCount(0);
  });
});
