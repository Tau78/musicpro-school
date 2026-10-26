/**
 * Anteprima HTML conferma prenotazione (nessun invio).
 *   npx tsx musicpro/apps/web/scripts/preview-booking-email.mts [out.html]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  SCHOOL_APP_URL,
  schoolEmailHeroHtml,
  wrapSchoolEmail,
} from "../src/lib/email/school-email-layout";

const out =
  process.argv[2]?.trim() ||
  resolve("/tmp/musicpro-email-preview-conferma.html");

const rows = [
  ["Durata", "2 ore"],
  ["Importo", "30,00 €"],
  ["Pagamento", "Pagata con crediti"],
  ["Saldo crediti", "4 crediti"],
].map(
  ([label, value], index, list) =>
    `<tr><td style="padding:10px 14px;border-bottom:${index === list.length - 1 ? "0" : "1px solid #eee"};color:#6b7280;width:120px;font-size:14px;">${label}</td><td style="padding:10px 14px;border-bottom:${index === list.length - 1 ? "0" : "1px solid #eee"};font-weight:600;font-size:15px;color:#111827;">${value}</td></tr>`,
);

const htmlBody = `
        <p style="margin:0 0 14px;">Ciao <strong>Francesco</strong>,</p>
        <p style="margin:0 0 16px;">Ti aspettiamo in sala. Ecco il riepilogo.</p>
        ${schoolEmailHeroHtml("Sala prove", "Arancio", "mercoledì 4 novembre 2026 · 21:00 – 23:00")}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:8px 0 4px;background:#faf8f3;border-radius:10px;">${rows.join("")}</table>
        <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#4b5563;">Puoi annullare fino a 24 ore prima: l'importo torna come crediti sul saldo (meno l'eventuale penale).</p>`;

const html = wrapSchoolEmail({
  appOrigin: SCHOOL_APP_URL,
  preheader: "Sala Arancio · mercoledì 4 novembre 2026 · 21:00 – 23:00",
  title: "Prenotazione confermata",
  htmlBody,
  ctas: [
    {
      href: `${SCHOOL_APP_URL}/prenotazioni/mie`,
      label: "Le tue prenotazioni",
    },
  ],
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(out);
