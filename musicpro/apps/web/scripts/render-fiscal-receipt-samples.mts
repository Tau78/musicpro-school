/**
 * Local sample PDFs only — no email, no DB.
 *
 *   cd musicpro/apps/web && npx tsx scripts/render-fiscal-receipt-samples.mts
 */
import { writeFileSync } from "node:fs";

import { generateFiscalReceiptPdf } from "../src/lib/lezioni/fiscal-receipt-pdf";

const samples = [
  {
    out: "/tmp/ricevuta-quota-campailla.pdf",
    input: {
      code: "QU/12/2026",
      issuedOn: "2026-10-20",
      payeeName: "Francesco Campailla",
      payeeTaxCode: "CMPFNC85A01F205X",
      payeeEmail: "francesco.campailla@email.it",
      amountEur: 80,
      method: "contanti",
      lines: [{ description: "Quota associativa 2026", amountEur: 80 }],
    },
  },
  {
    out: "/tmp/ricevuta-sala-rossa.pdf",
    input: {
      code: "SAL/3/2026",
      issuedOn: "2026-10-22",
      payeeName: "Mario Rossi",
      payeeTaxCode: null,
      amountEur: 25,
      method: "nexi",
      lines: [
        { description: "Prenotazione Sala Rossa", amountEur: 25 },
      ],
    },
  },
  {
    out: "/tmp/ricevuta-crediti-10.pdf",
    input: {
      code: "SER/8/2026",
      issuedOn: "2026-10-24",
      payeeName: "Giulia Bianchi",
      payeeTaxCode: null,
      amountEur: 50,
      method: "nexi",
      lines: [{ description: "Pacchetto 10 crediti", amountEur: 50 }],
    },
  },
  {
    out: "/tmp/ricevuta-bonifico.pdf",
    input: {
      code: "QUO/4/2026",
      issuedOn: "2026-10-21",
      payeeName: "Anna Verdi",
      payeeTaxCode: "VRDNNA80A41D969X",
      payeeEmail: "anna.verdi@email.it",
      amountEur: 80,
      method: "bonifico",
      lines: [{ description: "Quota associativa 2026", amountEur: 80 }],
    },
  },
] as const;

async function main() {
  for (const { out, input } of samples) {
    const pdf = await generateFiscalReceiptPdf(input);
    writeFileSync(out, pdf.bytes);
    console.log(`wrote ${out} (${pdf.bytes.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
