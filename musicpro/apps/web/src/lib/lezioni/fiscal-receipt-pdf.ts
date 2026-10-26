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

const NAVY = rgb(30 / 255, 58 / 255, 95 / 255);
const NAVY_DARK = rgb(12 / 255, 24 / 255, 40 / 255);
const GOLD = rgb(201 / 255, 162 / 255, 39 / 255);
const CREAM = rgb(246 / 255, 243 / 255, 236 / 255);
const BOX_FILL = rgb(255 / 255, 253 / 255, 248 / 255);
const TABLE_HEAD = rgb(232 / 255, 222 / 255, 198 / 255);
const ROW_BG = rgb(250 / 255, 248 / 255, 243 / 255);
const INK = rgb(26 / 255, 26 / 255, 26 / 255);
const MUTED = rgb(107 / 255, 114 / 255, 128 / 255);
const MUTED_LIGHT = rgb(122 / 255, 135 / 255, 150 / 255);
const SIG_INNER_BORDER = rgb(180 / 255, 175 / 255, 165 / 255);

const ISSUER_NAME = "Associazione Culturale M.P.";
const ISSUER_ADDR = "Zona Loreto, 42 - 16042 Carasco (GE)";
const ISSUER_VAT = "P.IVA 02535720995 - C.F. 02535720995";
const ISSUER_TEL = "Tel. 371 675 2550";
const ISSUER_WEB = "www.musicproeventi.it";

const DEFAULT_FOOTER = [
  `${ISSUER_NAME} - Zona Loreto 42, Carasco (GE) - ${ISSUER_WEB}`,
  ISSUER_TEL,
];

const DEFAULT_IBAN_LINES = [
  "IBAN: IT98E0310401400000000400177",
  `Intestato a: ${ISSUER_NAME}`,
];

const LOGO_URL = "/images/receipt-header-logo.png";
const LOGO_FALLBACK_URL = "/images/receipt-assoc-logo.png";

const FOOTER_H = 72;
const COL_GAP = 9;
const SECTION_GAP = 10;
const BOX_STROKE = 1.25;
const PAD = 12;
const TOP_BOX_H_MIN = 118;
const BOTTOM_BOX_H = 72;
const TABLE_HEAD_H = 22;
const GOLD_BAR_H = 2.5;

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

function isBonifico(method: string): boolean {
  const m = method.toLowerCase();
  return m === "bonifico" || m.includes("bonifico");
}

function paymentDetailExtras(
  row: FiscalReceiptPdfInput,
  methodDisplay: string,
): string[] {
  if (row.paymentDetailLines?.length) {
    return row.paymentDetailLines;
  }
  if (isBonifico(row.method) || isBonifico(methodDisplay)) {
    return DEFAULT_IBAN_LINES;
  }
  return [];
}

function sanitize(text: string, font?: PDFFont): string {
  const mapped = text
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00B7/g, "-")
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

function drawCentered(
  page: PDFPage,
  font: PDFFont,
  text: string,
  centerX: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  drawText(page, font, text, centerX - measure(text, font, size) / 2, y, size, color);
}

function drawTrackedRight(
  page: PDFPage,
  font: PDFFont,
  text: string,
  rightX: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
  tracking = 1.2,
): void {
  const upper = sanitize(text, font).toUpperCase();
  const total =
    upper
      .split("")
      .reduce((s, ch) => s + font.widthOfTextAtSize(ch, size), 0) +
    tracking * Math.max(0, upper.length - 1);
  let x = rightX - total;
  for (const ch of upper) {
    page.drawText(ch, { x, y, size, font, color });
    x += font.widthOfTextAtSize(ch, size) + tracking;
  }
}

function drawTrackedLeft(
  page: PDFPage,
  font: PDFFont,
  text: string,
  leftX: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
  tracking = 0.8,
): void {
  const upper = sanitize(text, font).toUpperCase();
  let x = leftX;
  for (const ch of upper) {
    page.drawText(ch, { x, y, size, font, color });
    x += font.widthOfTextAtSize(ch, size) + tracking;
  }
}

