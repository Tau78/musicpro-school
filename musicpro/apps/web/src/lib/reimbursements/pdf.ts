import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import {
  buildReceiptsNote,
  buildVersatiRimborsoLine,
  formatImportoPlain,
  formatReimbursementDateItalian,
  reimbursementPdfFilename,
} from "@musicpro/database";

import { PRESIDENT_SIGNATURE_PNG_BASE64 } from "./assets/firma-presidente-base64";

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
/** Legacy Google Doc margin ≈ 2.5 cm */
const MARGIN = 70;
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

/** WinAnsi-safe text for standard fonts. Keeps € so the glyph helper can draw it. */
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

/** Standard fonts cannot encode € — draw a C with two bars. */
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

function loadPresidentSignaturePng(): Uint8Array | null {
  const b64 = PRESIDENT_SIGNATURE_PNG_BASE64?.trim();
  if (!b64) return null;
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function presidentSignatureDataUrl(): string | null {
  const b64 = PRESIDENT_SIGNATURE_PNG_BASE64?.trim();
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}

/**
 * Generates the legacy GAS notula (RICHIESTA DI RIMBORSO SPESE).
 * Layout mirrors the Google Doc template: Times, left-aligned body,
 * acceptance + president block, embedded president signature.
 */
export async function generateReimbursementPdf(
  input: NotulaPdfInput,
): Promise<GeneratedNotulaPdf> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const fontItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
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
    opts?: { bold?: boolean; italic?: boolean; size?: number },
  ) => {
    const size = opts?.size ?? 12;
    const used = opts?.bold ? fontBold : opts?.italic ? fontItalic : font;
    drawPdfText(page, used, text, MARGIN, y, size, black);
  };

  let y = 780;
  drawLeft("RICHIESTA DI RIMBORSO SPESE", y, { bold: true, size: 14 });
  y -= 40;

  drawLeft(
    "Nota delle spese sostenute per conto dell'Associazione Culturale M.P. da:",
    y,
    { size: 12 },
  );
  y -= 28;

  drawLeft(input.associateName, y, { size: 12 });
  y -= 16;
  if (input.address?.trim()) {
    drawLeft(input.address.trim(), y, { size: 12 });
    y -= 16;
  }
  if (input.taxCode?.trim()) {
    drawLeft(input.taxCode.trim(), y, { size: 12 });
    y -= 16;
  }

  y -= 48;
  for (const line of receipts.split("\n")) {
    drawLeft(line, y, { size: 12 });
    y -= 16;
  }
  drawLeft(amountPlain, y, { size: 12 });
  y -= 36;

  drawLeft(`TOTALE SPESE ${amountPlain}`, y, { size: 12 });
  y -= 18;
  drawLeft(versati, y, { size: 12 });

  const footerY = 160;
  const acceptX = PAGE_W * 0.42;
  drawPdfText(page, font, "per accettazione", acceptX, footerY, 12, black);

  const rightX = PAGE_W - MARGIN;
  const presidenteSize = 12;
  const presidenteW = measurePdfText("IL PRESIDENTE", fontBold, presidenteSize);
  drawPdfText(
    page,
    fontBold,
    "IL PRESIDENTE",
    rightX - presidenteW,
    footerY,
    presidenteSize,
    black,
  );

  const nameW = measurePdfText(PRESIDENT_NAME, fontItalic, 12);
  drawPdfText(
    page,
    fontItalic,
    PRESIDENT_NAME,
    rightX - nameW,
    footerY - 18,
    12,
    black,
  );

  const sigBytes = loadPresidentSignaturePng();
  if (sigBytes) {
    try {
      const png = await doc.embedPng(sigBytes);
      const maxW = 200;
      const maxH = 70;
      const scale = Math.min(maxW / png.width, maxH / png.height);
      const w = png.width * scale;
      const h = png.height * scale;
      page.drawImage(png, {
        x: rightX - w,
        y: footerY - 18 - h - 8,
        width: w,
        height: h,
      });
    } catch {
      page.drawLine({
        start: { x: rightX - 150, y: footerY - 40 },
        end: { x: rightX, y: footerY - 40 },
        thickness: 0.7,
        color: black,
      });
    }
  } else {
    page.drawLine({
      start: { x: rightX - 150, y: footerY - 40 },
      end: { x: rightX, y: footerY - 40 },
      thickness: 0.7,
      color: black,
    });
  }

  if (input.signedAt) {
    drawLeft(
      `Firmato il ${formatReimbursementDateItalian(input.signedAt)}`,
      footerY - 16,
      { size: 9 },
    );
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
  const sigUrl = presidentSignatureDataUrl();
  const sigImg = sigUrl
    ? `<img class="firma" src="${sigUrl}" alt="Firma del presidente" />`
    : `<div class="sign-line"></div>`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8"/>
  <title>RICHIESTA DI RIMBORSO SPESE</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; max-width: 720px; margin: 48px auto; color: #141414; line-height: 1.35; font-size: 12pt; }
    h1 { font-size: 14pt; text-align: left; margin: 0 0 28px; font-weight: 700; }
    .intro { margin: 0 0 20px; }
    .who { text-align: left; margin: 0 0 40px; }
    .row { margin: 2px 0; }
    .totale { margin-top: 28px; }
    .footer { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 96px; }
    .accept { margin-left: 28%; }
    .presidente { text-align: right; }
    .presidente .title { font-weight: 700; }
    .presidente .name { font-style: italic; }
    .firma { display: block; margin-top: 8px; margin-left: auto; width: 200px; height: auto; }
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
      <div class="accept">per accettazione</div>
      ${signed}
    </div>
    <div class="presidente">
      <div class="title">IL PRESIDENTE</div>
      <div class="name">${escapeHtml(PRESIDENT_NAME)}</div>
      ${sigImg}
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
