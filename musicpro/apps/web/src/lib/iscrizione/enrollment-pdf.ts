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
/** Margini ≈ Google Doc (2.5 cm). */
const MARGIN_X = 70;
const MARGIN_TOP = 52;
const GREEN_QUOTA = rgb(0.094, 0.502, 0.22);
const BLUE_LINK = rgb(0.06, 0.28, 0.75);
const GREY_HINT = rgb(0.55, 0.55, 0.55);
const BLACK = rgb(0.08, 0.08, 0.08);

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

function drawTextWithEuro(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
): number {
  const safe = sanitizeWinAnsi(text);
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
/* Layout locale = replica visiva del PDF esportato dal Google Doc GAS        */
/* (Arial/Helvetica, «Scuola Semplice», € verde, firme socio + presidente).   */
/* -------------------------------------------------------------------------- */

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = sanitizeWinAnsi(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function generateLegacyLayoutPdf(
  input: EnrollmentPdfInput,
): Promise<GeneratedEnrollmentPdf> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  // Google Doc template usa Arial → Helvetica è il surrogate StandardFonts.
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const maxW = PAGE_W - MARGIN_X * 2;
  let y = PAGE_H - MARGIN_TOP;
  const bodySize = 10.5;
  const lineGap = 14;

  const draw = (
    text: string,
    opts?: {
      bold?: boolean;
      italic?: boolean;
      size?: number;
      gap?: number;
      color?: ReturnType<typeof rgb>;
      x?: number;
    },
  ) => {
    const size = opts?.size ?? bodySize;
    const used = opts?.bold
      ? fontBold
      : opts?.italic
        ? fontOblique
        : font;
    const color = opts?.color ?? BLACK;
    const x = opts?.x ?? MARGIN_X;
    const lines = wrapText(text, used, size, maxW - (x - MARGIN_X));
    for (const line of lines) {
      drawTextWithEuro(page, used, line, x, y, size, color);
      y -= opts?.gap ?? lineGap;
    }
  };

  const drawCentered = (
    text: string,
    opts?: { bold?: boolean; size?: number; gap?: number },
  ) => {
    const size = opts?.size ?? bodySize;
    const used = opts?.bold ? fontBold : font;
    const safe = sanitizeWinAnsi(text);
    const w = used.widthOfTextAtSize(safe, size);
    page.drawText(safe, {
      x: (PAGE_W - w) / 2,
      y,
      size,
      font: used,
      color: BLACK,
    });
    y -= opts?.gap ?? lineGap;
  };

  const nome = String(input.nome || "").trim();
  const cognome = String(input.cognome || "").trim();
  const numero =
    input.memberNumber != null ? String(input.memberNumber) : "";
  const dataNascita = formatDateIt(input.dataNascita);
  const dataOggi = String(input.dataOggi || "").trim();
  const tutoreCompleto =
    `${input.tutoreNome || ""} ${input.tutoreCognome || ""}`.trim();
  const nomeCognomeField = [nome, cognome].filter(Boolean).join("_");

  // —— Header: «Scuola Semplice» in alto a destra + riga ——
  const scuolaLabel = "Scuola Semplice";
  const scuolaSize = 10;
  const scuolaW = font.widthOfTextAtSize(scuolaLabel, scuolaSize);
  const scuolaX = PAGE_W - MARGIN_X - scuolaW;
  page.drawText(scuolaLabel, {
    x: scuolaX,
    y,
    size: scuolaSize,
    font,
    color: BLACK,
  });
  page.drawLine({
    start: { x: scuolaX - 8, y: y - 3 },
    end: { x: PAGE_W - MARGIN_X + 4, y: y - 3 },
    thickness: 0.8,
    color: BLACK,
  });
  y -= 28;

  // —— Intestazione centrata (come export Google Doc) ——
  drawCentered("Associazione Culturale M.P.", { bold: true, size: 13, gap: 13 });
  drawCentered("Zona Loreto, 42, 16042 Carasco (GE)", { size: 10, gap: 12 });
  // Link blu stile Docs
  {
    const link = "www.musicproeventi.it - musicproeventi@gmail.com";
    const size = 10;
    const w = font.widthOfTextAtSize(link, size);
    page.drawText(link, {
      x: (PAGE_W - w) / 2,
      y,
      size,
      font,
      color: BLUE_LINK,
    });
    y -= 22;
  }

  // —— Oggetto / Libro Soci ——
  {
    const left = "Oggetto: DOMANDA D'ISCRIZIONE";
    const right = `Libro Soci ${numero}`.trim();
    page.drawText(left, {
      x: MARGIN_X,
      y,
      size: 11,
      font: fontBold,
      color: BLACK,
    });
    const rightW = fontBold.widthOfTextAtSize(right, 11);
    page.drawText(right, {
      x: PAGE_W - MARGIN_X - rightW,
      y,
      size: 11,
      font: fontBold,
      color: BLACK,
    });
    y -= 20;
  }

  // —— Anagrafica (underscore NOME_COGNOME come nel template Doc) ——
  draw(
    `Il/la sottoscritto/a ${nomeCognomeField} *nato/a ${input.luogoNascita || ""} ${(input.provNascita || "").toUpperCase()}`.trim(),
  );
  draw(
    `*il ${dataNascita} *Residente in via ${input.indirizzo || ""} ${input.citta || ""} ${(input.prov || "").toUpperCase()} ${input.cap || ""}`.replace(
      /\s+/g,
      " ",
    ),
  );
  draw(
    `*Codice Fiscale ${(input.cf || "").toUpperCase()} Cellulare ${input.telefono || ""}`,
  );
  draw(`*email ${input.email || ""} Corso ${input.corso || "---"}`);
  y -= 6;

  // —— Tutore/Genitore (etichette grigie italic come nel Doc; valori se presenti) ——
  draw("Tutore/Genitore", { bold: true, size: 11, gap: 12 });
  const tutoreRows: Array<{ label: string; value: string }> = [
    { label: "Nome e Cognome", value: tutoreCompleto },
    { label: "Telefono", value: String(input.tutoreTelefono || "").trim() },
    { label: "Email", value: String(input.tutoreEmail || "").trim() },
    {
      label: "Codice Fiscale",
      value: String(input.tutoreCf || "").trim().toUpperCase(),
    },
  ];
  for (const row of tutoreRows) {
    if (row.value) {
      page.drawText(sanitizeWinAnsi(row.value), {
        x: MARGIN_X,
        y,
        size: bodySize,
        font,
        color: BLACK,
      });
      y -= 11;
      page.drawText(`*${row.label}`, {
        x: MARGIN_X,
        y,
        size: 8.5,
        font: fontOblique,
        color: GREY_HINT,
      });
      y -= 13;
    } else {
      page.drawText(`*${row.label}`, {
        x: MARGIN_X,
        y,
        size: 9,
        font: fontOblique,
        color: GREY_HINT,
      });
      y -= 14;
    }
  }
  y -= 4;

  // —— CHIEDE ——
  draw("CHIEDE", { bold: true, size: 11, gap: 13 });
  {
    const p1 =
      "a codesta spettabile Associazione, con sede legale in Zona Loreto, 42, 16042 Carasco (GE) di essere iscritto in qualità di Socio Ordinario. Tale iscrizione permette l'accesso alla struttura per l'utilizzo come sala prove/studio/scuola, il coinvolgimento negli Eventi Associativi e l'iscrizione al sito www.musicproeventi.it";
    const lines = wrapText(p1, font, bodySize, maxW);
    for (const line of lines) {
      // colora il pezzo URL se presente nella riga
      const url = "www.musicproeventi.it";
      const at = line.indexOf(url);
      if (at >= 0) {
        const before = line.slice(0, at);
        const after = line.slice(at + url.length);
        let x = MARGIN_X;
        if (before) {
          page.drawText(before, { x, y, size: bodySize, font, color: BLACK });
          x += font.widthOfTextAtSize(before, bodySize);
        }
        page.drawText(url, { x, y, size: bodySize, font, color: BLUE_LINK });
        x += font.widthOfTextAtSize(url, bodySize);
        if (after) {
          page.drawText(after, { x, y, size: bodySize, font, color: BLACK });
        }
      } else {
        // grassetto su "Socio Ordinario." se nella riga
        const boldNeedle = "Socio Ordinario.";
        const bi = line.indexOf(boldNeedle);
        if (bi >= 0) {
          let x = MARGIN_X;
          const before = line.slice(0, bi);
          const after = line.slice(bi + boldNeedle.length);
          if (before) {
            page.drawText(before, { x, y, size: bodySize, font, color: BLACK });
            x += font.widthOfTextAtSize(before, bodySize);
          }
          page.drawText(boldNeedle, {
            x,
            y,
            size: bodySize,
            font: fontBold,
            color: BLACK,
          });
          x += fontBold.widthOfTextAtSize(boldNeedle, bodySize);
          if (after) {
            page.drawText(after, { x, y, size: bodySize, font, color: BLACK });
          }
        } else {
          page.drawText(line, {
            x: MARGIN_X,
            y,
            size: bodySize,
            font,
            color: BLACK,
          });
        }
      }
      y -= lineGap;
    }
  }

  // Quota con € verde
  {
    const prefix = "La quota associativa prevista per l'anno in corso è di: ";
    const amount = quotaAmountOnly(input.quotaLabel);
    page.drawText(prefix, {
      x: MARGIN_X,
      y,
      size: bodySize,
      font,
      color: BLACK,
    });
    let x = MARGIN_X + font.widthOfTextAtSize(prefix, bodySize);
    x += drawEuroGlyph(page, fontBold, x, y, bodySize, GREEN_QUOTA);
    x += bodySize * 0.12;
    page.drawText(amount, {
      x,
      y,
      size: bodySize,
      font: fontBold,
      color: GREEN_QUOTA,
    });
    y -= 18;
  }

  // —— E DICHIARA ——
  draw("E DICHIARA CONTESTUALMENTE", { bold: true, size: 11, gap: 13 });
  draw(
    "Di voler rispettare lo statuto e i regolamenti che regolano l'associazione; Di autorizzare il tacito rinnovo tramite versamento quota annuale",
  );
  y -= 2;

  const sigBytes = input.signatureData
    ? decodeSignaturePng(input.signatureData)
    : null;
  let sigImage: PDFImage | null = null;
  if (sigBytes) {
    try {
      sigImage = await doc.embedPng(sigBytes);
    } catch {
      sigImage = null;
    }
  }

  const drawSignatureBlock = () => {
    // Riga data a sinistra, firma a destra (come Doc)
    const dateLine = `Carasco , ${dataOggi}`;
    page.drawText(dateLine, {
      x: MARGIN_X,
      y,
      size: bodySize,
      font,
      color: BLACK,
    });
    page.drawText("data", {
      x: MARGIN_X,
      y: y - 11,
      size: 8.5,
      font: fontOblique,
      color: GREY_HINT,
    });

    const sigX = MARGIN_X + 220;
    if (sigImage) {
      const maxWSig = 130;
      const maxHSig = 48;
      const scale = Math.min(
        maxWSig / sigImage.width,
        maxHSig / sigImage.height,
        1,
      );
      const w = sigImage.width * scale;
      const h = sigImage.height * scale;
      page.drawImage(sigImage, {
        x: sigX,
        y: y - h + 8,
        width: w,
        height: h,
      });
      page.drawText("firmare qui", {
        x: sigX,
        y: y - h - 2,
        size: 8.5,
        font: fontOblique,
        color: GREY_HINT,
      });
      y -= h + 16;
    } else {
      page.drawText("firmare qui", {
        x: sigX,
        y,
        size: 9,
        font: fontOblique,
        color: GREY_HINT,
      });
      y -= 22;
    }
  };

  drawSignatureBlock();
  y -= 4;

  // GDPR
  {
    const gdpr =
      'e di essere a conoscenza che il trattamento dei dati personali è gestito, anche elettronicamente, ai soli fini associativi e di autorizzare alla gestione dei dati medesimi, con le garanzie e i diritti previsti dall\'articolo 13 del GDPR 2016/679, n. 196., e di aver letto l\'allegato "ISTRUZIONI OPERATIVE E INFORMATIVA SUL TRATTAMENTO DEI DATI" presente all\'URL www.musicproeventi.it/gdpr.pdf .';
    const size = 9;
    const lines = wrapText(gdpr, font, size, maxW);
    for (const line of lines) {
      const url = "www.musicproeventi.it/gdpr.pdf";
      const at = line.indexOf(url);
      if (at >= 0) {
        let x = MARGIN_X;
        const before = line.slice(0, at);
        const after = line.slice(at + url.length);
        if (before) {
          page.drawText(before, { x, y, size, font, color: BLACK });
          x += font.widthOfTextAtSize(before, size);
        }
        page.drawText(url, { x, y, size, font, color: BLUE_LINK });
        x += font.widthOfTextAtSize(url, size);
        if (after) {
          page.drawText(after, { x, y, size, font, color: BLACK });
        }
      } else {
        page.drawText(line, { x: MARGIN_X, y, size, font, color: BLACK });
      }
      y -= 12;
    }
  }
  y -= 6;

  drawSignatureBlock();
  y -= 10;

  // —— Presidente (blocco destro come Doc) ——
  {
    const rightX = PAGE_W - MARGIN_X;
    const line1 = "per accettazione";
    const line2 = "IL PRESIDENTE";
    const name = "Mauro Andreoni";
    const w1 = font.widthOfTextAtSize(line1, 10);
    const w2 = fontBold.widthOfTextAtSize(line2, 11);
    const w3 = fontOblique.widthOfTextAtSize(name, 10);
    page.drawText(line1, {
      x: rightX - w1,
      y,
      size: 10,
      font,
      color: BLACK,
    });
    y -= 13;
    page.drawText(line2, {
      x: rightX - w2,
      y,
      size: 11,
      font: fontBold,
      color: BLACK,
    });
    y -= 13;
    page.drawText(name, {
      x: rightX - w3,
      y,
      size: 10,
      font: fontOblique,
      color: BLACK,
    });

    const presBytes = loadPresidentSignaturePng();
    if (presBytes) {
      try {
        const png = await doc.embedPng(presBytes);
        const maxW = 160;
        const maxH = 55;
        const scale = Math.min(maxW / png.width, maxH / png.height);
        const w = png.width * scale;
        const h = png.height * scale;
        page.drawImage(png, {
          x: rightX - w,
          y: y - h - 4,
          width: w,
          height: h,
        });
        page.drawText("firma", {
          x: rightX - w,
          y: y - h - 14,
          size: 8,
          font: fontOblique,
          color: GREY_HINT,
        });
        y -= h + 20;
      } catch {
        y -= 8;
      }
    } else {
      y -= 8;
    }
  }

  // Footer
  y = Math.min(y, 48);
  drawCentered(
    "Associazione Culturale M.P. - Zona Loreto, 42, 16042 Carasco (GE)",
    { size: 9, gap: 10 },
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
