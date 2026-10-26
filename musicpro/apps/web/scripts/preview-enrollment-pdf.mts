#!/usr/bin/env npx tsx
/**
 * PDF domanda d'iscrizione di prova, senza database.
 *
 *   cd musicpro/apps/web
 *   npx tsx scripts/preview-enrollment-pdf.mts
 *
 * Scrive /tmp/iscrizione-preview/*.pdf (layout legacy = output di produzione:
 * il template Google Doc non è leggibile dal service account).
 */
import fs from "node:fs";
import path from "node:path";
import {
  generateLegacyLayoutPdf,
  type EnrollmentPdfInput,
} from "../src/lib/iscrizione/enrollment-pdf.ts";

const SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAABQCAYAAAAnSfh8AAAC00lEQVR42u3dUZKbMAwAUMwZ9hC9/2n2ELlD+9WZTGbJAjHGkt776V8XZMm2TEKWBQAAAAAAAAAAAAAAAAAAAABgCl9ff/4+/wtHNSG4t3ifPR7fxoNDViG4t3ifi9ZKjAIO5H/xKmJSFHCFnnDr3hQxoQv4tXgzJvHW1lkPTOgCrtAT/la8e1dqp/BMVcA/JXa2lehI8VbZSlfYcaUv4D2JnWlg905M2Yv43Y5LIQcp4CP9YORBPXvtlVqJx+O7OcRb4nyQ48iW8mjvGLnvzXb/PXZcDvYmW4GPJmTUAexVeBl3Iu/iYTUOsoU+k9RRBrP3qhk9oc/Eo2IRn7nPVT841ySVLQafTGZVDrie7+3oPTb94Nyr79b/P3tr0buXzXQW0PO+WrSknnkgR1xb5Uks64HeJ/fTIg7mjKvQyOSqPIllOKXuGaNmJo55PTMWsUls/OTTMszEdw/gXTuCGWNw1yQWpaXofZ2h+7QZEvjuaxCD2i3FGjmYFVed2R4vicHvj4aujE3TC+rDM8agyo4kxcHS6L8965bNIdI8k/qov930Ybk+TDHi2qI9ix4Zj9ExWbMM5qg+KOLnsSs+vhn1pYjXeIyOyZppMD17vHYii/js9ap4jDqkumwLXa0PjJa8va83+scYe25zZ4pFy9wHVk/eXtdd7aUCkT44smbsA6/aNkVL3h5xyPYtoDMx+Wm7PEssWuYB7bFLyJDAZ+4h+6tt9t7f7OPf9IG2jlW+e/vJO8lnjUPTB9ZJ4qMvlavyQrl3W+nZY7BmT+azPU/GJLby7ntmHCkGa4VkPnuYkzmJX+NQtXi3fi0ySgzWKjPy2cObrEm69bMm1d/DHO3+16O/X5u556mSyFs7Ei9RX/wyQ4ZTx4qHN4p38WJ3W8i4PZ9SUMDh+5yKiax4FXC5n7MABTzZymMlAiswAAAAAAAAAAAAAAAAAAAAAAAAQCn/AIU3RFqurslBAAAAAElFTkSuQmCC";

const outDir = "/tmp/iscrizione-preview";

function adult(over: Partial<EnrollmentPdfInput> = {}): EnrollmentPdfInput {
  return {
    memberNumber: 771,
    nome: "Eleonora",
    cognome: "Condidorio",
    luogoNascita: "Genova",
    provNascita: "GE",
    dataNascita: "1986-09-21",
    indirizzo: "Via Piacenza 360",
    cap: "16043",
    citta: "Chiavari",
    prov: "GE",
    cf: "CNDLNR86P61D969C",
    email: "eleonora.condidorio@gmail.com",
    telefono: "3405634903",
    corso: "",
    tutoreNome: "",
    tutoreCognome: "",
    tutoreTelefono: "",
    tutoreEmail: "",
    tutoreCf: "",
    quotaLabel: "EUR 15,00",
    dataOggi: "17/06/2026",
    signatureData: SIGNATURE,
    ...over,
  };
}

async function writePdf(name: string, input: EnrollmentPdfInput) {
  const pdf = await generateLegacyLayoutPdf(input);
  const file = path.join(outDir, name);
  fs.writeFileSync(file, pdf.bytes);
  console.log(`${file}  ${pdf.filename}  ${pdf.bytes.length} bytes`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  await writePdf("eleonora.pdf", adult());
  await writePdf(
    "michele.pdf",
    adult({
      memberNumber: 962,
      nome: "Michele",
      cognome: "Signoretti",
      luogoNascita: "GENOVA",
      provNascita: "GE",
      dataNascita: "1983-02-22",
      indirizzo: "VIA BRIGATA PARTIGIANA DALL'ORCO 1",
      cap: "16830",
      citta: "CASARZA LIGURE",
      prov: "GE",
      cf: "SGNMHL84B22D969D",
      email: "mikykky@libero.it",
      telefono: "3402262332",
      corso: "Chitarra e canto",
      dataOggi: "23/10/2026",
    }),
  );
  await writePdf(
    "tutore.pdf",
    adult({
      memberNumber: 880,
      nome: "Giulia",
      cognome: "Bianchi",
      luogoNascita: "Chiavari",
      provNascita: "GE",
      dataNascita: "2012-04-03",
      indirizzo: "Via Roma 12",
      cap: "16043",
      citta: "Chiavari",
      prov: "GE",
      cf: "BNCGLI12D43C621X",
      email: "giulia.bianchi@example.com",
      telefono: "3400001122",
      corso: "Pianoforte",
      tutoreNome: "Laura",
      tutoreCognome: "Bianchi",
      tutoreTelefono: "3331234567",
      tutoreEmail: "laura.bianchi@example.com",
      tutoreCf: "BNCLRA80A41D969K",
      dataOggi: "23/10/2026",
    }),
  );
  await writePdf(
    "senza-numero.pdf",
    adult({
      memberNumber: null,
      signatureData: null,
      nome: "Paolo",
      cognome: "Rossi",
      corso: "Canto",
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
