import { expect, test } from "@playwright/test";

const email = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim();
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim();

test.describe("Admin prenotazioni", () => {
  test.skip(!email || !password, "Imposta PLAYWRIGHT_ADMIN_EMAIL e PLAYWRIGHT_ADMIN_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await page.goto(`/login?redirect=${encodeURIComponent("/admin/prenotazioni")}`);
    await page.locator("#auth-email").fill(email!);
    await page.locator("#auth-password").fill(password!);
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.waitForURL(/\/admin/, { timeout: 30_000 });
  });

  test("calendario prenotazioni admin", async ({ page }) => {
    await page.goto("/admin/prenotazioni/calendario");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("lista prenotazioni admin", async ({ page }) => {
    await page.goto("/admin/prenotazioni/lista");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("impostazioni sale", async ({ page }) => {
    await page.goto("/admin/sale");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});
