import { expect, test } from "@playwright/test";

const email = process.env.PLAYWRIGHT_ASSOCIATO_EMAIL?.trim();
const password = process.env.PLAYWRIGHT_ASSOCIATO_PASSWORD?.trim();

test.describe("Prenotazioni sale — associato autenticato", () => {
  test.skip(!email || !password, "Imposta PLAYWRIGHT_ASSOCIATO_EMAIL e PLAYWRIGHT_ASSOCIATO_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await page.goto(`/login?redirect=${encodeURIComponent("/prenotazioni")}`);
    await page.locator("#auth-email").fill(email!);
    await page.locator("#auth-password").fill(password!);
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.waitForURL(/\/(prenotazioni|dashboard)/, { timeout: 30_000 });
  });

  test("wizard prenotazione visibile dopo login", async ({ page }) => {
    await page.goto("/prenotazioni");
    await expect(page.getByText(/sala|prenota/i).first()).toBeVisible();
  });

  test("le mie prenotazioni elenca o empty state", async ({ page }) => {
    await page.goto("/prenotazioni/mie");
    await expect(
      page.getByRole("heading", { name: /le mie prenotazioni/i }),
    ).toBeVisible();
    await expect(page.getByText("Caricamento…")).toBeHidden({ timeout: 15_000 });

    const bookingCount = await page.locator("ul.mt-6.space-y-4 > li").count();
    if (bookingCount === 0) {
      await expect(page.getByText("Non hai prenotazioni future.")).toBeVisible();
    } else {
      expect(bookingCount).toBeGreaterThan(0);
    }
  });
});
