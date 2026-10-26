import { describe, expect, it } from "vitest";

import {
  SCHOOL_APP_STORE_URL,
  SCHOOL_APP_URL,
  SCHOOL_BRAND_NAVY,
  SCHOOL_FACEBOOK_URL,
  SCHOOL_INSTAGRAM_URL,
  SCHOOL_SITE_URL,
  SCHOOL_YOUTUBE_URL,
  escapeEmailHtml,
  schoolEmailHeroHtml,
  schoolEmailTextFooter,
  wrapSchoolEmail,
} from "./school-email-layout";

describe("wrapSchoolEmail", () => {
  const html = wrapSchoolEmail({
    appOrigin: "https://school.musicproeventi.it",
    preheader: "Sala Arancio · mercoledì 4 novembre",
    kicker: "Sala prove",
    title: "Prenotazione confermata",
    htmlBody: "<p>Ciao Francesco,</p>",
    ctas: [{ href: "https://school.musicproeventi.it/prenotazioni/mie", label: "Le tue prenotazioni" }],
  });

  it("ha logo, sito, social e App Store", () => {
    expect(html).toContain("/images/receipt-assoc-logo.png");
    expect(html).toContain(SCHOOL_SITE_URL);
    expect(html).toContain(SCHOOL_APP_URL);
    expect(html).toContain(SCHOOL_INSTAGRAM_URL);
    expect(html).toContain(SCHOOL_FACEBOOK_URL);
    expect(html).toContain(SCHOOL_YOUTUBE_URL);
    expect(html).toContain(SCHOOL_APP_STORE_URL);
    expect(html).toContain("Scarica l'app");
  });

  it("CTA navy con testo bianco, senza rosso iscrizione", () => {
    expect(html).toContain(`background:${SCHOOL_BRAND_NAVY}`);
    expect(html).toContain("color:#ffffff");
    expect(html).not.toContain("#c41e3a");
  });

  it("usa il logo di produzione anche se l'origin è localhost", () => {
    const local = wrapSchoolEmail({
      appOrigin: "http://localhost:3000",
      title: "Test",
      htmlBody: "<p>ok</p>",
    });
    expect(local).toContain("https://school.musicproeventi.it/images/receipt-assoc-logo.png");
  });
});

describe("schoolEmailHeroHtml", () => {
  it("mostra sala e orario", () => {
    const hero = schoolEmailHeroHtml("Sala prove", "Arancio", "mercoledì 4 novembre 2026 · 21:00 – 23:00");
    expect(hero).toContain("Arancio");
    expect(hero).toContain("21:00");
  });
});

describe("schoolEmailTextFooter", () => {
  it("include social e app", () => {
    const text = schoolEmailTextFooter();
    expect(text).toContain(SCHOOL_SITE_URL);
    expect(text).toContain(SCHOOL_APP_STORE_URL);
    expect(text).toContain("Instagram");
  });
});

describe("escapeEmailHtml", () => {
  it("escapa markup", () => {
    expect(escapeEmailHtml(`<a href="x">`)).toBe("&lt;a href=&quot;x&quot;&gt;");
  });
});
