import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

/** Campi compilati dall'app a ogni emissione. */
export type FiscalReceiptPdfInput = {
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
  paymentMethodDisplay?: string;
  paymentDetailLines?: string[];
  footerContactLines?: string[];
};

export interface GeneratedFiscalReceiptPdf {
  bytes: Uint8Array;
  filename: string;
  contentType: "application/pdf";
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 36;
const MR = 36;
const RIGHT = PAGE_W - MR;
const W = RIGHT - ML;

const INK = rgb(0.11, 0.11, 0.11);
const LABEL = rgb(0.42, 0.42, 0.42);
const HEADER_BG = rgb(0.91, 0.91, 0.91);
const ROW_BG = rgb(0.96, 0.96, 0.96);
const RULE = rgb(0.78, 0.78, 0.78);

const ISSUER_NAME = "Associazione Culturale M.P.";
const ISSUER_ADDR = "Zona Loreto, 42 - 16042 - Carasco (GE)";
const ISSUER_VAT = "P.iva 02535720995 - C.F. 02535720995";
const DEFAULT_FOOTER = [
  "www.musicproeventi.it - musicproeventi@gmail.com",
  "cell: 3282157015",
];
const DEFAULT_PAYMENT_EXTRA = [
  "IBAN: IT98E0310401400000000400177",
  `Intestato a: ${ISSUER_NAME}`,
];

const LOGO_URL = "/images/receipt-assoc-logo.png";
const RECIPIENT_COL = ML + W * 0.52;

function formatIssuedOn(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
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

function formatAmountIt(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function sanitize(text: string, font?: PDFFont): string {
  const mapped = text
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00A0/g, " ");
  if (!font) return mapped;
  let out = "";
  for (const ch of mapped) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function euroW(size: number): number {
  return size * 0.62;
}

function drawEuro(
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
    thickness: Math.max(0.65, size * 0.07),
    color,
  });
  page.drawLine({
    start: { x: barX, y: y + size * 0.54 },
    end: { x: barX + barW, y: y + size * 0.54 },
    thickness: Math.max(0.65, size * 0.07),
    color,
  });
  return Math.max(w, euroW(size));
}

function measure(text: string, font: PDFFont, size: number): number {
  const safe = sanitize(text, font);
  let w = 0;
  for (const part of safe.split("€")) {
    if (w > 0) w += euroW(size) + size * 0.08;
    if (part) w += font.widthOfTextAtSize(part, size);
  }
  return w;
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  const parts = sanitize(text, font).split("€");
  let cx = x;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      cx += drawEuro(page, font, cx, y, size, color) + size * 0.08;
    }
    const part = parts[i];
    if (part) {
      page.drawText(part, { x: cx, y, size, font, color });
      cx += font.widthOfTextAtSize(part, size);
    }
  }
}

function drawRight(
  page: PDFPage,
  font: PDFFont,
  text: string,
  rightX: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  drawText(page, font, text, rightX - measure(text, font, size), y, size, color);
}

function hLine(page: PDFPage, y: number): void {
  page.drawLine({
    start: { x: ML, y },
    end: { x: RIGHT, y },
    thickness: 0.6,
    color: RULE,
  });
}

