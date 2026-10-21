import { join } from "node:path";

import { expect, type Page } from "@playwright/test";

import { formAlert, signIn, test, USERS } from "./app/support";

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
