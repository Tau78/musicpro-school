import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

type FiscalReceiptPdfInput = {
  code: string;
  issuedOn: string;
  payeeName: string;
  payeeTaxCode: string | null;
  payeeEmail?: string | null;
  payeeAddressLine1?: string;
  payeeCityLine?: string;
  amountEur: number;
  method: string;
  lines: { description: string; amountEur: number }[];
};

export interface GeneratedFiscalReceiptPdf {
  bytes: Uint8Array;
  filename: string;
  contentType: "application/pdf";
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const RIGHT_X = PAGE_W - MARGIN;
const BLACK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.35, 0.35, 0.35);

const ASSOCIATION_NAME = "Associazione Culturale M.P.";
const ASSOCIATION_ADDRESS = "Zona Loreto, 42 - 16042 - Carasco (GE)";
const ASSOCIATION_VAT = "P.iva 02535720995 - C.F. 02535720995";
const CONTACT_LINE =
  "www.musicproeventi.it - musicproeventi@gmail.com, cell: 3282157015";
const IBAN = "IT98E0310401400000000400177";
const IBAN_HOLDER = "Associazione Culturale M.P.";

const NOTE_LEGAL_TEXT =
  "OPERAZIONE NON SOGGETTA A SPLIT PAYMENT COME CHIARITO DALL'AGENZIA DELLE ENTRATE CON LA CIRCOLARE 15/2015 IN QUANTO L'ASSOCIAZIONE HA OPTATO PER IL REGIME DI CUI ALLA LEGGE 398/1991";

function formatIssuedOn(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-");
    return `${day}/${month}/${year}`;
  }
  return value;
}

function methodLabel(method: string): string {
  if (method === "stripe" || method === "nexi") return "Carta";
  if (method === "bonifico") return "Bonifico Bancario";
  if (method === "contanti") return "Contanti";
  if (method === "altro") return "Altro";
  return method;
}

