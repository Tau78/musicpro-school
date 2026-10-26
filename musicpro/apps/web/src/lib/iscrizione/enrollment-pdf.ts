/**
 * PDF domanda di iscrizione allineato al template legacy GAS
 * (Google Doc `TEMPLATE_ISCRIZIONE_ID` / PDF «Iscrizione - Cognome Nome»).
 *
 * 1) Prova copia+replace sul Google Doc (identico al GAS), se il SA ci arriva.
 * 2) Altrimenti layout locale fedelmente basato sul modulo storico
 *    «Associazione Culturale M.P. / DOMANDA D'ISCRIZIONE».
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";

import { getGoogleDriveAccessToken } from "@/lib/reimbursements/google-drive";
import { PRESIDENT_SIGNATURE_PNG_BASE64 } from "@/lib/reimbursements/assets/firma-presidente-base64";

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

/** Stesso ID di `TEMPLATE_ISCRIZIONE_ID` in iscrizioni.js / Codice.js */
const TEMPLATE_ISCRIZIONE_ID =
  process.env.ISCRIZIONE_GOOGLE_DOC_TEMPLATE_ID?.trim() ||
  "1CVxLAsEweuZD11N6V3CBkaNqegG6c2BeOT9WZLSw63I";

const FIRMA_PLACEHOLDER = "{{FIRMA}}";

function formatDateIt(value: string): string {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [y, m, d] = raw.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return raw;
}