async function loadLogoPng(): Promise<Uint8Array | null> {
  const paths = [
    "public/images/receipt-assoc-logo.png",
    "musicpro/apps/web/public/images/receipt-assoc-logo.png",
  ];
  if (typeof window === "undefined") {
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      for (const rel of paths) {
        try {
          return await readFile(join(process.cwd(), rel));
        } catch {
          /* next */
        }
      }
    } catch {
      /* fetch fallback */
    }
  }
  const bases: string[] = [];
  if (typeof window !== "undefined") bases.push(window.location.origin);
  else {
    const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (app) bases.push(app.replace(/\/$/, ""));
    bases.push("https://school.musicproeventi.it");
  }
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${LOGO_URL}`);
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      /* next */
    }
  }
  return null;
}

function drawInlineField(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  x: number,
  y: number,
  label: string,
  value: string,
): number {
  drawText(page, fontBold, label, x, y, 8, LABEL);
  const lw = fontBold.widthOfTextAtSize(label, 8);
  drawText(page, font, value, x + lw + 6, y, 9, INK);
  return y - 14;
}

export async function generateFiscalReceiptPdf(
  row: FiscalReceiptPdfInput,
): Promise<GeneratedFiscalReceiptPdf> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const issued = formatIssuedOn(row.issuedOn);
  const total = row.amountEur;
  const lines =
    row.lines.length > 0
      ? row.lines
      : [{ description: "Pacchetto lezioni", amountEur: total }];
  const method =
    row.paymentMethodDisplay?.trim() || methodLabel(row.method);
  const paymentLines = [
    method,
    ...(row.paymentDetailLines?.length
      ? row.paymentDetailLines
      : DEFAULT_PAYMENT_EXTRA),
  ];
  const footerLines = row.footerContactLines?.length
    ? row.footerContactLines
    : DEFAULT_FOOTER;

  const logoBytes = await loadLogoPng();
  let logo: PDFImage | null = null;
  if (logoBytes) {
    try {
      logo = await doc.embedPng(logoBytes);
    } catch {
      logo = null;
    }
  }

  const top = PAGE_H - 32;
  if (logo) {
    const h = 58;
    const scale = h / logo.height;
    page.drawImage(logo, {
      x: ML,
      y: top - h,
      width: logo.width * scale,
      height: h,
    });
  }

  let ry = top - 4;
  drawRight(page, font, ISSUER_NAME, RIGHT, ry, 9.5, INK);
  ry -= 11;
  drawRight(page, font, ISSUER_ADDR, RIGHT, ry, 9, LABEL);
  ry -= 10;
  drawRight(page, font, ISSUER_VAT, RIGHT, ry, 9, LABEL);
  ry -= 20;
  drawRight(
    page,
    fontBold,
    `RICEVUTA nr. ${row.code} del ${issued}`,
    RIGHT,
    ry,
    11,
    INK,
  );

  let y = Math.min(top - 68, ry) - 14;
  hLine(page, y);
  y -= 22;

  let leftY = y;
  let rightY = y;
  if (row.payeeTaxCode?.trim()) {
    leftY = drawInlineField(
      page,
      font,
      fontBold,
      ML,
      leftY,
      "CF",
      row.payeeTaxCode.trim(),
    );
  }
  if (row.payeeEmail?.trim()) {
    leftY = drawInlineField(
      page,
      font,
      fontBold,
      ML,
      leftY,
      "EMAIL",
      row.payeeEmail.trim(),
    );
  }

  drawText(page, fontBold, "DESTINATARIO", RECIPIENT_COL, rightY, 7.5, LABEL);
  rightY -= 13;
  drawText(page, fontBold, row.payeeName, RECIPIENT_COL, rightY, 10, INK);
  rightY -= 12;
  if (row.payeeAddressLine1?.trim()) {
    drawText(
      page,
      font,
      row.payeeAddressLine1.trim(),
      RECIPIENT_COL,
      rightY,
      9,
      INK,
    );
    rightY -= 11;
  }
  if (row.payeeCityLine?.trim()) {
    drawText(page, font, row.payeeCityLine.trim(), RECIPIENT_COL, rightY, 9, INK);
    rightY -= 11;
  }

  y = Math.min(leftY, rightY) - 18;

  const headH = 20;
  page.drawRectangle({
    x: ML,
    y: y - headH,
    width: W,
    height: headH,
    color: HEADER_BG,
  });
  drawText(page, fontBold, "DESCRIZIONE", ML + 8, y - 14, 8.5, INK);
  drawRight(page, fontBold, "IMPORTO", RIGHT - 8, y - 14, 8.5, INK);
  y -= headH;

  for (const line of lines) {
    const rowH = 22;
    page.drawRectangle({
      x: ML,
      y: y - rowH,
      width: W,
      height: rowH,
      color: ROW_BG,
      borderColor: RULE,
      borderWidth: 0.25,
    });
    drawText(page, font, line.description, ML + 8, y - 15, 9.5, INK);
    drawRight(
      page,
      font,
      `€ ${formatAmountIt(line.amountEur)}`,
      RIGHT - 8,
      y - 15,
      9.5,
      INK,
    );
    y -= rowH;
  }

  y -= 28;

  drawText(page, fontBold, "MODALITÀ DI PAGAMENTO", ML, y, 8.5, INK);
  y -= 13;
  for (const line of paymentLines) {
    drawText(page, font, line, ML, y, 9, INK);
    y -= 11;
  }

  y -= 16;

  const vatTop = y;
  const vatHeadH = 18;
  const vatW = W * 0.62;
  page.drawRectangle({
    x: ML,
    y: vatTop - vatHeadH,
    width: vatW,
    height: vatHeadH,
    color: HEADER_BG,
    borderColor: RULE,
    borderWidth: 0.25,
  });
  const colImpRight = ML + vatW * 0.72;
  const colTaxRight = ML + vatW - 8;
  drawText(page, fontBold, "RIEPILOGO IVA", ML + 6, vatTop - 12, 8, INK);
  drawRight(page, fontBold, "IMPONIBILE", colImpRight, vatTop - 12, 8, INK);
  drawRight(page, fontBold, "IMPOSTE", colTaxRight, vatTop - 12, 8, INK);

  const vatRowH = 17;
  const vatRowTop = vatTop - vatHeadH;
  const vatDataY = vatRowTop - 12;
  page.drawRectangle({
    x: ML,
    y: vatRowTop - vatRowH,
    width: vatW,
    height: vatRowH,
    color: ROW_BG,
    borderColor: RULE,
    borderWidth: 0.25,
  });
  drawText(page, font, "0% - Art. 10 Dpr. 633/72", ML + 6, vatDataY, 8, INK);
  drawRight(page, font, formatAmountIt(total), colImpRight, vatDataY, 8, INK);
  drawRight(page, font, "€ 0,00", colTaxRight, vatDataY, 8, INK);

  // Totali documento a destra del box IVA (come FattureInCloud), non sotto la colonna IMPONIBILE
  const totalsLeft = ML + vatW + 14;
  if (totalsLeft < RIGHT - 40) {
    drawRight(
      page,
      font,
      `Imponibile € ${formatAmountIt(total)}`,
      RIGHT,
      vatRowTop - 4,
      8.5,
      LABEL,
    );
    drawRight(
      page,
      fontBold,
      `€ ${formatAmountIt(total)}`,
      RIGHT,
      vatRowTop - vatRowH + 2,
      16,
      INK,
    );
  } else {
    drawRight(
      page,
      font,
      `Imponibile € ${formatAmountIt(total)}`,
      RIGHT,
      vatRowTop - vatRowH - 14,
      8.5,
      LABEL,
    );
    drawRight(
      page,
      fontBold,
      `€ ${formatAmountIt(total)}`,
      RIGHT,
      vatRowTop - vatRowH - 32,
      16,
      INK,
    );
  }

  y = vatRowTop - vatRowH - 10;

  const footY = 78;
  hLine(page, footY + 18);
  drawText(
    page,
    font,
    `Ricevuta nr. ${row.code} del ${issued} - 1 / 1`,
    ML,
    footY,
    8,
    LABEL,
  );

  let fy = footY + 14;
  drawRight(page, font, ISSUER_NAME, RIGHT, fy, 9, INK);
  fy -= 10;
  for (const line of footerLines) {
    drawRight(page, font, line, RIGHT, fy, 8, LABEL);
    fy -= 9;
  }

  if (logo) {
    const h = 26;
    const scale = h / logo.height;
    const w = logo.width * scale;
    page.drawImage(logo, {
      x: RIGHT - w,
      y: 28,
      width: w,
      height: h,
    });
  }

  const bytes = await doc.save();
  return {
    bytes,
    filename: `ricevuta-${row.code.replaceAll("/", "-")}.pdf`,
    contentType: "application/pdf",
  };
}
