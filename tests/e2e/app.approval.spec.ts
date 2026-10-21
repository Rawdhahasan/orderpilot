import { expect } from "@playwright/test";

import { formAlert, localSql, signIn, submittedIntake, test, USERS } from "./app/support";

const NS = "/o/northstar";
const reserved = (sku: string) =>
  localSql(
    `select reserved from public.inventory_balances b join public.products p on p.id = b.product_id where p.sku = '${sku}' and p.organization_id = '00000000-0000-4000-a000-000000000001'`,
  );

test.describe("approval, sales orders, audit and dashboard (Phase 5)", () => {
  test("an Approver approves from the queue; the sales order reserves stock and is fulfilled", async ({
    page,
    open,
  }) => {
    const id = submittedIntake({
      po: "NG-APR-1",
      lines: [{ sku: "JAN-1001", qty: 12, price: 8.95 }],
    });
    const before = Number(reserved("JAN-1001"));
    await signIn(page, USERS.nsApprover);
    await page.goto(`${NS}/approvals`);
    await page
      .getByRole("row", { name: /NG-APR-1/ })
      .getByRole("link")
      .click();
    await expect(page).toHaveURL(`${NS}/approvals/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Approve");
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    const so = page.getByRole("link", { name: /^SO-\d{4}-\d{6}$/ }).first();
    await expect(so).toBeVisible();
    const orderNumber = await so.innerText();
    expect(Number(reserved("JAN-1001"))).toBe(before + 12);
    await so.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(orderNumber);
    await expect(page.getByTestId("order-status-line")).toContainText("Confirmed by Priya Raman");

    // Fulfilment by the Inventory Manager issues the reservation.
    const marc = await open();
    await signIn(marc, USERS.nsInventory);
    await marc.goto(page.url().replace(/^https?:\/\/[^/]+/, ""));
    await marc.getByRole("button", { name: "Mark fulfilled" }).click();
    await expect(marc.getByTestId("order-status-line")).toContainText("Fulfilled by Marc Dubois");
    expect(Number(reserved("JAN-1001"))).toBe(before);
    await expect(marc.getByText("marked it fulfilled")).toBeVisible();
  });

  test("a stock shortfall needs a decision; the backorder can be handled externally without changing stock", async ({
    page,
    open,
  }) => {
    localSql(`select 1`);
    const id = submittedIntake({
      po: "NG-APR-2",
      lines: [{ sku: "JAN-4402", qty: 60, price: 38.5 }],
    });
    await signIn(page, USERS.nsApprover);
    await page.goto(`${NS}/approvals/${id}`);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText(/Not enough stock for 1 line/)).toBeVisible();
    await page.getByLabel(/Reserve 48 and backorder 12/).check();
    await page.getByRole("button", { name: "Approve with backorders" }).click();
    await page
      .getByRole("link", { name: /^SO-\d{4}-\d{6}$/ })
      .first()
      .click();
    await expect(page.getByTestId("so-line-1")).toContainText("12 CS");

    const marc = await open();
    await signIn(marc, USERS.nsInventory);
    await marc.goto(page.url().replace(/^https?:\/\/[^/]+/, ""));
    const onHand = localSql(
      `select on_hand from public.inventory_balances b join public.products p on p.id = b.product_id where p.sku = 'JAN-4402' and p.organization_id = '00000000-0000-4000-a000-000000000001'`,
    );
    await marc.getByRole("button", { name: /Mark backorder on line 1 handled externally/ }).click();
    await marc
      .getByLabel("How was it handled?")
      .fill("Supplier drop-shipped the remaining 12 cases");
    await marc.getByRole("button", { name: "Record" }).click();
    await expect(marc.getByText(/Handled externally by Marc Dubois/)).toBeVisible();
    expect(
      localSql(
        `select on_hand from public.inventory_balances b join public.products p on p.id = b.product_id where p.sku = 'JAN-4402' and p.organization_id = '00000000-0000-4000-a000-000000000001'`,
      ),
    ).toBe(onHand);

    // Cancelling the order releases the reservation.
    await page.reload();
    await page.getByRole("button", { name: "Cancel order" }).click();
    await page.getByLabel("Reason for cancelling").fill("Customer cancelled by phone");
    await page.getByRole("button", { name: "Cancel order" }).click();
    await expect(page.getByTestId("order-status-line")).toContainText("Cancelled by Priya Raman");
  });

  test("request changes and reject need a reason", async ({ page }) => {
    const changes = submittedIntake({
      po: "NG-APR-3",
      lines: [{ sku: "JAN-1001", qty: 1, price: 8.95 }],
    });
    const reject = submittedIntake({
      po: "NG-APR-4",
      lines: [{ sku: "JAN-1001", qty: 1, price: 8.95 }],
    });
    await signIn(page, USERS.nsApprover);
    await page.goto(`${NS}/approvals/${changes}`);
    await page.getByRole("button", { name: "Request changes" }).click();
    await page.getByRole("button", { name: "Request changes" }).click();
    await expect(page.getByText("A reason is required.")).toBeVisible();
    await page
      .getByLabel("What should the reviewer change?")
      .fill("Check the quantity with the customer");
    await page.getByRole("button", { name: "Request changes" }).click();
    await page.goto(`${NS}/customer-pos/${changes}`);
    await expect(
      page.getByText(/Changes requested by Priya Raman: Check the quantity with the customer/),
    ).toBeVisible();

    await page.goto(`${NS}/approvals/${reject}`);
    await page.getByRole("button", { name: "Reject" }).click();
    await page.getByLabel("Why is it rejected?").fill("Not our customer's order");
    await page.getByRole("button", { name: "Reject" }).click();
    await page.goto(`${NS}/customer-pos/${reject}`);
    await expect(page.getByText(/Rejected by Priya Raman: Not our customer's order/)).toBeVisible();
  });

  test("the submitter cannot approve their own order (independent approval)", async ({ page }) => {
    const id = submittedIntake({
      po: "NG-APR-5",
      submittedBy: "00000000-0000-4000-a500-000000000003",
      lines: [{ sku: "JAN-1001", qty: 1, price: 8.95 }],
    });
    await signIn(page, USERS.nsApprover);
    await page.goto(`${NS}/approvals/${id}`);
    await expect(page.getByText(/You submitted this order/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  });

  test("the audit log and dashboard follow the role", async ({ page, open }) => {
    await signIn(page, USERS.nsApprover);
    await page.goto(`${NS}/audit`);
    await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
    await expect(page.getByRole("cell", { name: /approved it/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
    await page.goto(`${NS}/dashboard`);
    await expect(page.getByText("Waiting for approval")).toBeVisible();
    await expect(page.getByText("Not enough data yet").first()).toBeVisible();

    const viewer = await open();
    await signIn(viewer, USERS.nsViewer);
    await viewer.goto(`${NS}/audit`);
    await expect(
      viewer.getByText("You need the Approver or above role", { exact: true }),
    ).toBeVisible();
    await viewer.goto(`${NS}/dashboard`);
    await expect(viewer.getByText("Waiting for approval")).toHaveCount(0);

    const owner = await open({ as: "nsOwner" });
    await owner.goto(`${NS}/audit`);
    const download = owner.waitForEvent("download");
    await owner.getByRole("link", { name: "Export CSV" }).click();
    expect((await download).suggestedFilename()).toBe("audit-northstar.csv");
    void formAlert;
  });
});
