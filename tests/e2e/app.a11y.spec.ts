import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

import { localSql, signIn, submittedIntake, test, USERS } from "./app/support";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} → ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(", ")}`,
    );
}

const consoleErrors = new WeakMap<Page, string[]>();

/** Records browser errors and failed requests for a page (hydration and runtime bugs). */
function watch(page: Page) {
  if (consoleErrors.has(page)) return;
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  // Failed requests are reported with their URL by the response listener.
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      !m.text().startsWith("Failed to load resource") &&
      errors.push(`${page.url()}: ${m.text()}`),
  );
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("response", (r) => {
    // Orders built directly in the database for these checks have no stored file.
    if (r.status() >= 400 && !r.url().includes("/api/documents/"))
      errors.push(`${r.status()} ${r.url()}`);
  });
}

async function check(page: Page, path: string) {
  watch(page);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  expect(await seriousViolations(page), path).toEqual([]);
  expect(consoleErrors.get(page), path).toEqual([]);
  // Phone widths: the page itself never scrolls sideways (tables scroll in their own container).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.describe("accessibility of the signed-in product (WCAG 2.2 AA, axe-core)", () => {
  test("public pages", async ({ page }) => {
    for (const path of ["/sign-in", "/forgot-password", "/invite/not-a-token"])
      await check(page, path);
  });

  test("every main screen as an Owner, at desktop and phone widths", async ({ open }) => {
    const intake = submittedIntake({
      po: "A11Y-1",
      lines: [{ sku: "JAN-1001", qty: 2, price: 8.95 }],
    });
    // An approved order for the sales order detail page (approved as the seed Approver).
    const approved = submittedIntake({
      po: "A11Y-SO",
      lines: [{ sku: "JAN-1001", qty: 1, price: 8.95 }],
    });
    const salesOrder = localSql(
      `select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a500-000000000003", "role": "authenticated"}', false);
       select public.approve_inbound_order('${approved}', 1) ->> 'sales_order_id';`,
    )
      .split("\n")
      .pop()!;
    const customer = "00000000-0000-4000-a200-000000000001";
    const product = "00000000-0000-4000-a400-000000000001";
    const page = await open({ as: "nsOwner" });
    const paths = [
      "/o/northstar/dashboard",
      "/o/northstar/customer-pos",
      "/o/northstar/customer-pos/upload",
      `/o/northstar/customer-pos/${intake}`,
      "/o/northstar/approvals",
      `/o/northstar/approvals/${intake}`,
      "/o/northstar/sales-orders",
      `/o/northstar/sales-orders/${salesOrder}`,
      "/o/northstar/settings/import",
      "/o/northstar/customers",
      `/o/northstar/customers/${customer}`,
      `/o/northstar/customers/${customer}?tab=addresses`,
      "/o/northstar/products",
      `/o/northstar/products/${product}`,
      "/o/northstar/inventory",
      `/o/northstar/inventory/${product}`,
      "/o/northstar/audit",
      "/o/northstar/settings",
      "/o/northstar/settings/members",
      "/o/northstar/settings/ai-usage",
      "/account",
      "/account/security",
    ];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of paths) await check(page, path);
    }
  });

  test("the review screen in edit mode", async ({ page }) => {
    const id = submittedIntake({ po: "A11Y-2", lines: [{ sku: "JAN-2207", qty: 3, price: 39 }] });
    // Back to review, as if changes were requested (fixture only).
    localSql(
      `set orderpilot.transition = 'on'; update public.inbound_orders set status = 'in_review', validated_version = null where id = '${id}'`,
    );
    await signIn(page, USERS.nsProcessor);
    await check(page, `/o/northstar/customer-pos/${id}`);
    await expect(page.getByTestId("review-workspace")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    // Phone width: the document and the order are tabs (FR-REV-01).
    await page.setViewportSize({ width: 390, height: 900 });
    await check(page, `/o/northstar/customer-pos/${id}`);
    await page.getByRole("tab", { name: "Original document" }).click();
    await expect(page.getByRole("tab", { name: "Original document" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await seriousViolations(page)).toEqual([]);
  });
});
