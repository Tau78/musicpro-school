import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReceiptsNote,
  buildVersatiRimborsoLine,
  formatEuroPrefix,
  formatImportoPlain,
} from "./reimbursements.ts";

test("format euro legacy: prefisso € e importo GAS", () => {
  assert.equal(formatEuroPrefix(100), "€ 100,00");
  assert.equal(formatImportoPlain(100), "100.00");
});

test("buildReceiptsNote usa € 100,00 come il GAS", () => {
  assert.equal(
    buildReceiptsNote({
      grossAmountEur: 100,
      receiptsAmountEur: 100,
      historicBalanceEur: 0,
    }),
    "Importo consegnato: € 100,00",
  );
});

test("riga Versati replica il template Google Doc", () => {
  assert.equal(
    buildVersatiRimborsoLine({
      paymentMethod: "Bonifico Bancario: € 100,00",
      grossAmountEur: 100,
      paymentDateLabel: "05/08/2026",
    }),
    "Versati a rimborso totale in Bonifico Bancario: € 100,00 il 05/08/2026",
  );
  assert.equal(
    buildVersatiRimborsoLine({
      paymentMethod: "Bonifico Bancario",
      grossAmountEur: 100,
      paymentDateLabel: "05/08/2026",
    }),
    "Versati a rimborso totale in Bonifico Bancario: € 100.00 il 05/08/2026",
  );
});
