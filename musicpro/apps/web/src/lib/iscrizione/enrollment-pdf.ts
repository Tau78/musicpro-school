import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type EnrollmentPdfInput = {
  memberNumber: number | null;
  nome: string;
  cognome: string;
  luogoNascita: string;
  provNascita: string;
  dataNascita: string;
  indirizzo: string;
  cap: string;
  citta: string;
  prov: string;
  cf: string;
  email: string;
  telefono: string;
  corso: string;
  tutoreNome: string;
  tutoreCognome: string;
  tutoreTelefono: string;
  tutoreEmail: string;
  tutoreCf: string;
  quotaLabel: string;
  dataOggi: string;
  /** data URL or raw base64 PNG */
  signatureData?: string | null;
};

export type GeneratedEnrollmentPdf = {
  bytes: Uint8Array;
  filename: string;
  contentType: "application/pdf";
};

function sanitizePdfText(value: string, max = 120): string {
  return value
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7EÀ-ÿ]/g, "?")
    .slice(0, max);
}

function formatDateIt(value: string): string {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [y, m, d] = raw.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return raw;
}

function decodeSignaturePng(signatureData: string): Uint8Array | null {
  const raw = String(signatureData || "").trim();
  if (!raw) return null;
  const base64 = raw.includes(",") ? raw.split(",")[1] || "" : raw;
  if (!base64) return null;
  try {
    return Uint8Array.from(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

/** PDF domanda di iscrizione (pdf-lib), con firma se presente. */
export async function generateEnrollmentPdf(
  input: EnrollmentPdfInput,
): Promise<GeneratedEnrollmentPdf> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 790;
  const black = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.35, 0.35, 0.35);
  const lineGap = 16;

  const draw = (
    text: string,
    opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> },
  ) => {
    const size = opts?.size ?? 11;
    const used = opts?.bold ? fontBold : font;
    page.drawText(sanitizePdfText(text), {
      x: margin,
      y,
      size,
      font: used,
      color: opts?.color ?? black,
    });
    y -= lineGap;
  };

  const field = (label: string, value: string) => {
    draw(`${label}: ${value || "—"}`);
  };

  draw("MusicPro School", { bold: true, size: 16 });
  draw("Domanda di iscrizione / rinnovo associativo", {
    bold: true,
    size: 12,
    color: muted,
  });
  y -= 6;

  field(
    "N. socio",
    input.memberNumber != null ? String(input.memberNumber) : "da assegnare",
  );
  field("Data", input.dataOggi || formatDateIt(new Date().toISOString()));
  field("Quota", input.quotaLabel || "EUR 15,00");
  y -= 6;

  draw("Anagrafica", { bold: true, size: 12 });
  field("Nome", input.nome);
  field("Cognome", input.cognome);
  field("Luogo di nascita", input.luogoNascita);
  field("Prov. nascita", input.provNascita);
  field("Data di nascita", formatDateIt(input.dataNascita));
  field("Codice fiscale", input.cf);
  field("Indirizzo", input.indirizzo);
  field("CAP", input.cap);
  field("Citta", input.citta);
  field("Provincia", input.prov);
  field("Email", input.email);
  field("Telefono", input.telefono);
  field("Corso", input.corso || "---");
  y -= 6;

  if (
    input.tutoreNome ||
    input.tutoreCognome ||
    input.tutoreCf ||
    input.tutoreEmail ||
    input.tutoreTelefono
  ) {
    draw("Genitore / tutore", { bold: true, size: 12 });
    field("Nome", input.tutoreNome);
    field("Cognome", input.tutoreCognome);
    field("Telefono", input.tutoreTelefono);
    field("Email", input.tutoreEmail);
    field("Codice fiscale", input.tutoreCf);
    y -= 6;
  }

  draw("Firma digitale", { bold: true, size: 12 });
  const sigBytes = input.signatureData
    ? decodeSignaturePng(input.signatureData)
    : null;
  if (sigBytes) {
    try {
      const png = await doc.embedPng(sigBytes);
      const maxW = 180;
      const maxH = 60;
      const scale = Math.min(maxW / png.width, maxH / png.height, 1);
      const w = png.width * scale;
      const h = png.height * scale;
      y -= h + 4;
      page.drawImage(png, { x: margin, y, width: w, height: h });
      y -= 12;
      draw("Firma apposta digitalmente sul modulo online.", {
        size: 9,
        color: muted,
      });
    } catch {
      draw("Firma presente (immagine non incorporabile).", {
        size: 10,
        color: muted,
      });
    }
  } else {
    draw("Firma non disponibile sul documento.", {
      size: 10,
      color: muted,
    });
  }

  y -= 10;
  draw(
    "Documento generato automaticamente dal modulo di iscrizione online.",
    { size: 9, color: muted },
  );

  const bytes = await doc.save();
  const safeName = sanitizePdfText(
    `${input.cognome || "Socio"}-${input.nome || "Iscrizione"}`.replace(
      /\s+/g,
      "_",
    ),
    60,
  );
  return {
    bytes,
    filename: `Iscrizione-${safeName}.pdf`,
    contentType: "application/pdf",
  };
}