function decodeSignaturePng(signatureData: string): Buffer | null {
  const raw = String(signatureData || "").trim();
  if (!raw) return null;
  const base64 = raw.includes(",") ? raw.split(",")[1] || "" : raw;
  if (!base64) return null;
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

function legacyFilename(cognome: string, nome: string): string {
  // Stesso schema dei PDF già in Drive «Iscrizioni» (Iscrizione-Cognome-Nome.pdf),
  // così il backfill sovrascrive il file che si apre dalla lista, senza duplicati.
  const safe = `${cognome || "Socio"}-${nome || "Iscrizione"}`
    .replace(/\s+/g, "-")
    .replace(/[^\w\-À-ÿ]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `Iscrizione-${safe}.pdf`;
}

/** Nomi storici possibili nella cartella piatta (da eliminare dopo overwrite). */
export function enrollmentPdfDriveAliases(
  cognome: string,
  nome: string,
): string[] {
  const c = String(cognome || "").trim();
  const n = String(nome || "").trim();
  return [
    `Iscrizione - ${c} ${n}.pdf`,
    `Iscrizione - ${c} ${n} .pdf`,
    `Iscrizione_${c}_${n}.pdf`,
  ].filter((name, i, arr) => arr.indexOf(name) === i);
}

function quotaForTemplate(quotaLabel: string): string {
  const raw = String(quotaLabel || "").trim();
  if (!raw) return "€ 15,00";
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (/€/.test(normalized) || /EUR/i.test(normalized)) {
    return normalized.replace(/EUR/gi, "€").replace(/\s+/g, " ").trim();
  }
  const digits = normalized.replace(/[^\d.,]/g, "");
  if (!digits) return "€ 15,00";
  return `€ ${digits}`;
}

function quotaAmountOnly(quotaLabel: string): string {
  const digits = quotaForTemplate(quotaLabel).replace(/[^\d.,]/g, "");
  return digits || "15,00";
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
/** Margini stretti dell'export Google Doc storico: il corpo legale sta su 3 righe. */
const MARGIN_X = 18;
const RIGHT_X = PAGE_W - 18;
const GREEN_QUOTA = rgb(0.16, 0.48, 0.26);
const BLUE_LINK = rgb(0.067, 0.333, 0.8);
const GREY_HINT = rgb(0.42, 0.42, 0.42);
const BLACK = rgb(0.07, 0.07, 0.07);

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

function loadPresidentSignaturePng(): Uint8Array | null {
  const b64 = PRESIDENT_SIGNATURE_PNG_BASE64?.trim();
  if (!b64) return null;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function sanitizeWinAnsi(value: string): string {
  return value
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

/* -------------------------------------------------------------------------- */
/* Google Docs path (preferito, identico al GAS)                              */
/* -------------------------------------------------------------------------- */

type DocsStructuralElement = {
  startIndex?: number;
  endIndex?: number;
  paragraph?: {
    elements?: Array<{
      startIndex?: number;
      endIndex?: number;
      textRun?: { content?: string };
    }>;
  };
  table?: {
    tableRows?: Array<{
      tableCells?: Array<{ content?: DocsStructuralElement[] }>;
    }>;
  };
};

function collectFirmaStartIndexes(
  elements: DocsStructuralElement[] | undefined,
  out: number[],
): void {
  if (!elements) return;
  for (const el of elements) {
    if (el.paragraph?.elements) {
      for (const pe of el.paragraph.elements) {
        const text = pe.textRun?.content || "";
        if (!text.includes(FIRMA_PLACEHOLDER)) continue;
        let from = 0;
        while (from < text.length) {
          const at = text.indexOf(FIRMA_PLACEHOLDER, from);
          if (at < 0) break;
          out.push((pe.startIndex ?? el.startIndex ?? 0) + at);
          from = at + FIRMA_PLACEHOLDER.length;
        }
      }
    }
    if (el.table?.tableRows) {
      for (const row of el.table.tableRows) {
        for (const cell of row.tableCells || []) {
          collectFirmaStartIndexes(cell.content, out);
        }
      }
    }
  }
}

async function tryGenerateViaGoogleDoc(
  input: EnrollmentPdfInput,
): Promise<GeneratedEnrollmentPdf | null> {
  let token: string;
  try {
    token = await getGoogleDriveAccessToken();
  } catch {
    return null;
  }

  const probe = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(TEMPLATE_ISCRIZIONE_ID)}?fields=id&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!probe.ok) return null;

  const docTitle = `Iscrizione - ${input.cognome || ""} ${input.nome || ""}`.trim();
  const copyRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(TEMPLATE_ISCRIZIONE_ID)}/copy?supportsAllDrives=true&fields=id`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: docTitle }),
    },
  );
  const copied = (await copyRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!copyRes.ok || !copied.id) {
    throw new Error(
      copied.error?.message || `Copia template iscrizione fallita (${copyRes.status})`,
    );
  }
  const docId = copied.id;
  let signatureFileId: string | null = null;

  const batchUpdate = async (requests: unknown[]) => {
    if (!requests.length) return;
    const res = await fetch(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(
        data.error?.message || `Docs batchUpdate fallito (${res.status})`,
      );
    }
  };

  const replace = (placeholder: string, value: string) => ({
    replaceAllText: {
      containsText: { text: placeholder, matchCase: true },
      replaceText: String(value ?? ""),
    },
  });

  const trash = async (fileId: string) => {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trashed: true }),
      },
    ).catch(() => undefined);
  };

  try {
    const dataNascitaFmt = formatDateIt(input.dataNascita);
    const numeroSocio =
      input.memberNumber != null ? String(input.memberNumber) : "";
    const tutoreNomeCompleto =
      `${input.tutoreNome || ""} ${input.tutoreCognome || ""}`.trim();

    await batchUpdate([
      replace("{{NUMERO_SOCIO}}", numeroSocio),
      replace("{{NOME}}", input.nome || ""),
      replace("{{COGNOME}}", input.cognome || ""),
      replace("{{LUOGO_NASCITA}}", input.luogoNascita || ""),
      replace("{{PROV_NASCITA}}", (input.provNascita || "").toUpperCase()),
      replace("{{DATA_NASCITA}}", dataNascitaFmt),
      replace("{{INDIRIZZO}}", input.indirizzo || ""),
      replace("{{CAP}}", input.cap || ""),
      replace("{{CITTA}}", input.citta || ""),
      replace("{{PROV}}", (input.prov || "").toUpperCase()),
      replace("{{CF}}", (input.cf || "").toUpperCase()),
      replace("{{EMAIL}}", input.email || ""),
      replace("{{TELEFONO}}", input.telefono || ""),
      replace("{{CORSO}}", input.corso || "---"),
      replace("{{QUOTA_ANNUALE}}", quotaForTemplate(input.quotaLabel)),
      replace("{{DATA_OGGI}}", input.dataOggi || ""),
      replace("{{TUTORE NOME}}", input.tutoreNome || ""),
      replace("{{TUTORE COGNOME}}", input.tutoreCognome || ""),
      replace("{{TUTORE NOME COMPLETO}}", tutoreNomeCompleto),
      replace("{{TUTORE TELEFONO}}", input.tutoreTelefono || ""),
      replace("{{TUTORE EMAIL}}", input.tutoreEmail || ""),
      replace("{{TUTORE_CF}}", (input.tutoreCf || "").toUpperCase()),
    ]);

    const sigPng = input.signatureData
      ? decodeSignaturePng(input.signatureData)
      : null;

    if (sigPng) {
      const boundary = `sig_${Date.now()}`;
      const metadata = {
        name: `firma-iscrizione-${Date.now()}.png`,
        mimeType: "image/png",
      };
      const prefix = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: image/png\r\n\r\n`,
      );
      const bodyBuf = Buffer.concat([
        prefix,
        sigPng,
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const up = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: bodyBuf,
        },
      );
      const uploaded = (await up.json().catch(() => ({}))) as { id?: string };
      if (!up.ok || !uploaded.id) {
        throw new Error(`Upload firma PNG fallito (${up.status})`);
      }
      signatureFileId = uploaded.id;
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploaded.id)}/permissions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: "reader", type: "anyone" }),
        },
      );
      const uri = `https://drive.google.com/uc?export=download&id=${uploaded.id}`;

      const docRes = await fetch(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}?fields=body(content)`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const docJson = (await docRes.json()) as {
        body?: { content?: DocsStructuralElement[] };
      };
      const indexes: number[] = [];
      collectFirmaStartIndexes(docJson.body?.content, indexes);
      indexes.sort((a, b) => b - a);
      const reqs: unknown[] = [];
      for (const startIndex of indexes) {
        reqs.push({
          insertInlineImage: {
            uri,
            location: { index: startIndex },
            objectSize: {
              height: { magnitude: 50, unit: "PT" },
              width: { magnitude: 130, unit: "PT" },
            },
          },
        });
        reqs.push({
          deleteContentRange: {
            range: {
              startIndex: startIndex + 1,
              endIndex: startIndex + 1 + FIRMA_PLACEHOLDER.length,
            },
          },
        });
      }
      await batchUpdate(reqs);
    } else {
      await batchUpdate([replace(FIRMA_PLACEHOLDER, "")]);
    }

    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(docId)}/export?mimeType=application%2Fpdf`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!exportRes.ok) {
      throw new Error(`Export PDF iscrizione fallito (${exportRes.status})`);
    }
    return {
      bytes: new Uint8Array(await exportRes.arrayBuffer()),
      filename: legacyFilename(input.cognome, input.nome),
      contentType: "application/pdf",
    };
  } finally {
    await trash(docId);
    if (signatureFileId) await trash(signatureFileId);
  }
}