function drawBox(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  fill = BOX_FILL,
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: fill,
    borderColor: NAVY,
    borderWidth: BOX_STROKE,
  });
}

async function readLogoFromDisk(relPaths: string[]): Promise<Uint8Array | null> {
  if (typeof window !== "undefined") return null;
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    for (const rel of relPaths) {
      try {
        return await readFile(join(process.cwd(), rel));
      } catch {
        /* next */
      }
    }
  } catch {
    /* no fs */
  }
  return null;
}

async function fetchLogo(urlPath: string): Promise<Uint8Array | null> {
  const bases: string[] = [];
  if (typeof window !== "undefined") bases.push(window.location.origin);
  else {
    const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (app) bases.push(app.replace(/\/$/, ""));
    bases.push("https://school.musicproeventi.it");
  }
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${urlPath}`);
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      /* next */
    }
  }
  return null;
}

async function loadLogoPng(): Promise<Uint8Array | null> {
  const punchedPaths = [
    "public/images/receipt-header-logo.png",
    "musicpro/apps/web/public/images/receipt-header-logo.png",
  ];
  const fallbackPaths = [
    "public/images/receipt-assoc-logo.png",
    "musicpro/apps/web/public/images/receipt-assoc-logo.png",
  ];

  const punched = await readLogoFromDisk(punchedPaths);
  if (punched) return punched;

  const fallbackDisk = await readLogoFromDisk(fallbackPaths);
  if (fallbackDisk) return fallbackDisk;

  const fetched = await fetchLogo(LOGO_URL);
  if (fetched) return fetched;

  return fetchLogo(LOGO_FALLBACK_URL);
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
  const paymentExtras = paymentDetailExtras(row, method);
  const footerLines = row.footerContactLines?.length
    ? row.footerContactLines
    : DEFAULT_FOOTER;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: PAGE_H,
    color: CREAM,
  });

  const logoBytes = await loadLogoPng();
  let logo: PDFImage | null = null;
  if (logoBytes) {
    try {
      logo = await doc.embedPng(logoBytes);
    } catch {
      logo = null;
    }
  }

  const logoDisplayH = 46;
  let logoDisplayW = logo ? (logo.width / logo.height) * logoDisplayH : 0;
  const assocLineH = 9;
  const headerPadTop = 12;
  const headerPadBottom = 10;
  const headerH =
    headerPadTop + logoDisplayH + assocLineH + 4 + headerPadBottom;

  page.drawRectangle({
    x: 0,
    y: PAGE_H - headerH,
    width: PAGE_W,
    height: headerH,
    color: NAVY,
  });

  if (logo) {
    page.drawImage(logo, {
      x: ML,
      y: PAGE_H - headerPadTop - logoDisplayH,
      width: logoDisplayW,
      height: logoDisplayH,
    });
    const assoc = "ASSOCIAZIONE";
    const assocSize = 7;
    const assocTrack = 0.8;
    const assocW =
      assoc
        .split("")
        .reduce((s, ch) => s + fontBold.widthOfTextAtSize(ch, assocSize), 0) +
      assocTrack * (assoc.length - 1);
    drawTrackedLeft(
      page,
      fontBold,
      assoc,
      ML + Math.max(0, (logoDisplayW - assocW) / 2),
      PAGE_H - headerPadTop - logoDisplayH - assocLineH - 2,
      assocSize,
      rgb(1, 1, 1),
      assocTrack,
    );
  }

  const schoolY = PAGE_H - headerPadTop - logoDisplayH / 2 - 4;
  drawTrackedRight(page, fontBold, "SCHOOL", RIGHT, schoolY, 14, GOLD, 1.5);

  const goldY = PAGE_H - headerH - GOLD_BAR_H;
  page.drawRectangle({
    x: 0,
    y: goldY,
    width: PAGE_W,
    height: GOLD_BAR_H,
    color: GOLD,
  });

  const contentTop = goldY - 12;
  const bottomBoxesTop = FOOTER_H + BOTTOM_BOX_H;
  const bottomBoxesBottom = FOOTER_H + 4;

  let topBoxH = TOP_BOX_H_MIN;
  if (row.payeeTaxCode?.trim()) topBoxH += 11;
  if (row.payeeEmail?.trim()) topBoxH += 11;
  if (row.payeeAddressLine1?.trim()) topBoxH += 10;
  if (row.payeeCityLine?.trim()) topBoxH += 10;
  topBoxH += paymentExtras.length * 10;
  topBoxH = Math.min(topBoxH, 168);

  const topBoxesBottom = contentTop - topBoxH;
  const tableTop = topBoxesBottom - SECTION_GAP;
  const tableBottom = bottomBoxesTop + SECTION_GAP;

  const leftW = (W - COL_GAP) * 0.44;
  const rightW = W - COL_GAP - leftW;

  drawBox(page, ML, topBoxesBottom, leftW, topBoxH);
  drawBox(page, ML + leftW + COL_GAP, topBoxesBottom, rightW, topBoxH);

  let ly = contentTop - PAD - 10;
  drawText(page, fontBold, ISSUER_NAME, ML + PAD, ly, 11, NAVY);
  ly -= 13;
  drawText(page, fontBold, ISSUER_ADDR, ML + PAD, ly, 9, INK);
  ly -= 11;
  drawText(page, font, ISSUER_VAT, ML + PAD, ly, 8.5, MUTED);
  ly -= 11;
  drawText(page, fontBold, ISSUER_TEL, ML + PAD, ly, 9, INK);
  ly -= 11;
  drawText(page, fontBold, ISSUER_WEB, ML + PAD, ly, 9, NAVY);

  const rightX = ML + leftW + COL_GAP;
  const rightInnerRight = rightX + rightW - PAD;
  let ry = contentTop - PAD - 8;

  const stampText = "Copia per il socio";
  const stampSize = 7;
  const stampPadX = 8;
  const stampW =
    fontBold.widthOfTextAtSize(sanitize(stampText, fontBold), stampSize) +
    stampPadX * 2;
  const stampH = 16;
  const stampX = rightInnerRight - stampW;
  const stampY = contentTop - PAD - stampH + 2;
  page.drawRectangle({
    x: stampX,
    y: stampY,
    width: stampW,
    height: stampH,
    color: ROW_BG,
    borderColor: GOLD,
    borderWidth: 1,
  });
  drawText(
    page,
    fontBold,
    stampText,
    stampX + stampPadX,
    stampY + 4,
    stampSize,
    MUTED,
  );

  drawText(
    page,
    fontBold,
    `Ricevuta n. ${row.code}`,
    rightX + PAD,
    ry,
    12,
    NAVY,
  );
  ry -= 16;
  drawText(page, fontBold, "Data emissione", rightX + PAD, ry, 7.5, MUTED);
  const dateLabelW = fontBold.widthOfTextAtSize("Data emissione", 7.5);
  drawText(page, fontBold, issued, rightX + PAD + dateLabelW + 5, ry, 9, INK);
  ry -= 14;
  drawText(page, fontBold, "Spett.le", rightX + PAD, ry, 7.5, MUTED);
  ry -= 12;
  drawText(page, fontBold, row.payeeName, rightX + PAD, ry, 11, INK);
  ry -= 13;
  if (row.payeeTaxCode?.trim()) {
    drawText(
      page,
      font,
      `C.F. ${row.payeeTaxCode.trim()}`,
      rightX + PAD,
      ry,
      8.5,
      INK,
    );
    ry -= 11;
  }
  if (row.payeeEmail?.trim()) {
    drawText(page, font, row.payeeEmail.trim(), rightX + PAD, ry, 8.5, MUTED);
    ry -= 11;
  }
  if (row.payeeAddressLine1?.trim()) {
    drawText(
      page,
      font,
      row.payeeAddressLine1.trim(),
      rightX + PAD,
      ry,
      8.5,
      INK,
    );
    ry -= 10;
  }
  if (row.payeeCityLine?.trim()) {
    drawText(page, font, row.payeeCityLine.trim(), rightX + PAD, ry, 8.5, INK);
    ry -= 10;
  }
  drawText(page, fontBold, `Pagamento: ${method}`, rightX + PAD, ry, 9, INK);
  ry -= 11;
  for (const extra of paymentExtras) {
    drawText(page, font, extra, rightX + PAD, ry, 8, INK);
    ry -= 10;
  }

  const tableH = tableTop - tableBottom;
  drawBox(page, ML, tableBottom, W, tableH);

  page.drawRectangle({
    x: ML + BOX_STROKE,
    y: tableTop - TABLE_HEAD_H,
    width: W - BOX_STROKE * 2,
    height: TABLE_HEAD_H - BOX_STROKE,
    color: TABLE_HEAD,
  });
  const thY = tableTop - TABLE_HEAD_H + 7;
  drawText(
    page,
    fontBold,
    "PRODOTTI E SERVIZI FORNITI",
    ML + PAD,
    thY,
    7.5,
    NAVY,
  );
  drawRight(page, fontBold, "IMPORTO", RIGHT - PAD, thY, 7.5, NAVY);

  const rowLineH = 20;
  const dataRowsTop = tableTop - TABLE_HEAD_H - 4;
  let rowY = dataRowsTop - 12;
  for (const line of lines) {
    drawText(page, fontBold, line.description, ML + PAD, rowY, 9.5, INK);
    drawRight(
      page,
      fontBold,
      formatAmountIt(line.amountEur),
      RIGHT - PAD,
      rowY,
      9.5,
      INK,
    );
    rowY -= rowLineH;
  }

  drawText(
    page,
    fontBold,
    "IVA 0% - Art. 10 DPR 633/72 - esente",
    ML + PAD,
    tableBottom + PAD,
    7,
    MUTED,
  );

  const sigW = (W - COL_GAP) / 2;
  drawBox(page, ML, bottomBoxesBottom, sigW, BOTTOM_BOX_H);
  drawBox(page, ML + sigW + COL_GAP, bottomBoxesBottom, sigW, BOTTOM_BOX_H);

  drawText(
    page,
    fontBold,
    "FIRMA PER QUIETANZA",
    ML + PAD,
    bottomBoxesTop - PAD - 6,
    7.5,
    NAVY,
  );
  const sigInnerPad = 8;
  const sigInnerBottom = bottomBoxesBottom + sigInnerPad;
  const sigInnerTop = bottomBoxesTop - PAD - 18;
  page.drawRectangle({
    x: ML + PAD,
    y: sigInnerBottom,
    width: sigW - PAD * 2,
    height: sigInnerTop - sigInnerBottom,
    color: CREAM,
    borderColor: SIG_INNER_BORDER,
    borderWidth: 0.75,
  });

  drawText(
    page,
    fontBold,
    "TOTALE RICEVUTA",
    ML + sigW + COL_GAP + PAD,
    bottomBoxesTop - PAD - 4,
    8,
    MUTED,
  );
  const totCenterX = ML + sigW + COL_GAP + sigW / 2;
  const totY = bottomBoxesBottom + BOTTOM_BOX_H / 2 - 10;
  drawCentered(
    page,
    fontBold,
    `€ ${formatAmountIt(total)}`,
    totCenterX,
    totY,
    28,
    NAVY,
  );

  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: FOOTER_H,
    color: NAVY_DARK,
  });

  let fy = FOOTER_H - 22;
  if (footerLines.length > 0) {
    drawCentered(page, fontBold, footerLines[0], PAGE_W / 2, fy, 8.5, rgb(1, 1, 1));
    fy -= 12;
  }
  if (footerLines.length > 1) {
    drawCentered(page, font, footerLines[1], PAGE_W / 2, fy, 8, MUTED_LIGHT);
    fy -= 12;
  }
  for (let i = 2; i < footerLines.length; i++) {
    drawCentered(page, font, footerLines[i], PAGE_W / 2, fy, 7.5, MUTED_LIGHT);
    fy -= 10;
  }

  const footMeta = `Ricevuta nr. ${row.code} del ${issued} - 1 / 1`;
  drawCentered(page, font, footMeta, PAGE_W / 2, 10, 6.5, MUTED_LIGHT);

  const bytes = await doc.save();
  return {
    bytes,
    filename: `ricevuta-${row.code.replaceAll("/", "-")}.pdf`,
    contentType: "application/pdf",
  };
}
