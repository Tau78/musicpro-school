import { expect, test } from "@playwright/test";

const email = process.env.PLAYWRIGHT_ASSOCIATO_EMAIL?.trim();
const password = process.env.PLAYWRIGHT_ASSOCIATO_PASSWORD?.trim();

test.describe("Prenotazione — account test", () => {
  test.skip(!email || !password, "Credenziali Playwright associato mancanti");

  test("crea prenotazione end-to-end", async ({ page }) => {
    await page.goto(`/login?redirect=${encodeURIComponent("/prenotazioni")}`);
    await page.locator("#auth-email").fill(email!);
    await page.locator("#auth-password").fill(password!);
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.waitForURL(/\/prenotazioni/, { timeout: 30_000 });

    await expect(page.getByRole("heading", { name: "Prenota una sala" })).toBeVisible();

    const sessionHeading = page.getByRole("heading", { name: "Tipo di sessione" });
    if (await sessionHeading.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /continua/i }).first().click();
    }

    const bandHeading = page.getByRole("heading", { name: /band/i });
    if (await bandHeading.isVisible().catch(() => false)) {
      const firstBand = page.locator('input[type="radio"]').first();
      if (await firstBand.isVisible().catch(() => false)) {
        await firstBand.check();
        await page.getByRole("button", { name: /continua/i }).click();
      }
    }

    await expect(page.locator("#room")).toBeVisible({ timeout: 15_000 });
    await page.locator("#room").selectOption({ index: 0 });
    await page.getByRole("button", { name: "Continua" }).click();

    await expect(page.locator("#date")).toBeVisible({ timeout: 15_000 });

    let booked = false;
    for (let dayOffset = 1; dayOffset <= 14 && !booked; dayOffset += 1) {
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      const iso = d.toISOString().slice(0, 10);
      await page.locator("#date").fill(iso);

      const slotButton = page
        .locator("ul.grid button")
        .filter({ hasText: /^\d{1,2}:\d{2}/ })
        .first();

      try {
        await slotButton.waitFor({ state: "visible", timeout: 5_000 });
        await slotButton.click();
        booked = true;
      } catch {
        // prova giorno successivo
      }
    }

    expect(booked).toBeTruthy();

    const payCredits = page.getByRole("button", { name: /paga con crediti/i });
    const payStripe = page.getByRole("button", { name: /procedi al pagamento/i });

    // Il saldo crediti arriva async: attendi un percorso di pagamento prima di scegliere.
    await expect(payCredits.or(payStripe)).toBeVisible({ timeout: 15_000 });

    if (await payCredits.isVisible().catch(() => false)) {
      await payCredits.click();
      await expect(
        page.getByText(/prenotazione confermata|pagata con crediti|richiesta inviata/i).first(),
      ).toBeVisible({ timeout: 30_000 });
      return;
    }

    await expect(payStripe).toBeVisible({ timeout: 10_000 });
    await Promise.all([
      page.waitForURL(/stripe\.com|checkout\.stripe\.com/i, { timeout: 30_000 }),
      payStripe.click(),
    ]);
  });
});