/* -------------------------------------------------------------------------- */
/* Layout locale = replica del modulo Google Doc «Domanda d'iscrizione».      */
/* Il service account non apre il template (404): in produzione esce questo.  */
/* -------------------------------------------------------------------------- */

type Ink = ReturnType<typeof rgb>;
type StyledRun = { text: string; bold?: boolean; link?: boolean };

function wrapStyledRuns(
  runs: StyledRun[],
  regular: PDFFont,
  bold: PDFFont,
  size: number,
  maxWidth: number,
): StyledRun[][] {
  const lines: StyledRun[][] = [];
  let line: StyledRun[] = [];
  let width = 0;
  const widthOf = (text: string, isBold?: boolean) =>
    (isBold ? bold : regular).widthOfTextAtSize(sanitizeWinAnsi(text), size);

  const push = (word: string, proto: StyledRun) => {
    if (!word) return;
    const wordWidth = widthOf(word, proto.bold);
    if (line.length > 0 && width + wordWidth > maxWidth && word.trim()) {
      lines.push(line);
      line = [];
      width = 0;
    }
    if (!word.trim() && line.length === 0) return;
    const last = line[line.length - 1];
    if (
      last &&
      Boolean(last.bold) === Boolean(proto.bold) &&
      Boolean(last.link) === Boolean(proto.link)
    ) {
      last.text += word;
    } else {
      line.push({ text: word, bold: proto.bold, link: proto.link });
    }
    width += wordWidth;
  };

  for (const run of runs) {
    for (const part of sanitizeWinAnsi(run.text).split(/(\s+)/)) push(part, run);
  }
  if (line.length) lines.push(line);
  return lines.length ? lines : [[{ text: "" }]];
}

