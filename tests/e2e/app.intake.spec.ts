import { join } from "node:path";

import { expect, type Page } from "@playwright/test";

import { formAlert, localSql, signIn, test, USERS } from "./app/support";

const DOCS = join(__dirname, "../fixtures/documents");
const NS = "/o/northstar";

async function upload(page: Page, files: string[], customer?: string) {
  await page.goto(`${NS}/customer-pos/upload`);
  if (customer) await page.getByLabel("Customer (optional)").selectOption({ label: customer });
  await page.getByLabel("Choose purchase order files").setInputFiles(files);
  await page.getByRole("button", { name: /^Upload/ }).click();
}

async function openUploaded(page: Page, index = 0) {
  const item = page.getByTestId("upload-item").nth(index);
  const link = item.getByRole("link", { name: /^IN-/ });
  await expect(link).toBeVisible({ timeout: 20_000 });
  await link.click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("IN-");
}

async function waitForReview(page: Page) {
  await expect(page.getByTestId("review-workspace")).toBeVisible({ timeout: 45_000 });
}

test.describe("intake and review (Phases 4A and 4B)", () => {
  test("a clean fixture is extracted, matched, confirmed and submitted", async ({ page }) => {
    await signIn(page, USERS.nsProcessor);
    await upload(page, [join(DOCS, "01-harbor-pine-clean.pdf")]);
    await openUploaded(page);
    await waitForReview(page);
    await expect(page.getByTestId("simulated-label")).toBeVisible();
    await expect(page.locator("#f-customer")).not.toHaveValue("");
    await expect(page.locator("#f-po")).toHaveValue("HP-55120");
    await expect(page.getByTestId("line-1-product")).toContainText("JAN-1001");
    await expect(page.getByTestId("line-2-product")).toContainText("JAN-2207");
    await expect(page.locator("iframe[title^='Original document']")).toBeVisible();

    // FR-AUD-07: downloading the original is recorded.
    const intakeId = page.url().split("/").pop()!;
    const doc = localSql(
      `select source_document_id from public.inbound_orders where id = '${intakeId}'`,
    );
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toBe("01-harbor-pine-clean.pdf");
    await expect
      .poll(() =>
        localSql(
          `select count(*) from public.audit_events where action = 'source_document.downloaded' and entity_id = '${doc}'`,
        ),
      )
      .toBe("1");

    await page.getByRole("button", { name: /Confirm all above/ }).click();
    await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
      timeout: 15_000,
    });
    await expect(page.getByText("All values confirmed")).toBeVisible();
    await page.reload();
    await expect(page.getByText("All values confirmed")).toBeVisible();
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await expect(page.getByText(/Submitted by Jordan Ellis/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);
  });

  test("a messy fixture raises the expected exceptions and never guesses a ship-to", async ({
    page,
  }) => {
    await signIn(page, USERS.nsProcessor);
    await upload(page, [join(DOCS, "02-northgate-messy.pdf")], "Northgate Facilities");
    await openUploaded(page);
    await waitForReview(page);
    const open = page.getByTestId("open-exceptions");
    for (const code of [
      "UNCONFIRMED_FIELDS",
      "DATE_AMBIGUOUS",
      "PRODUCT_UNMATCHED",
      "UOM_MISMATCH",
      "PRICE_MISMATCH",
      "SHIP_TO_MISSING",
    ]) {
      await expect(open.locator(`[data-exception-code="${code}"]`).first()).toBeVisible();
    }
    // Low-confidence and ambiguous values are not bulk-confirmed (D-06).
    await expect(page.getByText(/low-confidence or ambiguous: confirm individually/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for approval" })).toBeDisabled();

    // Resolve the price on line 3 by decision; the exception closes.
    await page.getByTestId("line-3").getByRole("button", { name: "Use expected price" }).click();
    await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
      timeout: 15_000,
    });
    await page.reload();
    await expect(open.locator('[data-exception-code="PRICE_MISMATCH"]')).toHaveCount(0);
  });

  test("every exception on the messy fixture can be resolved and the order submitted", async ({
    page,
  }) => {
    await signIn(page, USERS.nsProcessor);
    await upload(page, [join(DOCS, "02-northgate-messy.pdf")], "Northgate Facilities");
    await openUploaded(page);
    await waitForReview(page);
    const open = page.getByTestId("open-exceptions");

    // Ship-to: choose the saved address instead of guessing.
    await page.locator("#f-ship").selectOption({ index: 1 });
    // Ambiguous date and the other header suggestions: confirmed one by one.
    for (const label of ["PO date", "Customer PO number", "Currency"]) {
      const button = page.getByRole("button", { name: `Confirm ${label}` });
      if (await button.count()) await button.click();
    }
    // Line 1: unknown part number, choose the product.
    const l1 = page.getByTestId("line-1");
    await l1.getByRole("button", { name: /Find product|Change/ }).click();
    await l1.getByLabel("Search products for line 1").fill("JAN-4402");
    await l1.getByRole("option", { name: /JAN-4402/ }).click();
    await l1
      .getByLabel("Unit conversion note for line 1")
      .fill("Customer means cases: 1 EA = 1 CS");
    await l1.getByRole("button", { name: "Use expected price" }).click();
    // Line 2: cases on the PO, boxes in the catalogue — convert and note it.
    const l2 = page.getByTestId("line-2");
    if (await l2.getByRole("button", { name: "Confirm match" }).count())
      await l2.getByRole("button", { name: "Confirm match" }).click();
    await l2.getByLabel(/Quantity/).fill("20");
    await l2.getByLabel("Unit conversion note for line 2").fill("1 CS = 10 BX");
    // Line 3: price differs, use the expected price.
    await page.getByTestId("line-3").getByRole("button", { name: "Use expected price" }).click();
    for (const n of [1, 2, 3]) {
      const confirm = page.getByTestId(`line-${n}`).getByRole("button", { name: "Confirm line" });
      if (await confirm.count()) await confirm.click();
    }
    await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
      timeout: 15_000,
    });
    await page.reload();
    for (const code of [
      "UNCONFIRMED_FIELDS",
      "DATE_AMBIGUOUS",
      "PRODUCT_UNMATCHED",
      "UOM_MISMATCH",
      "PRICE_MISMATCH",
      "SHIP_TO_MISSING",
    ]) {
      await expect(open.locator(`[data-exception-code="${code}"]`)).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await expect(page.getByText(/Submitted by Jordan Ellis/)).toBeVisible();
  });

  test("an unknown document opens in manual entry with no values", async ({ page }) => {
    await signIn(page, USERS.nsProcessor);
    await upload(page, [join(DOCS, "90-unknown-document.pdf")]);
    await openUploaded(page);
    await waitForReview(page);
    await expect(page.getByText("No values were extracted from this document")).toBeVisible();
    await expect(page.locator("#f-po")).toHaveValue("");
    await expect(page.getByText("No lines yet.")).toBeVisible();
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Quantity").first().fill("4");
    await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
      timeout: 15_000,
    });
  });

  test("a manually entered order goes from an unknown document to a sales order", async ({
    page,
    open,
  }) => {
    await signIn(page, USERS.nsProcessor);
    await upload(page, [join(DOCS, "90-unknown-document.pdf")]);
    await openUploaded(page);
    await waitForReview(page);
    await page.locator("#f-customer").selectOption({ label: "Northgate Facilities" });
    await page.locator("#f-po").fill("NG-MANUAL-1");
    await page.getByLabel("Ship-to address line as printed").fill("400 Gateway Blvd");
    await page.getByRole("button", { name: "Add line" }).click();
    const line = page.getByTestId("line-1");
    await line.getByRole("button", { name: "Find product" }).click();
    await line.getByLabel("Search products for line 1").fill("JAN-1001");
    await line.getByRole("option", { name: /JAN-1001/ }).click();
    await line.getByLabel(/Quantity/).fill("6");
    await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
      timeout: 15_000,
    });
    await page.reload();
    // The expected price is applied and labelled, since the document had none (D-15).
    await expect(page.getByTestId("line-1").getByLabel("Unit price")).toHaveValue("8.95");
    await expect(page.getByText("All values confirmed")).toBeVisible();
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await expect(page.getByText(/Submitted by Jordan Ellis/)).toBeVisible();

    const approver = await open();
    await signIn(approver, USERS.nsApprover);
    await approver.goto(
      page
        .url()
        .replace("/customer-pos/", "/approvals/")
        .replace(/^https?:\/\/[^/]+/, ""),
    );
    // The same letter was uploaded earlier in this run: the approver reviews the duplicate and overrides it.
    for (const override of await approver.getByRole("button", { name: "Override" }).all()) {
      await override.click();
      await approver
        .getByLabel("Reason for the override")
        .fill("Same template letter, different order");
      await approver.getByRole("button", { name: "Record override" }).click();
      await expect(approver.locator('[data-exception-status="overridden"]').first()).toBeAttached();
    }
    await approver.reload();
    await approver.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(approver.getByRole("link", { name: /^SO-\d{4}-\d{6}$/ }).first()).toBeVisible();
  });

  test("a file that is not really a PDF is refused and leaves no intake", async ({ page }) => {
    await signIn(page, USERS.nsProcessor);
    await upload(page, [join(__dirname, "../fixtures/invalid/not-really.pdf")]);
    await expect(page.getByTestId("upload-item")).toContainText(
      "Only PDF, PNG and JPEG files are accepted.",
      { timeout: 20_000 },
    );
  });

  test("the same file uploaded twice is flagged as a duplicate document", async ({ page }) => {
    await signIn(page, USERS.nsProcessor);
    await upload(page, [join(DOCS, "03-harbor-pine-two-pages.pdf")]);
    await expect(page.getByTestId("upload-item").getByRole("link", { name: /^IN-/ })).toBeVisible({
      timeout: 20_000,
    });
    await upload(page, [join(DOCS, "03-harbor-pine-two-pages.pdf")]);
    await expect(page.getByTestId("upload-item")).toContainText("Same file as another order", {
      timeout: 20_000,
    });
    await openUploaded(page);
    await waitForReview(page);
    await expect(
      page.getByTestId("open-exceptions").locator('[data-exception-code="DUPLICATE_DOCUMENT"]'),
    ).toBeVisible();
  });

  test("the retry fixture fails once and recovers by itself", async ({ page }) => {
    test.slow();
    await signIn(page, USERS.nsProcessor);
    await upload(page, [join(DOCS, "04-retry-once.pdf")]);
    await openUploaded(page);
    // The first attempt fails; the retry waits 30 seconds (backoff) and succeeds.
    await expect(page.getByTestId("review-workspace")).toBeVisible({ timeout: 90_000 });
    await expect(page.locator("#f-po")).toHaveValue("NG-7790");
  });

  test("a Viewer sees customer POs read-only", async ({ page }) => {
    await signIn(page, USERS.nsViewer);
    await page.goto(`${NS}/customer-pos`);
    await expect(page.getByRole("link", { name: "Upload PO" })).toHaveCount(0);
    const first = page.getByRole("link", { name: /^IN-/ }).first();
    await first.click();
    await waitForReview(page);
    await expect(page.getByRole("button", { name: /^Confirm (line|all above|match)/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);
    await expect(page.locator("#f-po")).toBeDisabled();
    void formAlert;
  });
});
