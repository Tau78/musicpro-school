/**
 * PDF domanda di iscrizione allineato al template legacy GAS
 * (Google Doc `TEMPLATE_ISCRIZIONE_ID` / PDF «Iscrizione - Cognome Nome»).
 *
 * 1) Prova copia+replace sul Google Doc (identico al GAS), se il SA ci arriva.
 * 2) Altrimenti layout locale fedelmente basato sul modulo storico
 *    «Associazione Culturale M.P. / DOMANDA D'ISCRIZIONE».
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import { getGoogleDriveAccessToken } from "@/lib/reimbursements/google-drive";

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
  if (!raw) return "EUR 15,00";
  // StandardFonts non hanno il glifo €: allineiamo a "EUR 15,00".
  const normalized = raw.replace(/€/g, "EUR").replace(/\s+/g, " ").trim();
  if (/EUR/i.test(normalized)) return normalized;
  const digits = normalized.replace(/[^\d.,]/g, "");
  if (!digits) return "EUR 15,00";
  return `EUR ${digits}`;
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
/* Layout locale = testo del modulo storico (PDF Ferrara / template GAS)      */
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
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const black = rgb(0, 0, 0);

  const marginX = 48;
  const maxW = 595.28 - marginX * 2;
  let y = 800;
  const lineGap = 13;

  const draw = (
    text: string,
    opts?: { bold?: boolean; size?: number; gap?: number },
  ) => {
    const size = opts?.size ?? 10;
    const used = opts?.bold ? fontBold : font;
    const lines = wrapText(text, used, size, maxW);
    for (const line of lines) {
      // StandardFonts: € non è WinAnsi — spezza e disegna "EUR" al posto del glifo.
      const safe = sanitizeWinAnsi(line).replace(/€/g, "EUR");
      page.drawText(safe, { x: marginX, y, size, font: used, color: black });
      y -= opts?.gap ?? lineGap;
    }
  };

  const drawRow = (
    left: string,
    right: string,
    opts?: { boldLeft?: boolean; size?: number },
  ) => {
    const size = opts?.size ?? 10;
    const leftFont = opts?.boldLeft ? fontBold : font;
    page.drawText(sanitizeWinAnsi(left), {
      x: marginX,
      y,
      size,
      font: leftFont,
      color: black,
    });
    const rightText = sanitizeWinAnsi(right);
    const rightW = font.widthOfTextAtSize(rightText, size);
    page.drawText(rightText, {
      x: 595.28 - marginX - rightW,
      y,
      size,
      font,
      color: black,
    });
    y -= lineGap;
  };

  const nome = String(input.nome || "").trim();
  const cognome = String(input.cognome || "").trim();
  const numero =
    input.memberNumber != null ? String(input.memberNumber) : "";
  const dataNascita = formatDateIt(input.dataNascita);
  const quota = sanitizeWinAnsi(quotaForTemplate(input.quotaLabel));
  const dataOggi = String(input.dataOggi || "").trim();
  const tutoreCompleto =
    `${input.tutoreNome || ""} ${input.tutoreCognome || ""}`.trim();

  // Intestazione — come PDF legacy
  draw("Associazione Culturale M.P.", { bold: true, size: 12 });
  draw("Zona Loreto, 42, 16042 Carasco (GE)", { size: 10 });
  draw("www.musicproeventi.it - musicproeventi@gmail.com", { size: 10 });
  y -= 6;
  drawRow(`Oggetto: DOMANDA D'ISCRIZIONE`, `Libro Soci ${numero}`, {
    boldLeft: true,
    size: 11,
  });
  y -= 4;

  draw(
    `Il/la sottoscritto/a ${nome} ${cognome} *nato/a ${input.luogoNascita || ""} ${(input.provNascita || "").toUpperCase()}`,
  );
  draw(
    `*il ${dataNascita} *Residente in via ${input.indirizzo || ""} ${input.citta || ""} ${(input.prov || "").toUpperCase()} ${input.cap || ""}`,
  );
  draw(
    `*Codice Fiscale ${(input.cf || "").toUpperCase()} Cellulare ${input.telefono || ""}`,
  );
  draw(`*email ${input.email || ""}    Corso ${input.corso || "---"}`);
  y -= 4;

  draw("Tutore/Genitore", { bold: true });
  draw(`Nome e Cognome ${tutoreCompleto}`);
  draw(`Telefono ${input.tutoreTelefono || ""}`);
  draw(`Email ${input.tutoreEmail || ""}`);
  if (input.tutoreCf?.trim()) {
    draw(`Codice Fiscale ${(input.tutoreCf || "").toUpperCase()}`);
  }
  y -= 6;

  draw("CHIEDE", { bold: true, size: 11 });
  draw(
    "a codesta spettabile Associazione, con sede legale in Zona Loreto, 42, 16042 Carasco (GE) di essere iscritto in qualità di Socio Ordinario.",
  );
  draw(
    "Tale iscrizione permette l'accesso alla struttura per l'utilizzo come sala prove/studio/scuola, il coinvolgimento negli Eventi Associativi e l'iscrizione al sito www.musicproeventi.it",
  );
  draw(`La quota associativa prevista per l'anno in corso è di: ${quota}`);
  y -= 4;

  draw("E DICHIARA CONTESTUALMENTE", { bold: true, size: 11 });
  draw(
    "Di voler rispettare lo statuto e i regolamenti che regolano l'associazione; Di autorizzare il tacito rinnovo tramite versamento quota annuale",
  );
  y -= 2;

  const sigBytes = input.signatureData
    ? decodeSignaturePng(input.signatureData)
    : null;
  let sigImage: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  if (sigBytes) {
    try {
      sigImage = await doc.embedPng(sigBytes);
    } catch {
      sigImage = null;
    }
  }

  const drawSignatureBlock = async () => {
    draw(`Carasco , ${dataOggi}`);
    const labelY = y;
    page.drawText("data", {
      x: marginX,
      y: labelY,
      size: 9,
      font,
      color: black,
    });
    if (sigImage) {
      const maxWSig = 130;
      const maxHSig = 50;
      const scale = Math.min(
        maxWSig / sigImage.width,
        maxHSig / sigImage.height,
        1,
      );
      const w = sigImage.width * scale;
      const h = sigImage.height * scale;
      page.drawImage(sigImage, {
        x: marginX + 80,
        y: labelY - h + 10,
        width: w,
        height: h,
      });
      y = labelY - h - 4;
    } else {
      page.drawText("firmare qui", {
        x: marginX + 80,
        y: labelY,
        size: 9,
        font,
        color: rgb(0.45, 0.45, 0.45),
      });
      y -= lineGap;
    }
  };

  await drawSignatureBlock();
  y -= 4;

  draw(
    "e di essere a conoscenza che il trattamento dei dati personali è gestito, anche elettronicamente, ai soli fini associativi e di autorizzare alla gestione dei dati medesimi, con le garanzie e i diritti previsti dall'articolo 13 del GDPR 2016/679, n. 196., e di aver letto l'allegato \"ISTRUZIONI OPERATIVE E INFORMATIVA SUL TRATTAMENTO DEI DATI\" presente all'URL www.musicproeventi.it/gdpr.pdf .",
  );
  y -= 4;

  await drawSignatureBlock();
  y -= 8;

  draw("per accettazione                         IL PRESIDENTE", {
    bold: true,
  });
  draw("Mauro Andreoni");
  y -= 10;
  draw("Associazione Culturale M.P. - Zona Loreto, 42, 16042 Carasco (GE)", {
    size: 9,
  });

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