/** PDF domanda d'iscrizione, stesse coordinate del modulo storico (export Google Doc). */
export async function generateLegacyLayoutPdf(
  input: EnrollmentPdfInput,
): Promise<GeneratedEnrollmentPdf> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);
  const maxW = RIGHT_X - MARGIN_X;

  const drawAt = (
    text: string,
    x: number,
    yPos: number,
    size: number,
    used: PDFFont = font,
    color: Ink = BLACK,
  ): number => {
    const safe = sanitizeWinAnsi(text);
    if (!safe) return x;
    page.drawText(safe, { x, y: yPos, size, font: used, color });
    return x + used.widthOfTextAtSize(safe, size);
  };

  const drawCentered = (
    text: string,
    yPos: number,
    size: number,
    used: PDFFont = font,
    color: Ink = BLACK,
  ) => {
    const safe = sanitizeWinAnsi(text);
    const w = used.widthOfTextAtSize(safe, size);
    page.drawText(safe, { x: (PAGE_W - w) / 2, y: yPos, size, font: used, color });
  };

  const drawStyledLine = (runs: StyledRun[], x: number, yPos: number, size: number) => {
    let cursor = x;
    for (const run of runs) {
      const used = run.bold ? fontBold : font;
      const text = sanitizeWinAnsi(run.text);
      if (!text) continue;
      const color = run.link ? BLUE_LINK : BLACK;
      page.drawText(text, { x: cursor, y: yPos, size, font: used, color });
      const w = used.widthOfTextAtSize(text, size);
      if (run.link && text.trim()) {
        const trimLeft = text.length - text.trimStart().length;
        const trimRight = text.length - text.trimEnd().length;
        const leftW = trimLeft
          ? used.widthOfTextAtSize(text.slice(0, trimLeft), size)
          : 0;
        const rightW = trimRight
          ? used.widthOfTextAtSize(text.slice(text.length - trimRight), size)
          : 0;
        page.drawLine({
          start: { x: cursor + leftW, y: yPos - 1.1 },
          end: { x: cursor + w - rightW, y: yPos - 1.1 },
          thickness: 0.45,
          color: BLUE_LINK,
        });
      }
      cursor += w;
    }
  };

  const drawStyled = (runs: StyledRun[], yPos: number, size: number, gap: number) => {
    const lines = wrapStyledRuns(runs, font, fontBold, size, maxW);
    let cursor = yPos;
    for (const line of lines) {
      drawStyledLine(line, MARGIN_X, cursor, size);
      cursor -= gap;
    }
    return cursor;
  };

  const drawFlow = (parts: string[], yPos: number, gap = 34) => {
    const size = 10;
    let x = MARGIN_X;
    let cursor = yPos;
    for (const part of parts) {
      const safe = sanitizeWinAnsi(part);
      if (!safe) continue;
      const w = font.widthOfTextAtSize(safe, size);
      if (x > MARGIN_X + 1 && x + 14 + w > RIGHT_X) {
        cursor -= 13;
        x = MARGIN_X;
      } else if (x > MARGIN_X + 1) {
        x += 16;
      }
      drawAt(safe, x, cursor, size);
      x += w;
    }
    return cursor - gap;
  };

  const nome = String(input.nome || "").trim();
  const cognome = String(input.cognome || "").trim();
  const numero = input.memberNumber != null ? String(input.memberNumber) : "";
  const dataNascita = formatDateIt(input.dataNascita);
  const dataOggi = formatDateIt(String(input.dataOggi || "").trim());
  const nomeCognomeField = [nome, cognome].filter(Boolean).join("_");
  const nato = [input.luogoNascita || "", (input.provNascita || "").toUpperCase()]
    .filter(Boolean)
    .join(" ");
  const place = [input.citta || "", (input.prov || "").toUpperCase(), input.cap || ""]
    .filter(Boolean)
    .join(" ");

  let y = PAGE_H - 40;

  drawCentered("Associazione Culturale M.P.", y, 13, fontBold);
  y -= 14;
  drawCentered("Zona Loreto, 42, 16042 Carasco (GE)", y, 9);
  y -= 14;
  {
    const site = "www.musicproeventi.it";
    const sep = " - ";
    const mail = "musicproeventi@gmail.com";
    const size = 9;
    const total =
      font.widthOfTextAtSize(site, size) +
      font.widthOfTextAtSize(sep, size) +
      font.widthOfTextAtSize(mail, size);
    let x = (PAGE_W - total) / 2;
    const link = (text: string) => {
      drawAt(text, x, y, size, font, BLUE_LINK);
      const w = font.widthOfTextAtSize(text, size);
      page.drawLine({
        start: { x, y: y - 1.1 },
        end: { x: x + w, y: y - 1.1 },
        thickness: 0.4,
        color: BLUE_LINK,
      });
      x += w;
    };
    link(site);
    x = drawAt(sep, x, y, size, font, BLUE_LINK);
    link(mail);
  }
  y -= 30;

  drawAt("Oggetto: DOMANDA D'ISCRIZIONE", MARGIN_X, y, 11, fontBold);
  {
    const libro = numero ? `Libro Soci ${numero}` : "Libro Soci";
    const w = fontBold.widthOfTextAtSize(libro, 11);
    drawAt(libro, RIGHT_X - w, y, 11, fontBold);
  }
  y -= 34;

  y = drawFlow(
    [`Il/la sottoscritto/a ${nomeCognomeField} *nato/a ${nato}`.replace(/\s+/g, " ").trim()],
    y,
  );
  y = drawFlow(
    [`*il ${dataNascita}`, "*Residente in via", String(input.indirizzo || "").trim(), place].filter(
      Boolean,
    ),
    y,
  );
  y = drawFlow(
    ["*Codice Fiscale", (input.cf || "").toUpperCase(), "Cellulare", String(input.telefono || "")],
    y,
  );
  y = drawFlow(["*email", String(input.email || ""), "Corso", input.corso || "---"], y);

  drawAt("Tutore/Genitore", MARGIN_X, y, 11, fontBold);
  y -= 14;
  const tutorCols: Array<{ label: string; value: string; x: number }> = [
    {
      label: "Nome e Cognome",
      value: `${input.tutoreNome || ""} ${input.tutoreCognome || ""}`.trim(),
      x: MARGIN_X,
    },
    {
      label: "Telefono",
      value: String(input.tutoreTelefono || "").trim(),
      x: 214,
    },
    {
      label: "Email",
      value: String(input.tutoreEmail || "").trim(),
      x: 378,
    },
  ];
  if (tutorCols.some((col) => col.value)) {
    for (const col of tutorCols) {
      if (col.value) drawAt(col.value, col.x, y, 10);
    }
    y -= 13;
  }
  for (const col of tutorCols) {
    drawAt(col.label, col.x, y, 8.5, fontOblique, GREY_HINT);
  }
  y -= 14;
  const tutoreCf = String(input.tutoreCf || "").trim().toUpperCase();
  if (tutoreCf) {
    drawAt(tutoreCf, MARGIN_X, y, 10);
    y -= 12;
    drawAt("Codice Fiscale", MARGIN_X, y, 8.5, fontOblique, GREY_HINT);
    y -= 16;
  }
  y -= 52;

  drawAt("CHIEDE", MARGIN_X, y, 11, fontBold);
  y -= 15;
  y = drawStyled(
    [
      {
        text: "a codesta spettabile Associazione, con sede legale in Zona Loreto, 42, 16042 Carasco (GE) di essere iscritto in qualità di ",
      },
      { text: "Socio Ordinario.", bold: true },
      {
        text: " Tale iscrizione permette l'accesso alla struttura per l'utilizzo come sala prove/studio/scuola, il coinvolgimento negli Eventi Associativi e l'iscrizione al sito ",
      },
      { text: "www.musicproeventi.it", link: true },
    ],
    y,
    9,
    12,
  );
  y -= 8;

  {
    const prefix = "La quota associativa prevista per l'anno in corso è di: ";
    const amount = quotaAmountOnly(input.quotaLabel);
    const size = 10;
    let x = drawAt(prefix, MARGIN_X, y, size);
    x += drawEuroGlyph(page, fontBold, x, y, size, GREEN_QUOTA);
    x += size * 0.2;
    drawAt(amount, x, y, size, fontBold, GREEN_QUOTA);
  }
  y -= 36;

  drawAt("E DICHIARA CONTESTUALMENTE", MARGIN_X, y, 11, fontBold);
  y -= 16;
  drawAt(
    "Di voler rispettare lo statuto e i regolamenti che regolano l'associazione; Di autorizzare il tacito rinnovo tramite versamento quota annuale",
    MARGIN_X,
    y,
    9,
  );
  y -= 36;

  const sigBytes = input.signatureData ? decodeSignaturePng(input.signatureData) : null;
  let sigImage: PDFImage | null = null;
  if (sigBytes) {
    try {
      sigImage = await doc.embedPng(sigBytes);
    } catch {
      sigImage = null;
    }
  }

  const drawSignatureBlock = (dateText: string, yPos: number): number => {
    drawAt(dateText, MARGIN_X, yPos, 10);
    const captionY = yPos - 12;
    drawAt("data", MARGIN_X, captionY, 8, fontOblique, GREY_HINT);
    const sigX = 176;
    const caption = "firmare qui";
    if (sigImage) {
      const maxWSig = 124;
      const maxHSig = 36;
      const scale = Math.min(maxWSig / sigImage.width, maxHSig / sigImage.height);
      const w = sigImage.width * scale;
      const h = sigImage.height * scale;
      page.drawImage(sigImage, { x: sigX, y: yPos + 4, width: w, height: h });
      const labelW = fontOblique.widthOfTextAtSize(caption, 8);
      drawAt(caption, sigX + Math.max(0, (w - labelW) / 2), captionY, 8, fontOblique, GREY_HINT);
    } else {
      drawAt(caption, sigX, captionY, 8, fontOblique, GREY_HINT);
    }
    return captionY - 14;
  };

  y -= 36;
  y = drawSignatureBlock(`Carasco , ${dataOggi}`.trim(), y);
  y -= 4;
  y = drawStyled(
    [
      {
        text: 'e di essere a conoscenza che il trattamento dei dati personali è gestito, anche elettronicamente, ai soli fini associativi e di autorizzare alla gestione dei dati medesimi, con le garanzie e i diritti previsti dall\'articolo 13 del GDPR 2016/679, n. 196., e di aver letto l\'allegato "ISTRUZIONI OPERATIVE E INFORMATIVA SUL TRATTAMENTO DEI DATI" presente all\'URL ',
      },
      { text: "www.musicproeventi.it/gdpr.pdf", link: true },
      { text: " ." },
    ],
    y,
    6.25,
    8,
  );
  y -= 46;
  y = drawSignatureBlock(`Carasco , ${dataOggi} ,`, y);
  y -= 22;

  {
    const acc = "per accettazione";
    const role = "IL PRESIDENTE";
    const whoName = "Mauro Andreoni";
    const roleW = fontBold.widthOfTextAtSize(role, 11);
    const roleX = RIGHT_X - roleW;
    const accW = font.widthOfTextAtSize(acc, 10);
    drawAt(acc, roleX - 32 - accW, y, 10);
    drawAt(role, roleX, y, 11, fontBold);
    y -= 13;
    const nameW = fontOblique.widthOfTextAtSize(whoName, 10);
    drawAt(whoName, RIGHT_X - nameW, y, 10, fontOblique);
    const presBytes = loadPresidentSignaturePng();
    if (presBytes) {
      try {
        const png = await doc.embedPng(presBytes);
        const maxWPres = 168;
        const maxHPres = 50;
        const scale = Math.min(maxWPres / png.width, maxHPres / png.height);
        const w = png.width * scale;
        const h = png.height * scale;
        page.drawImage(png, { x: RIGHT_X - w, y: y - h - 2, width: w, height: h });
        y -= h + 8;
      } catch {
        y -= 8;
      }
    }
  }

  drawCentered(
    "Associazione Culturale M.P. - Zona Loreto, 42, 16042 Carasco (GE)",
    28,
    9,
  );

  const bytes = await doc.save();
  return {
    bytes,
    filename: legacyFilename(input.cognome, input.nome),
    contentType: "application/pdf",
  };
}

/** Genera il PDF iscrizione (template Google Docs se accessibile, altrimenti layout legacy). */
export async function generateEnrollmentPdf(
  input: EnrollmentPdfInput,
): Promise<GeneratedEnrollmentPdf> {
  try {
    const viaDoc = await tryGenerateViaGoogleDoc(input);
    if (viaDoc) return viaDoc;
  } catch (err) {
    console.warn(
      "[iscrizione] template Google Doc non usabile, fallback layout legacy:",
      err instanceof Error ? err.message : err,
    );
  }
  return generateLegacyLayoutPdf(input);
}
