import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { expect } from "@playwright/test";

import { test, USERS } from "./app/support";

const ROOT = join(__dirname, "../..");

// Runs last: it ends the Bayview Owner's saved session for good.
test.describe("MFA reset ends sessions (Phase 2C follow-up)", () => {
  test("after an operator MFA reset, the Owner's open session is signed out", async ({ open }) => {
    const page = await open({ as: "bvOwner" });
    await page.goto("/o/bayview/settings/members");
    await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();

    const output = execFileSync(
      "node",
      [
        "scripts/ops/reset-mfa.mjs",
        USERS.bvOwner,
        "E2E: lost phone, identity verified in the test",
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: [
            join(ROOT, "node_modules/.bin"),
            `${process.env.HOME}/.docker/bin`,
            process.env.PATH,
          ].join(":"),
        },
      },
    );
    expect(output).toMatch(/ended [1-9]\d* session/);

    await page.reload();
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });
});
