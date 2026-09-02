import assert from "node:assert/strict";
import { test } from "node:test";

import {
  reimbursementAssociateFolder,
  reimbursementPdfFilename,
  reimbursementStoragePath,
  reimbursementYearFolder,
} from "./reimbursement-paths.ts";

test("cartella anno è Rimborsi YYYY", () => {
  assert.equal(reimbursementYearFolder(2026), "Rimborsi 2026");
});

test("cartella associato = ultimo token del nome (GAS)", () => {
  assert.equal(reimbursementAssociateFolder("Josè Del Castillo"), "Castillo");
  assert.equal(reimbursementAssociateFolder("Mauro Andreoni"), "Andreoni");
});

test("path Storage/Drive coincide col layout GAS", () => {
  assert.equal(
    reimbursementStoragePath({
      progressive: "09",
      fiscalYear: 2026,
      associateName: "Josè Del Castillo",
    }),
    "Rimborsi 2026/Castillo/09-2026 - Josè Del Castillo.pdf",
  );
  assert.equal(
    reimbursementPdfFilename({
      progressive: "1",
      fiscalYear: 2026,
      associateName: "Anna Forloni",
    }),
    "1-2026 - Anna Forloni.pdf",
  );
});
