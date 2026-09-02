import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import {
  buildReceiptsNote,
  buildVersatiRimborsoLine,
  formatImportoPlain,
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

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 55;
const PRESIDENT_NAME = "Mauro Andreoni";

function formatPaymentDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return formatReimbursementDateItalian(value);
}

function buildReceiptsLine(input: NotulaPdfInput): string {
  if (input.receiptsNote?.trim()) {
    return input.receiptsNote.trim();
  }
  return buildReceiptsNote({
    grossAmountEur: input.grossAmountEur,
    receiptsAmountEur: input.receiptsAmountEur,
    historicBalanceEur: input.historicBalanceEur ?? 0,
  });
}

/** WinAnsi-safe text for Helvetica. Keeps € so the glyph helper can draw it. */
function sanitizePdfText(
  value: string,
  font?: { encodeText: (text: string) => unknown },
): string {
  const mapped = value
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");

  let out = "";
  for (const ch of mapped) {
    if (ch === "€") {
      out += ch;
      continue;
    }
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
  return out;
}

function euroGlyphWidth(size: number): number {
  return size * 0.62;
}

/** Helvetica cannot encode € — draw a C with two bars. */
function drawEuroGlyph(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
): number {
  page.drawText("C", { x, y, size, font, color });
  const w = font.widthOfTextAtSize("C", size);
  const barW = w * 0.92;
  const barX = x - size * 0.04;
  page.drawLine({
    start: { x: barX, y: y + size * 0.36 },
    end: { x: barX + barW, y: y + size * 0.36 },
    thickness: Math.max(0.7, size * 0.07),
    color,
  });
  page.drawLine({
    start: { x: barX, y: y + size * 0.54 },
    end: { x: barX + barW, y: y + size * 0.54 },
    thickness: Math.max(0.7, size * 0.07),
    color,
  });
  return Math.max(w, euroGlyphWidth(size));
}

function measurePdfText(text: string, font: PDFFont, size: number): number {
  const safe = sanitizePdfText(text, font);
  let width = 0;
  const parts = safe.split("€");
  parts.forEach((part, index) => {
    if (index > 0) width += euroGlyphWidth(size) + size * 0.08;
    if (part) width += font.widthOfTextAtSize(part, size);
  });
  return width;
}

function drawPdfText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
): number {
  const safe = sanitizePdfText(text, font);
  let cursor = x;
  const parts = safe.split("€");
  parts.forEach((part, index) => {
    if (index > 0) {
      cursor += drawEuroGlyph(page, font, cursor, y, size, color);
      cursor += size * 0.08;
    }
    if (part) {
      page.drawText(part, { x: cursor, y, size, font, color });
      cursor += font.widthOfTextAtSize(part, size);
    }
  });
  return cursor - x;
}

/**
 * Generates the legacy GAS notula (RICHIESTA DI RIMBORSO SPESE).
 * Persistence (Storage + Drive) is handled by persistReimbursementPdf.
 */
