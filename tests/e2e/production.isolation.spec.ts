import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { PREVIEW_ROUTES, SETTINGS_ROUTE } from "./routes";

const BUILD = join(__dirname, "../../.next");

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

test.describe("production build never exposes the development preview", () => {
  for (const path of [...PREVIEW_ROUTES.map((r) => r.path), SETTINGS_ROUTE, "/preview"]) {
    test(`${path} returns 404`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain("Northstar");
    });
  }

  test("preview routes are not compiled into the build", () => {
    const manifest = JSON.parse(
      readFileSync(join(BUILD, "app-path-routes-manifest.json"), "utf8"),
    ) as Record<string, string>;
    const routes = [...Object.keys(manifest), ...Object.values(manifest)];
    expect(routes.filter((r) => r.includes("preview"))).toEqual([]);
  });

  test("no fictional fixture text appears in the build output", () => {
    const offenders: string[] = [];
    for (const dir of ["server", "static"].map((d) => join(BUILD, d)).filter(existsSync)) {
      for (const file of files(dir)) {
        if (!/\.(js|html|json|rsc|txt|body|meta)$/.test(file)) continue;
        const text = readFileSync(file, "utf8");
        if (text.includes("Northstar") || text.includes("northstar.example")) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the home page goes to sign-in, with no preview link", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: /development preview/i })).toHaveCount(0);
  });

  test("security headers are set", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toContain("unsafe-eval");
  });
});
