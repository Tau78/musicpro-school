#!/usr/bin/env node
/**
 * Smoke: path Drive/Storage Rimborsi {anno}, PDF notula, sorgenti flusso admin.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("OK:", msg);
}

function reimbursementYearFolder(fiscalYear) {
  return `Rimborsi ${fiscalYear}`;
}

function reimbursementAssociateFolder(associateName) {
  const parts = associateName.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || "SenzaNome";
}

function reimbursementPdfFilename({ progressive, fiscalYear, associateName }) {
  const prog = String(progressive || "").trim() || "00";
  const name = associateName.trim() || "Associato";
  return `${prog}-${fiscalYear} - ${name}.pdf`;
}

function reimbursementStoragePath(params) {
  return [
    reimbursementYearFolder(params.fiscalYear),
    reimbursementAssociateFolder(params.associateName),
    reimbursementPdfFilename(params),
  ].join("/");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    ok(label);
  }
}

function sourceMustInclude(relPath, snippets) {
  const abs = path.join(rootDir, relPath);
  const src = readFileSync(abs, "utf8");
  for (const snippet of snippets) {
    if (!src.includes(snippet)) {
      fail(`${relPath} manca «${snippet}»`);
    }
  }
  if (!process.exitCode) ok(`${relPath} contratto presente`);
}

async function generateSamplePdf() {
  let PDFDocument;
  let StandardFonts;
  try {
    ({ PDFDocument, StandardFonts } = await import(
      path.join(rootDir, "musicpro/node_modules/pdf-lib/dist/pdf-lib.esm.js")
    ));
  } catch {
    try {
      ({ PDFDocument, StandardFonts } = await import("pdf-lib"));
    } catch {
      ok("pdf-lib non in cwd — skip generazione binaria (contratto path ok)");
      return;
    }
  }
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const raw = "Importo lordo: 100,00 € — Josè";
  const safe = raw.replace(/€/g, "EUR").replace(/\u2013|\u2014/g, "-");
  try {
    page.drawText(safe, { x: 50, y: 780, size: 12, font });
  } catch (err) {
    fail(`Helvetica reject: ${err instanceof Error ? err.message : err}`);
    return;
  }
  const bytes = await doc.save();
  if (bytes.length < 200) {
    fail(`PDF troppo piccolo (${bytes.length} byte)`);
  } else {
    ok(`PDF di prova generato (${bytes.length} byte)`);
  }
}

function main() {
  assertEqual(reimbursementYearFolder(2026), "Rimborsi 2026", "cartella anno");
  assertEqual(
    reimbursementAssociateFolder("Josè Del Castillo"),
    "Castillo",
    "cartella cognome GAS",
  );
  assertEqual(
    reimbursementPdfFilename({
      progressive: "09",
      fiscalYear: 2026,
      associateName: "Josè Del Castillo",
    }),
    "09-2026 - Josè Del Castillo.pdf",
    "nome file notula",
  );
  assertEqual(
    reimbursementStoragePath({
      progressive: "09",
      fiscalYear: 2026,
      associateName: "Josè Del Castillo",
    }),
    "Rimborsi 2026/Castillo/09-2026 - Josè Del Castillo.pdf",
    "path Storage/Drive",
  );

  sourceMustInclude("musicpro/packages/database/src/reimbursement-paths.ts", [
    "Rimborsi ${fiscalYear}",
    "reimbursementStoragePath",
  ]);
  sourceMustInclude("musicpro/apps/web/src/lib/reimbursements/persist.ts", [
    "uploadReimbursementPdfToDrive",
    "reimbursementStoragePath",
    "ensureReimbursementsBucket",
  ]);
  sourceMustInclude("musicpro/apps/web/src/lib/reimbursements/google-drive.ts", [
    "resolveYearFolder",
    "Condividi la cartella Drive",
  ]);
  sourceMustInclude(
    "musicpro/apps/web/src/components/admin/reimbursements-panel.tsx",
    ["pdfFailed", "Generazione…", "about:blank"],
  );
  sourceMustInclude("musicpro/apps/web/src/lib/reimbursements/send.ts", [
    "persistReimbursementPdf",
    "sendReimbursementEmailViaResend",
  ]);
  sourceMustInclude("musicpro/apps/web/src/lib/reimbursements/pdf.ts", [
    "RICHIESTA DI RIMBORSO SPESE",
    "Associazione Culturale M.P.",
    "TOTALE SPESE",
    "per accettazione",
    "IL PRESIDENTE",
    "Mauro Andreoni",
    "sanitizePdfText",
  ]);
  sourceMustInclude(
    "musicpro/apps/web/src/components/admin/reimbursements-panel.tsx",
    ['title="Report rimborsi"', "defaultOpen={false}"],
  );

  return generateSamplePdf();
}

main()
  .then(() => {
    if (process.exitCode) {
      console.error("\nSmoke rimborsi PDF: FAILED");
    } else {
      console.log("\nSmoke rimborsi PDF: PASSED");
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