function formatAmountIt(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

/** WinAnsi-safe text for Helvetica (maps common Italian chars). */
function sanitizePdfText(
  value: string,
  font?: PDFFont,
  maxLen?: number,
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
  const trimmed = maxLen != null ? out.slice(0, maxLen) : out;
  return trimmed;
}

function euroGlyphWidth(size: number): number {
  return size * 0.62;
}

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

function drawPdfTextRight(
  page: PDFPage,
  font: PDFFont,
  text: string,
  rightX: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  const w = measurePdfText(text, font, size);
  drawPdfText(page, font, text, rightX - w, y, size, color);
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = sanitizePdfText(text, font).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measurePdfText(candidate, font, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

async function tryEmbedLogo(
  doc: PDFDocument,
): Promise<PDFImage | null> {
  const base = path.join(process.cwd(), "public");
  const candidates = ["logo.png", "logo.jpg", "logo.jpeg", "Logo.png"];
  for (const name of candidates) {
    const filePath = path.join(base, name);
    if (!existsSync(filePath)) continue;
    try {
      const bytes = await readFile(filePath);
      if (name.toLowerCase().endsWith(".png")) {
        return doc.embedPng(bytes);
      }
      return doc.embedJpg(bytes);
    } catch {
      continue;
    }
  }
  return null;
}

export async function generateFiscalReceiptPdf(
  row: FiscalReceiptPdfInput,
): Promise<GeneratedFiscalReceiptPdf> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const issuedLabel = formatIssuedOn(row.issuedOn);
  const total = row.amountEur;
  const contentWidth = RIGHT_X - MARGIN;

  let y = PAGE_H - MARGIN;

  const logo = await tryEmbedLogo(doc);
  if (logo) {
    const logoH = 48;
    const scale = logoH / logo.height;
    const logoW = logo.width * scale;
    page.drawImage(logo, {
      x: MARGIN,
      y: y - logoH,
      width: logoW,
      height: logoH,
    });
    y -= logoH + 14;
  }

  const headerLines = [
    ASSOCIATION_NAME,
    ASSOCIATION_ADDRESS,
    ASSOCIATION_VAT,
  ];
  for (const line of headerLines) {
    drawPdfText(page, fontBold, line, MARGIN, y, 11, BLACK);
    y -= 14;
  }

  y -= 6;
  drawPdfText(
    page,
    fontBold,
    `RICEVUTA nr. ${row.code} del ${issuedLabel}`,
    MARGIN,
    y,
    12,
    BLACK,
  );
  y -= 16;
  drawPdfText(
    page,
    font,
    `Ricevuta nr. ${row.code} del ${issuedLabel} - 1 / 1`,
    MARGIN,
    y,
    9,
    MUTED,
  );
  y -= 14;
  drawPdfText(page, fontBold, ASSOCIATION_NAME, MARGIN, y, 10, BLACK);
  y -= 14;
  drawPdfText(page, font, CONTACT_LINE, MARGIN, y, 9, MUTED);
  y -= 20;

  drawPdfText(page, fontBold, "DESCRIZIONE", MARGIN, y, 10, BLACK);
  drawPdfTextRight(page, fontBold, "IMPORTO", RIGHT_X, y, 10, BLACK);
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: RIGHT_X, y },
    thickness: 0.5,
    color: MUTED,
  });
  y -= 14;

  const tableLines =
    row.lines.length > 0
      ? row.lines
      : [{ description: "Pacchetto lezioni", amountEur: total }];

  for (const line of tableLines) {
    const desc = sanitizePdfText(line.description, font, 90);
    drawPdfText(page, font, desc, MARGIN, y, 10, BLACK);
    drawPdfTextRight(
      page,
      font,
      `€ ${formatAmountIt(line.amountEur)}`,
      RIGHT_X,
      y,
      10,
      BLACK,
    );
    y -= 14;
  }

  y -= 8;
  drawPdfText(page, fontBold, "NOTE", MARGIN, y, 10, BLACK);
  y -= 14;
  for (const noteLine of wrapText(NOTE_LEGAL_TEXT, font, 9, contentWidth)) {
    drawPdfText(page, font, noteLine, MARGIN, y, 9, BLACK);
    y -= 12;
  }

  y -= 6;
  drawPdfText(page, fontBold, "MODALITÀ DI PAGAMENTO", MARGIN, y, 10, BLACK);
  y -= 14;
  drawPdfText(page, font, methodLabel(row.method), MARGIN, y, 10, BLACK);
  y -= 14;
  drawPdfText(page, font, `IBAN: ${IBAN}`, MARGIN, y, 10, BLACK);
  y -= 14;
  drawPdfText(page, font, `Intestato a: ${IBAN_HOLDER}`, MARGIN, y, 10, BLACK);
  y -= 18;

  drawPdfText(page, fontBold, "RIEPILOGO IVA", MARGIN, y, 10, BLACK);
  const colImponibile = MARGIN + 200;
  const colImposte = RIGHT_X - 40;
  drawPdfText(page, fontBold, "IMPONIBILE", colImponibile, y, 9, BLACK);
  drawPdfText(page, fontBold, "IMPOSTE", colImposte, y, 9, BLACK);
  y -= 14;

  const ivaLabel = "0% - Art. 10 Dpr. 633/72";
  drawPdfText(page, font, ivaLabel, MARGIN, y, 9, BLACK);
  drawPdfText(
    page,
    font,
    formatAmountIt(total),
    colImponibile,
    y,
    9,
    BLACK,
  );
  drawPdfText(page, font, "0,00", colImposte, y, 9, BLACK);
  y -= 14;

  drawPdfText(page, font, "Imponibile", MARGIN, y, 9, BLACK);
  drawPdfTextRight(
    page,
    font,
    `€ ${formatAmountIt(total)}`,
    RIGHT_X,
    y,
    9,
    BLACK,
  );
  y -= 14;
  drawPdfTextRight(
    page,
    fontBold,
    `€ ${formatAmountIt(total)}`,
    RIGHT_X,
    y,
    11,
    BLACK,
  );
  y -= 22;

  const cf = row.payeeTaxCode?.trim();
  if (cf) {
    drawPdfText(page, fontBold, `CF ${cf}`, MARGIN, y, 10, BLACK);
    y -= 14;
  }
  const email = row.payeeEmail?.trim();
  if (email) {
    drawPdfText(page, fontBold, `EMAIL ${email}`, MARGIN, y, 10, BLACK);
    y -= 14;
  }

  y -= 4;
  drawPdfText(page, fontBold, "DESTINATARIO", MARGIN, y, 10, BLACK);
  y -= 14;
  drawPdfText(page, font, row.payeeName, MARGIN, y, 10, BLACK);
  y -= 14;
  if (row.payeeAddressLine1?.trim()) {
    drawPdfText(page, font, row.payeeAddressLine1.trim(), MARGIN, y, 10, BLACK);
    y -= 14;
  }
  if (row.payeeCityLine?.trim()) {
    drawPdfText(page, font, row.payeeCityLine.trim(), MARGIN, y, 10, BLACK);
    y -= 14;
  }

  const bytes = await doc.save();
  return {
    bytes,
    filename: `ricevuta-${row.code.replaceAll("/", "-")}.pdf`,
    contentType: "application/pdf",
  };
}