export async function generateReimbursementPdf(
  input: NotulaPdfInput,
): Promise<GeneratedNotulaPdf> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.08, 0.08, 0.08);

  const amountPlain = formatImportoPlain(input.grossAmountEur);
  const receipts = buildReceiptsLine(input);
  const versati = buildVersatiRimborsoLine({
    paymentMethod: input.paymentMethod,
    grossAmountEur: input.grossAmountEur,
    paymentDateLabel: formatPaymentDate(input.paymentDate),
  });

  const drawLeft = (
    text: string,
    y: number,
    opts?: { bold?: boolean; size?: number },
  ) => {
    const size = opts?.size ?? 11;
    const used = opts?.bold ? fontBold : font;
    drawPdfText(page, used, text, MARGIN, y, size, black);
  };

  const drawCentered = (
    text: string,
    y: number,
    opts?: { bold?: boolean; size?: number },
  ) => {
    const size = opts?.size ?? 11;
    const used = opts?.bold ? fontBold : font;
    const width = measurePdfText(text, used, size);
    const x = Math.max(MARGIN, (PAGE_W - width) / 2);
    drawPdfText(page, used, text, x, y, size, black);
  };

  let y = 760;
  drawCentered("RICHIESTA DI RIMBORSO SPESE", y, { bold: true, size: 14 });
  y -= 48;

  drawLeft("Nota delle spese sostenute per conto dell'Associazione Culturale M.P. da:", y);
  y -= 36;

  drawCentered(input.associateName, y, { size: 12 });
  y -= 18;
  if (input.address?.trim()) {
    drawCentered(input.address.trim(), y);
    y -= 18;
  }
  if (input.taxCode?.trim()) {
    drawCentered(input.taxCode.trim(), y);
    y -= 18;
  }

  y -= 36;
  for (const line of receipts.split("\n")) {
    drawLeft(line, y);
    y -= 18;
  }
  drawLeft(amountPlain, y);
  y -= 48;

  drawLeft(`TOTALE SPESE ${amountPlain}`, y, { bold: true, size: 12 });
  y -= 22;
  drawLeft(versati, y);

  const footerY = 118;
  drawLeft("per accettazione", footerY);
  if (input.signedAt) {
    drawLeft(
      `Firmato il ${formatReimbursementDateItalian(input.signedAt)}`,
      footerY - 16,
      { size: 9 },
    );
  }

  const rightLines = ["IL PRESIDENTE", PRESIDENT_NAME];
  let rightY = footerY;
  for (const line of rightLines) {
    const size = 11;
    const width = measurePdfText(line, fontBold, size);
    drawPdfText(page, fontBold, line, PAGE_W - MARGIN - width, rightY, size, black);
    rightY -= 16;
  }
  const lineW = 150;
  page.drawLine({
    start: { x: PAGE_W - MARGIN - lineW, y: rightY + 6 },
    end: { x: PAGE_W - MARGIN, y: rightY + 6 },
    thickness: 0.7,
    color: black,
  });

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

/**
 * Printable HTML notula (fallback when Storage upload fails / client-side open).
 */
export function generateReimbursementHtml(input: NotulaPdfInput): string {
  const amountPlain = formatImportoPlain(input.grossAmountEur);
  const receipts = buildReceiptsLine(input)
    .split("\n")
    .map((line) => `<div class="row">${escapeHtml(line)}</div>`)
    .join("");
  const versati = buildVersatiRimborsoLine({
    paymentMethod: input.paymentMethod,
    grossAmountEur: input.grossAmountEur,
    paymentDateLabel: formatPaymentDate(input.paymentDate),
  });
  const signed = input.signedAt
    ? `<div class="muted">Firmato il ${escapeHtml(formatReimbursementDateItalian(input.signedAt))}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8"/>
  <title>RICHIESTA DI RIMBORSO SPESE</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; max-width: 720px; margin: 48px auto; color: #141414; line-height: 1.45; }
    h1 { font-size: 1.15rem; text-align: center; letter-spacing: 0.02em; margin: 0 0 36px; }
    .intro { margin: 0 0 28px; }
    .who { text-align: center; margin: 0 0 40px; }
    .row { margin: 4px 0; }
    .totale { font-weight: 700; margin-top: 36px; }
    .footer { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 96px; }
    .presidente { text-align: right; font-weight: 700; }
    .sign-line { margin-top: 28px; border-bottom: 1px solid #141414; width: 160px; margin-left: auto; }
    .muted { color: #555; font-size: 0.85rem; margin-top: 8px; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <h1>RICHIESTA DI RIMBORSO SPESE</h1>
  <p class="intro">Nota delle spese sostenute per conto dell'Associazione Culturale M.P. da:</p>
  <div class="who">
    <div class="row">${escapeHtml(input.associateName)}</div>
    ${input.address?.trim() ? `<div class="row">${escapeHtml(input.address.trim())}</div>` : ""}
    ${input.taxCode?.trim() ? `<div class="row">${escapeHtml(input.taxCode.trim())}</div>` : ""}
  </div>
  ${receipts}
  <div class="row">${escapeHtml(amountPlain)}</div>
  <div class="row totale">TOTALE SPESE ${escapeHtml(amountPlain)}</div>
  <div class="row">${escapeHtml(versati)}</div>
  <div class="footer">
    <div>
      <div>per accettazione</div>
      ${signed}
    </div>
    <div class="presidente">
      <div>IL PRESIDENTE</div>
      <div>${escapeHtml(PRESIDENT_NAME)}</div>
      <div class="sign-line"></div>
    </div>
  </div>
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
