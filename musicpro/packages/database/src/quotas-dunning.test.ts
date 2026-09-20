import assert from "node:assert/strict";
import { test } from "node:test";

import { buildQuotaDunningMessage } from "./quotas.ts";

test("sollecito quota include anno e importo", () => {
  const msg = buildQuotaDunningMessage({
    firstName: "Mario",
    fiscalYear: 2026,
    amountEur: 15,
  });
  assert.match(msg.subject, /2026/);
  assert.match(msg.body, /Mario/);
  assert.match(msg.body, /2026/);
  assert.match(msg.body, /15/);
});

test("sollecito senza importo omette la riga Importo", () => {
  const msg = buildQuotaDunningMessage({
    firstName: "Anna",
    fiscalYear: 2025,
    amountEur: null,
  });
  assert.doesNotMatch(msg.body, /Importo:/);
});

test("sollecito con link pagamento include l'URL", () => {
  const msg = buildQuotaDunningMessage({
    firstName: "Luca",
    fiscalYear: 2026,
    amountEur: 15,
    paymentUrl: "https://pay.example/abc",
  });
  assert.match(msg.body, /https:\/\/pay\.example\/abc/);
  assert.match(msg.body, /pagare online/i);
});
