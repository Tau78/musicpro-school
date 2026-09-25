import { expect, test } from "@playwright/test";

test.describe("Prenotazioni sale — pagine pubbliche", () => {
  test("home prenotazioni risponde 200", async ({ page }) => {
    const response = await page.goto("/prenotazioni");
    expect(response?.status()).toBeLessThan(400);
    await expect(
      page.getByRole("heading", { name: "Prenota una sala" }),
    ).toBeVisible();
  });

  test("form accesso visibile su prenotazioni anonimo", async ({ page }) => {
    await page.goto("/prenotazioni");
    await expect(
      page.getByRole("heading", { name: "Accedi per prenotare" }),
    ).toBeVisible();
  });

  test("le mie prenotazioni chiede accesso se anonimo", async ({ page }) => {
    await page.goto("/prenotazioni/mie");
    await expect(page.getByRole("link", { name: /accedi/i })).toBeVisible();
  });

  test("pagina login", async ({ page }) => {
    const response = await page.goto("/login?redirect=/prenotazioni");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading")).toBeVisible();
  });
});
