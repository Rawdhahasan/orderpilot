import { join } from "node:path";

import { expect, type Page } from "@playwright/test";

import { localSql, test } from "./app/support";

const FILES = join(__dirname, "../fixtures/imports");
const NS = "/o/northstar";

async function check(page: Page, kind: string, file: string) {
  await page.goto(`${NS}/settings/import`);
  await page.getByLabel("What are you importing?").selectOption(kind);
  await page.getByLabel("CSV file").setInputFiles(join(FILES, file));
  await page.getByRole("button", { name: "Check the file" }).click();
}

test.describe("CSV imports", () => {
  test("an invalid file shows every problem row and writes nothing", async ({ open }) => {
    const page = await open({ as: "nsOwner" });
    await check(page, "customers", "customers-invalid.csv");
    const report = page.getByTestId("import-report");
    await expect(report).toContainText("2 rows need fixing. Nothing was written.");
    await expect(report).toContainText("Row 1: name is required");
    await expect(report).toContainText("Row 2: account number appears twice in the file");
    await expect(page.getByRole("button", { name: /^Import/ })).toHaveCount(0);
  });

  test("customers, products and opening stock are imported after a preview", async ({ open }) => {
    const page = await open({ as: "nsOwner" });
    await check(page, "customers", "customers.csv");
    await expect(
      page.getByText("All 2 rows are valid. Nothing has been written yet."),
    ).toBeVisible();
    expect(localSql(`select count(*) from public.customers where account_number = 'C-5001'`)).toBe(
      "0",
    );
    await page.getByRole("button", { name: "Import 2 rows" }).click();
    await expect(page.getByText("Imported. 2 records written.")).toBeVisible();
    await page.goto(`${NS}/customers?q=Willow`);
    await expect(page.getByRole("link", { name: "Willow Creek Dental (fictional)" })).toBeVisible();

    await check(page, "products", "products.csv");
    await page.getByRole("button", { name: "Import 2 rows" }).click();
    await expect(page.getByText("Imported. 2 records written.")).toBeVisible();

    await check(page, "stock", "stock.csv");
    await page.getByRole("button", { name: "Import 1 row" }).click();
    await expect(page.getByText("Imported. 1 record written.")).toBeVisible();
    await page.goto(`${NS}/inventory?q=IMP-1`);
    await expect(page.getByRole("row", { name: /IMP-1/ })).toContainText("40 EA");
  });

  test("templates download with the expected columns", async ({ open }) => {
    const page = await open({ as: "nsOwner" });
    const res = await page.request.get(`${NS}/settings/import/template?kind=products`);
    expect(res.status()).toBe(200);
    expect((await res.text()).split("\r\n")[0]).toBe(
      "sku,name,description,selling_uom,quantity_decimals,list_price,gtin,track_inventory,reorder_point",
    );
  });
});
