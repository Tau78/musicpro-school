import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import {
  buildReceiptsNote,
  formatEuro,
  formatReimbursementDateItalian,
  reimbursementPdfFilename,
} from "@musicpro/database";

export interface NotulaPdfInput {
  progressive: string;
  fiscalYear: number;
  associateName: string;
  address?: string | null;
  taxCode?: string | null;
  grossAmountEur: number;
  paymentMethod: string | null;
  paymentDate: string | null;
  receiptsAmountEur: number;
  receiptsNote?: string | null;
  historicBalanceEur?: number;
  generatedAt?: string | null;
  signedAt?: string | null;
}

export interface GeneratedNotulaPdf {
  bytes: Uint8Array;
  filename: string;
  contentType: "application/pdf";
}

function formatPaymentDate(value: string | null | undefined): string {
  if (!value) return "—";
  // Already ISO date (YYYY-MM-DD) or timestamptz
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return formatReimbursementDateItalian(value);
}

function buildReceiptsLine(input: NotulaPdfInput): string {
  if (input.receiptsNote?.trim()) return input.receiptsNote.trim();
  return buildReceiptsNote({
    grossAmountEur: input.grossAmountEur,
    receiptsAmountEur: input.receiptsAmountEur,
    historicBalanceEur: input.historicBalanceEur ?? 0,
  });
}

/**
 * Generates an Italian notula PDF. Persistence (Storage + Drive
 * `Rimborsi {year}/{cognome}`) is handled by persistReimbursementPdf.
 */
export async function generateReimbursementPdf(
  input: NotulaPdfInput,
): Promise<GeneratedNotulaPdf> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 780;
  const lineGap = 18;
  const black = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.35, 0.35, 0.35);

  const draw = (
    text: string,
    opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> },
  ) => {
    const size = opts?.size ?? 11;
    const used = opts?.bold ? fontBold : font;
    const lines = text.split("\n");
    for (const line of lines) {
      page.drawText(sanitizePdfText(line, used), {
        x: margin,
        y,
        size,
        font: used,
        color: opts?.color ?? black,
      });
      y -= lineGap;
    }
  };

  const docNumber = `${input.progressive}/${input.fiscalYear}`;
  const generated =
    input.generatedAt != null
      ? formatReimbursementDateItalian(input.generatedAt)
      : formatReimbursementDateItalian(new Date().toISOString());

  draw("MusicPro School", { bold: true, size: 16 });
  draw("Notula di rimborso spese", { bold: true, size: 13, color: muted });
  y -= 8;

  draw(`Numero documento: ${docNumber}`, { bold: true });
  draw(`Data generazione: ${generated}`);
  y -= 8;

  draw("Associato", { bold: true, size: 12 });
  draw(input.associateName, { bold: true, size: 12 });
  if (input.address?.trim()) draw(`Indirizzo: ${input.address.trim()}`);
  if (input.taxCode?.trim()) draw(`Cod. fiscale: ${input.taxCode.trim()}`);
  y -= 8;

  draw("Importi", { bold: true, size: 12 });
  draw(`Importo lordo: ${formatEuro(input.grossAmountEur)}`);
  draw(`Importo netto: ${formatEuro(input.grossAmountEur)}`);
  draw(`Modalità di pagamento: ${input.paymentMethod?.trim() || "—"}`);
  draw(`Data pagamento: ${formatPaymentDate(input.paymentDate)}`);
  y -= 8;

  draw("Ricevute", { bold: true, size: 12 });
  draw(buildReceiptsLine(input));
  y -= 24;

  draw(
    "Documento generato automaticamente dal sistema MusicPro School.",
    { size: 9, color: muted },
  );
  if (input.signedAt) {
    draw(`Firmato dall'associato il ${formatReimbursementDateItalian(input.signedAt)}`, {
      size: 10,
    });
  } else {
    draw("Firma associato: _______________________________", {
      size: 10,
      color: muted,
    });
  }

  const bytes = await doc.save();
  const filename = reimbursementPdfFilename({
    progressive: input.progressive,
    fiscalYear: input.fiscalYear,
    associateName: input.associateName,
  });

  return {
    bytes,
    filename,
    contentType: "application/pdf",
  };
}

/** WinAnsi-safe text for Helvetica (maps common Italian chars). */
function sanitizePdfText(
  value: string,
  font?: { encodeText: (text: string) => unknown },
): string {
  const mapped = value
    .replace(/€/g, "EUR")
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");

  let out = "";
  for (const ch of mapped) {
    if (!font) {
      out += ch;
      continue;
    }
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out.slice(0, 110);
}

/**
 * Printable HTML notula (fallback when Storage upload fails / client-side open).
 */
export function generateReimbursementHtml(input: NotulaPdfInput): string {
  const docNumber = `${input.progressive}/${input.fiscalYear}`;
  const generated =
    input.generatedAt != null
      ? formatReimbursementDateItalian(input.generatedAt)
      : formatReimbursementDateItalian(new Date().toISOString());
  const receipts = buildReceiptsLine(input).replace(/\n/g, "<br/>");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8"/>
  <title>Notula ${escapeHtml(docNumber)}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; max-width: 720px; margin: 40px auto; color: #1a1a1a; line-height: 1.45; }
    h1 { font-size: 1.4rem; margin: 0 0 4px; }
    h2 { font-size: 1.1rem; font-weight: 600; color: #444; margin: 0 0 24px; }
    .row { margin: 6px 0; }
    .label { color: #555; }
    .section { margin-top: 22px; padding-top: 12px; border-top: 1px solid #ddd; }
    .muted { color: #666; font-size: 0.9rem; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <h1>MusicPro School</h1>
  <h2>Notula di rimborso spese</h2>
  <div class="row"><span class="label">Numero documento:</span> <strong>${escapeHtml(docNumber)}</strong></div>
  <div class="row"><span class="label">Data generazione:</span> ${escapeHtml(generated)}</div>
  <div class="section">
    <div class="row"><strong>${escapeHtml(input.associateName)}</strong></div>
    ${input.address?.trim() ? `<div class="row"><span class="label">Indirizzo:</span> ${escapeHtml(input.address.trim())}</div>` : ""}
    ${input.taxCode?.trim() ? `<div class="row"><span class="label">Cod. fiscale:</span> ${escapeHtml(input.taxCode.trim())}</div>` : ""}
  </div>
  <div class="section">
    <div class="row"><span class="label">Importo lordo:</span> ${escapeHtml(formatEuro(input.grossAmountEur))}</div>
    <div class="row"><span class="label">Importo netto:</span> ${escapeHtml(formatEuro(input.grossAmountEur))}</div>
    <div class="row"><span class="label">Modalità di pagamento:</span> ${escapeHtml(input.paymentMethod?.trim() || "—")}</div>
    <div class="row"><span class="label">Data pagamento:</span> ${escapeHtml(formatPaymentDate(input.paymentDate))}</div>
  </div>
  <div class="section">
    <div class="row"><span class="label">Ricevute</span></div>
    <div class="row">${receipts}</div>
  </div>
  <p class="muted" style="margin-top:36px">Documento generato automaticamente dal sistema MusicPro School.</p>
  <p class="muted">${
    input.signedAt
      ? `Firmato dall'associato il ${escapeHtml(formatReimbursementDateItalian(input.signedAt))}`
      : "Firma associato: _______________________________"
  }</p>
  <script>window.onload=function(){/* ready for print */}</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function openPrintableNotula(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
}
