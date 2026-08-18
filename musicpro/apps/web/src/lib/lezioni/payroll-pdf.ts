import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

import { formatEuro, type LessonPayroll } from "@musicpro/database";

export interface GeneratedPayrollPdf {
  bytes: Uint8Array;
  filename: string;
  contentType: "application/pdf";
}

const MONTH_NAMES_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const LINE_GAP = 16;
const PAGE_BOTTOM = 60;

/** WinAnsi-safe text for Helvetica (maps common Italian chars). */
function sanitizePdfText(value: string): string {
  return value
    .replace(/\u2019/g, "'")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00A0/g, " ")
    .slice(0, 110);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function monthLabel(year: number, month: number): string {
  const name = MONTH_NAMES_IT[month - 1] ?? String(month);
  return `${name} ${year}`;
}

function formatIsoDate(value: string | null): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-");
    return `${day}/${month}/${year}`;
  }
  return value;
}

function lastNameSlug(teacherLabel: string): string {
  const last = teacherLabel.trim().split(/\s+/)[0] ?? "docente";
  const slug = last
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "docente";
}

function kindLabel(kind: LessonPayroll["lines"][number]["kind"]): string {
  if (kind === "insegnamento") return "Insegnamento";
  if (kind === "coordinamento") return "Coordinamento";
  if (kind === "extra") return "Extra";
  if (kind === "anticipo") return "Anticipo";
  if (kind === "riporto") return "Riporto";
  return kind;
}

export async function generateLessonPayrollPdf(
  payroll: LessonPayroll,
): Promise<GeneratedPayrollPdf> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.35, 0.35, 0.35);

  let page: PDFPage = doc.addPage(A4);
  let y = 780;

  const ensureSpace = (needed = LINE_GAP) => {
    if (y - needed >= PAGE_BOTTOM) return;
    page = doc.addPage(A4);
    y = 780;
  };

  const draw = (
    text: string,
    opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> },
  ) => {
    const size = opts?.size ?? 11;
    const used: PDFFont = opts?.bold ? fontBold : font;
    for (const line of text.split("\n")) {
      ensureSpace();
      page.drawText(sanitizePdfText(line), {
        x: MARGIN,
        y,
        size,
        font: used,
        color: opts?.color ?? black,
      });
      y -= LINE_GAP;
    }
  };

  draw("MusicPro School", { bold: true, size: 16 });
  draw("Notula didattica", { bold: true, size: 13, color: muted });
  y -= 8;

  draw(`Docente: ${payroll.teacherLabel}`, { bold: true, size: 12 });
  draw(`Mese: ${monthLabel(payroll.year, payroll.month)}`);
  y -= 8;

  draw("Dettaglio lezioni", { bold: true, size: 12 });
  if (payroll.lines.length === 0) {
    draw("Nessuna riga in questo mese.");
  } else {
    for (const line of payroll.lines) {
      const date = formatIsoDate(line.occurredOn);
      const label = `${date} · ${kindLabel(line.kind)} · ${line.description}`;
      draw(`${label}: ${formatEuro(line.amountEur)}`);
    }
  }
  y -= 8;

  draw("Riepilogo", { bold: true, size: 12 });
  draw(`Lordo: ${formatEuro(payroll.grossEur)}`);
  draw(`Anticipi: ${formatEuro(payroll.advancesEur)}`);
  draw(`Riporto: ${formatEuro(payroll.carryInEur)}`);
  if (payroll.carryOutEur > 0) {
    draw(`Riporto al mese successivo: ${formatEuro(payroll.carryOutEur)}`);
  }
  draw(`Ritenuta: ${formatEuro(payroll.withholdingEur)}`);
  draw(`Netto: ${formatEuro(payroll.netEur)}`, { bold: true, size: 12 });
  y -= 16;

  if (payroll.hasSignature && payroll.signedAt) {
    draw(`Firmata il ${formatIsoDate(payroll.signedAt)}`);
  } else if (payroll.hasSignature) {
    draw("Firma: presente");
  } else {
    draw("Firma docente: _______________________________", {
      size: 10,
      color: muted,
    });
  }

  if (payroll.hasInvoice) {
    const invoiceName = payroll.invoiceFilename?.trim() || "fattura caricata";
    draw(`Fattura: ${invoiceName}`);
  }

  y -= 16;
  draw("Documento generato automaticamente dal sistema MusicPro School.", {
    size: 9,
    color: muted,
  });

  const bytes = await doc.save();
  const filename = `notula-didattica-${payroll.year}-${pad2(payroll.month)}-${lastNameSlug(payroll.teacherLabel)}.pdf`;

  return {
    bytes,
    filename,
    contentType: "application/pdf",
  };
}

export function downloadLessonPayrollPdf(pdf: GeneratedPayrollPdf) {
  const blob = new Blob([pdf.bytes as BlobPart], { type: pdf.contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = pdf.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
