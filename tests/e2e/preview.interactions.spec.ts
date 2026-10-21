import { expect, test } from "@playwright/test";

import { goViaNav, viewAs } from "./helpers";

const PREVIEW_ONLY = "Preview only — nothing was saved";

test.describe("interactive preview journeys", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("review a clean PO, confirm in bulk and submit (preview only)", async ({ page }) => {
    await page.goto("/preview/customer-pos/in-001043");
    const submit = page.getByRole("button", { name: "Submit for approval" });
    await expect(submit).toBeDisabled();

    await page.getByRole("button", { name: "Confirm customer", exact: true }).click();
    for (const label of [
      "Customer PO number",
      "PO date",
      "Requested delivery",
      "Payment terms (as printed)",
      "Currency",
    ]) {
      await page.getByRole("button", { name: `Confirm ${label}` }).click();
    }
    await page.getByRole("combobox", { name: "Select a saved ship-to address" }).click();
    await page.getByRole("option", { name: /Store support centre/ }).click();

    await page.getByRole("button", { name: /Confirm high-confidence lines \(4\)/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirm 4 lines" }).click();

    await expect(page.getByText("Ready to submit", { exact: true })).toBeVisible();
    await expect(submit).toBeEnabled();
    await submit.click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit for approval" }).click();
    await expect(page.getByText(PREVIEW_ONLY)).toBeVisible();
  });

  test("resolving an exception removes it from the panel", async ({ page }) => {
    await page.goto("/preview/customer-pos/in-001042");
    const rail = page.getByRole("complementary", { name: "Exceptions" });
    await expect(rail.getByRole("article", { name: /Ambiguous date/ })).toBeVisible();
    await page.getByRole("button", { name: "Nov 4, 2026" }).click();
    await expect(rail.getByRole("article", { name: /Blocking: Ambiguous date/ })).toHaveCount(0);

    await expect(
      rail.getByRole("article", { name: /Blocking: Unit mismatch, Line 3/ }),
    ).toBeVisible();
    await page.getByLabel("Reason (required)").fill("Case of 4 per customer catalog");
    await page.getByRole("button", { name: /Convert 5 CS → 20 EA/ }).click();
    await expect(rail.getByRole("article", { name: /Blocking: Unit mismatch/ })).toHaveCount(0);
    await expect(page.getByText(/Converted 5 CS/)).toBeVisible();
  });

  test("independent approval: the submitter cannot approve", async ({ page }) => {
    await page.goto("/preview/approvals/in-001039");
    await expect(page.getByRole("button", { name: "Approve order" })).toBeDisabled();
    await expect(page.getByRole("status")).toContainText("You submitted this customer PO");
    await viewAs(page, "Sofia Brandt");
    await page.getByRole("button", { name: "Approve order" }).click();
    const dialog = page.getByRole("dialog", { name: "Approve this order?" });
    await expect(dialog).toContainText("SO-2026-000413");
    await dialog.getByRole("button", { name: "Approve order" }).click();
    await expect(page.getByText(PREVIEW_ONLY)).toBeVisible();
  });

  test("override required, then a stock decision with a full backorder (C-01, M-03)", async ({
    page,
  }) => {
    await page.goto("/preview/approvals/in-001040");
    const approve = page.getByRole("button", { name: "Approve order" });
    await expect(approve).toBeDisabled();
    await expect(page.getByRole("status")).toContainText("Override or return 1 item");

    await page.getByRole("button", { name: "Override…" }).click();
    const overrideDialog = page.getByRole("dialog");
    await expect(overrideDialog.getByRole("button", { name: "Override" })).toBeDisabled();
    await overrideDialog
      .getByLabel("Reason (required)")
      .fill("Finance confirmed payment in transit");
    await overrideDialog.getByRole("button", { name: "Override" }).click();
    await expect(page.getByText(/Overridden by Ahmed Karim/)).toBeVisible();

    await approve.click();
    const stock = page.getByRole("dialog", { name: /Stock is short/ });
    await stock.getByLabel("Reserve nothing and backorder all 24 EA").check();
    await stock.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("dialog", { name: "Approve this order?" })).toContainText(
      "backordered (24 EA)",
    );
  });

  test("roles change what the preview shows", async ({ page }) => {
    await page.goto("/preview/dashboard");
    await viewAs(page, "Sam Price");
    await expect(page.getByRole("button", { name: /Upload PO/ })).toHaveCount(0);
    await goViaNav(page, "Customer POs");
    await page.getByRole("link", { name: "IN-001042" }).click();
    await expect(
      page.getByText("Read-only: your role can view customer POs but not review them."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);
  });

  test("stock adjustments cannot take on hand below zero", async ({ page }) => {
    await page.goto("/preview/inventory");
    await viewAs(page, "Marc Dubois");
    await page
      .getByRole("row", { name: /JAN-3104/ })
      .getByRole("button", { name: "Adjust" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Adjust stock" });
    await dialog.getByLabel(/Change in EA/).fill("-100");
    await expect(dialog.getByRole("alert")).toContainText("On hand cannot go below zero");
    await expect(dialog.getByRole("button", { name: /Record adjustment/ })).toBeDisabled();
    await dialog.getByLabel(/Change in EA/).fill("-50");
    await expect(dialog.getByRole("alert")).toContainText("over-committed by 10 EA");
  });
});
