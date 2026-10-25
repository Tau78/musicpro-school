#!/usr/bin/env npx tsx
/**
 * PDF iscrizione di prova, senza database.
 *
 *   npx tsx scripts/preview-enrollment-pdf.mts
 *
 * Scrive in /tmp:
 *   iscrizione-eleonora.pdf   socio adulto, come il modulo storico
 *   iscrizione-michele.pdf    indirizzo lungo, firma
 *   iscrizione-tutore.pdf     minorenne con tutore e CF
 *   iscrizione-senza-numero.pdf  senza libro soci e senza firma
 */
import fs from "node:fs";

import {
  generateLegacyLayoutPdf,
  type EnrollmentPdfInput,
} from "../src/lib/iscrizione/enrollment-pdf.ts";

const signaturePath = process.env.ISCRIZIONE_PREVIEW_SIGNATURE || "/tmp/sig-socio.png";
const signatureData = fs.existsSync(signaturePath)
  ? `data:image/png;base64,${fs.readFileSync(signaturePath).toString("base64")}`
  : null;

function fixture(over: Partial<EnrollmentPdfInput> = {}): EnrollmentPdfInput {
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
    signatureData,
    ...over,
  };
}

const cases: Array<[string, EnrollmentPdfInput]> = [
  ["eleonora", fixture()],
  [
    "michele",
    fixture({
      memberNumber: 962,
      nome: "Michele",
      cognome: "Signoretti",
      luogoNascita: "Genova",
      provNascita: "GE",
      dataNascita: "1984-02-22",
      indirizzo: "VIA BRIGATA PARTIGIANA DALL'ORCO 1",
      cap: "16830",
      citta: "Casarza Ligure",
      prov: "GE",
      cf: "SGNMHL84B22D969D",
      email: "mikykky@libero.it",
      telefono: "3402262332",
      corso: "Chitarra e canto",
      dataOggi: "23/10/2026",
    }),
  ],
  [
    "tutore",
    fixture({
      memberNumber: 980,
      nome: "Giulia",
      cognome: "Rossi",
      luogoNascita: "Chiavari",
      provNascita: "GE",
      dataNascita: "2014-04-03",
      indirizzo: "Via Roma 12",
      cap: "16042",
      citta: "Carasco",
      prov: "GE",
      cf: "RSSGLI14D43C621X",
      email: "giulia.rossi@example.com",
      telefono: "3400001122",
      corso: "Pianoforte",
      tutoreNome: "Marco",
      tutoreCognome: "Rossi",
      tutoreTelefono: "3331234567",
      tutoreEmail: "marco.rossi@example.com",
      tutoreCf: "RSSMRC80A01D969D",
      dataOggi: "23/10/2026",
    }),
  ],
  [
    "senza-numero",
    fixture({
      memberNumber: null,
      signatureData: null,
      corso: "Canto",
    }),
  ],
];

for (const [name, input] of cases) {
  const pdf = await generateLegacyLayoutPdf(input);
  const out = `/tmp/iscrizione-${name}.pdf`;
  fs.writeFileSync(out, pdf.bytes);
  console.log(`${out}  ${pdf.filename}  ${pdf.bytes.length} bytes`);
}
