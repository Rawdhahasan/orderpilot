import { expect } from "@playwright/test";

import { localSql, signIn, test, USERS } from "./app/support";

const NS = "/o/northstar";

test.describe("AI usage (free-tier safety)", () => {
  test("Owners see the provider, limits and recent calls of their own workspace only", async ({
    open,
  }) => {
    // A fictional usage row in another workspace must never appear here.
    localSql(`insert into public.ai_usage_events (organization_id, provider, model, outcome, total_tokens)
              values ('00000000-0000-4000-b000-000000000001', 'gemini', 'other-workspace-model', 'succeeded', 1)`);
    const page = await open({ as: "nsOwner" });
    await page.goto(`${NS}/settings`);
    await page.getByRole("link", { name: "AI usage" }).click();
    await expect(page.getByRole("heading", { name: "AI usage", level: 1 })).toBeVisible();
    // Tests always run with the simulated provider: no AI calls are made.
    await expect(page.getByTestId("ai-provider")).toHaveText(/Simulated/);
    await expect(page.getByTestId("ai-usage-today")).toHaveText(/of 50 calls/);
    await expect(page.getByText("other-workspace-model")).toHaveCount(0);
  });

  test("a Processor cannot see AI usage", async ({ page }) => {
    await signIn(page, USERS.nsProcessor);
    await page.goto(`${NS}/settings/ai-usage`);
    await expect(page.getByText("You need the Owner or Admin role", { exact: true })).toBeVisible();
    await expect(page.getByTestId("ai-provider")).toHaveCount(0);
  });
});
