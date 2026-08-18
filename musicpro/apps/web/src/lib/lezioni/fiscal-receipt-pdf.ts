import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { formatEuro } from "@musicpro/database";

type FiscalReceiptPdfInput = {
  code: string;
  issuedOn: string;
  payeeName: string;
  payeeTaxCode: string | null;
  amountEur: number;
  method: string;
  lines: { description: string; amountEur: number }[];
};

export interface GeneratedFiscalReceiptPdf {
  bytes: Uint8Array;
  filename: string;
  contentType: "application/pdf";
}

function formatIssuedOn(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-");
    return `${day}/${month}/${year}`;
  }
  return value;
}

function methodLabel(method: string): string {
  if (method === "stripe") return "Carta / Stripe";
  if (method === "bonifico") return "Bonifico";
  if (method === "contanti") return "Contanti";
  if (method === "altro") return "Altro";
  return method;
}

/** WinAnsi-safe text for Helvetica (maps common Italian chars). */
function sanitizePdfText(value: string): string {
  return value
    .replace(/\u2019/g, "'")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00A0/g, " ")
    .slice(0, 110);
}

export async function generateFiscalReceiptPdf(
  row: FiscalReceiptPdfInput,
): Promise<GeneratedFiscalReceiptPdf> {
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
    for (const line of text.split("\n")) {
      page.drawText(sanitizePdfText(line), {
        x: margin,
        y,
        size,
        font: used,
        color: opts?.color ?? black,
      });
      y -= lineGap;
    }
  };

  draw("MusicPro School", { bold: true, size: 16 });
  draw("Ricevuta", { bold: true, size: 13, color: muted });
  y -= 8;

  draw(`Numero: ${row.code}`, { bold: true });
  draw(`Data: ${formatIssuedOn(row.issuedOn)}`);
  y -= 8;

  draw("Intestatario", { bold: true, size: 12 });
  draw(row.payeeName, { bold: true, size: 12 });
  draw(`Cod. fiscale: ${row.payeeTaxCode?.trim() || "—"}`);
  y -= 8;

  draw("Dettaglio", { bold: true, size: 12 });
  if (row.lines.length === 0) {
    draw("Pacchetto lezioni");
    draw(formatEuro(row.amountEur));
  } else {
    for (const line of row.lines) {
      draw(`${line.description}: ${formatEuro(line.amountEur)}`);
    }
  }
  y -= 8;

  draw(`Totale: ${formatEuro(row.amountEur)}`, { bold: true, size: 12 });
  draw(`Metodo di pagamento: ${methodLabel(row.method)}`);
  y -= 24;

  draw("Documento generato automaticamente dal sistema MusicPro School.", {
    size: 9,
    color: muted,
  });

  const bytes = await doc.save();
  return {
    bytes,
    filename: `ricevuta-${row.code.replaceAll("/", "-")}.pdf`,
    contentType: "application/pdf",
  };
}
