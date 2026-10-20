import { expect, type Page } from "@playwright/test";

/** Switches the visual-only preview persona. */
export async function viewAs(page: Page, name: string) {
  await page.getByTestId("persona-switcher").click();
  await page.getByRole("menuitemradio", { name: new RegExp(name) }).click();
  await expect(page.getByTestId("persona-switcher")).toContainText(name);
}

/** Navigates within the app (client-side) so the persona state is kept. */
export async function goViaNav(page: Page, label: string) {
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: new RegExp(`^${label}`) })
    .first()
    .click();
}
