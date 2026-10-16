import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import { formatReimbursementDateItalian } from "@musicpro/database";

export interface ReimbursementReportPdfRow {
  associateName: string;
  fiscalYear: number;
  progressive: string;
  grossAmountEur: number;
  generatedAt: string;
  receiptsAmountEur: number;
  receiptsStatusLabel: string;
  paymentMethod: string | null;
  paymentDate: string | null;
}

export interface GeneratedReimbursementReportPdf {
  bytes: Uint8Array;
  filename: string;
  contentType: "application/pdf";
}

const PORTRAIT: [number, number] = [595.28, 841.89];
const LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 36;

function sanitizePdfText(value: string): string {
  return value
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/€/g, "EUR")
    .replace(/\u2014/g, "-");
}

function money(amount: number): string {
  return `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} EUR`;
}

function fit(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  const clean = sanitizePdfText(text);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let trimmed = clean;
  while (
    trimmed.length > 1 &&
    font.widthOfTextAtSize(`${trimmed}...`, size) > maxWidth
  ) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
}

function summarize(rows: ReimbursementReportPdfRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.associateName, (map.get(row.associateName) ?? 0) + row.grossAmountEur);
  }
  return [...map.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

export async function generateReimbursementReportPdf(input: {
  kind: "summary" | "detailed" | "elenco";
  year: number;
  rows: ReimbursementReportPdfRow[];
  filterLabel?: string;
}): Promise<GeneratedReimbursementReportPdf> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.35, 0.35, 0.35);
  const line = rgb(0.82, 0.82, 0.82);
  const headerBg = rgb(0.94, 0.94, 0.94);

  const landscape = input.kind !== "summary";
  const pageSize = landscape ? LANDSCAPE : PORTRAIT;
  const pageHeight = pageSize[1];
  const tableWidth = pageSize[0] - MARGIN * 2;
  const title =
    input.kind === "summary"
      ? `REPORT TOTALE RIMBORSI ANNO ${input.year}`
      : input.kind === "elenco"
        ? `ELENCO RIMBORSI ANNO ${input.year}`
        : `REPORT DETTAGLIATO RIMBORSI ANNO ${input.year}`;
  const filename =
    input.kind === "summary"
      ? `report-totale-rimborsi-${input.year}.pdf`
      : input.kind === "elenco"
        ? `elenco-rimborsi-${input.year}.pdf`
        : `report-dettagliato-rimborsi-${input.year}.pdf`;

  const columns =
    input.kind === "summary"
      ? [
          { title: "Associato", width: tableWidth * 0.7 },
          { title: "Totale", width: tableWidth * 0.3 },
        ]
      : [
          { title: "Associato", width: 170 },
          { title: "Prog.", width: 78 },
          { title: "Importo", width: 78 },
          { title: "Data", width: 72 },
          { title: "Ricevute", width: 78 },
          { title: "Stato", width: 72 },
          { title: "Pagamento", width: tableWidth - 170 - 78 - 78 - 72 - 78 - 72 - 78 },
          { title: "Data pag.", width: 78 },
        ];

  let page: PDFPage = doc.addPage(pageSize);
  let y = pageHeight - MARGIN;

  const newPage = () => {
    page = doc.addPage(pageSize);
    y = pageHeight - MARGIN;
  };

  const drawTitle = () => {
    page.drawText(sanitizePdfText(title), {
      x: MARGIN,
      y,
      size: 13,
      font: bold,
      color: ink,
    });
    y -= 16;
    const subtitle = input.filterLabel?.trim()
      ? `Filtro associato: ${input.filterLabel.trim()}`
      : "Tutti gli associati";
    page.drawText(fit(subtitle, font, 9, tableWidth), {
      x: MARGIN,
      y,
      size: 9,
      font,
      color: muted,
    });
    y -= 18;
  };

  const drawHeader = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - 4,
      width: tableWidth,
      height: 16,
      color: headerBg,
    });
    let x = MARGIN + 4;
    for (const column of columns) {
      page.drawText(column.title, {
        x,
        y,
        size: 8,
        font: bold,
        color: ink,
      });
      x += column.width;
    }
    y -= 16;
  };

  drawTitle();
  drawHeader();

  const summaryRows =
    input.kind === "summary" ? summarize(input.rows) : [];
  const body =
    input.kind === "summary"
      ? summaryRows.map((row) => [row.name, money(row.total)])
      : input.rows.map((row) => [
          row.associateName,
          row.progressive,
          money(row.grossAmountEur),
          formatReimbursementDateItalian(row.generatedAt),
          money(row.receiptsAmountEur),
          row.receiptsStatusLabel,
          row.paymentMethod ?? "",
          row.paymentDate
            ? formatReimbursementDateItalian(row.paymentDate)
            : "",
        ]);

  const rowHeight = 14;
  for (const cells of body) {
    if (y < MARGIN + rowHeight) {
      newPage();
      drawHeader();
    }
    page.drawLine({
      start: { x: MARGIN, y: y - 4 },
      end: { x: MARGIN + tableWidth, y: y - 4 },
      thickness: 0.4,
      color: line,
    });
    let x = MARGIN + 4;
    cells.forEach((cell, index) => {
      const column = columns[index];
      if (!column) return;
      page.drawText(fit(cell, font, 8, column.width - 8), {
        x,
        y,
        size: 8,
        font,
        color: ink,
      });
      x += column.width;
    });
    y -= rowHeight;
  }

  const grandTotal = input.rows.reduce(
    (sum, row) => sum + row.grossAmountEur,
    0,
  );
  if (y < MARGIN + 28) {
    newPage();
  }
  y -= 8;
  page.drawText(
    sanitizePdfText(`Righe: ${input.rows.length}    Totale: ${money(grandTotal)}`),
    { x: MARGIN, y, size: 10, font: bold, color: ink },
  );

  const bytes = await doc.save();
  return { bytes, filename, contentType: "application/pdf" };
}
