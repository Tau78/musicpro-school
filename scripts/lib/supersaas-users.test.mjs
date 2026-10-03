import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySuperSaasUser,
  creditReason,
  enrollmentIsPaid,
  nameTokenKey,
  parseEuroAmount,
  parseSuperSaasUserExport,
  quotaIsPaid,
  splitPersonName,
  summarizeUserPlans,
} from "./supersaas-users.mjs";

const members = [
  { id: "m-serena", first_name: "Serena", last_name: "Bottari", email: "serenabottari85@gmail.com" },
  { id: "m-marco", first_name: "Marco", last_name: "Facciolo", email: "marco.altro@example.com" },
];

test("il saldo con i centesimi resta in euro", () => {
  assert.equal(parseEuroAmount("7.5"), 7.5);
  assert.equal(parseEuroAmount("189,50"), 189.5);
  assert.equal(parseEuroAmount("0"), 0);
});

test("nome e cognome coincidono in entrambi gli ordini", () => {
  assert.equal(nameTokenKey("Marco Facciolo"), nameTokenKey("Facciolo Marco"));
  assert.equal(splitPersonName("Alessandro Petralia").lastName, "Petralia");
});

test("l'export non mette la password nel piano", () => {
  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet><Table>
<Row>
<Cell><Data ss:Type="String">Nome utente</Data></Cell>
<Cell><Data ss:Type="String">Password</Data></Cell>
<Cell><Data ss:Type="String">Nome e cognome</Data></Cell>
<Cell><Data ss:Type="String">Cellulare</Data></Cell>
<Cell><Data ss:Type="String">Saldo</Data></Cell>
<Cell><Data ss:Type="String">Creato il</Data></Cell>
<Cell><Data ss:Type="String">Ultimo accesso</Data></Cell>
<Cell><Data ss:Type="String">Gruppo</Data></Cell>
</Row>
<Row>
<Cell><Data ss:Type="String">serenabottari85@gmail.com</Data></Cell>
<Cell><Data ss:Type="String">segreto-lungo</Data></Cell>
<Cell><Data ss:Type="String">Serena Bottari</Data></Cell>
<Cell><Data ss:Type="String">333</Data></Cell>
<Cell><Data ss:Type="Number">7.5</Data></Cell>
<Cell><Data ss:Type="DateTime">2024-12-22T09:36:00.000Z</Data></Cell>
<Cell><Data ss:Type="DateTime">2026-09-17T22:29:00.000Z</Data></Cell>
<Cell><Data ss:Type="String">Nessuno</Data></Cell>
</Row>
</Table></Worksheet></Workbook>`;
  const [user] = parseSuperSaasUserExport(xml);
  const plan = classifySuperSaasUser(user, { members, enrollments: [], quotas: [] });
  assert.equal(plan.decision, "found_email");
  assert.equal(plan.creditEur, 7.5);
  assert.equal(plan.passwordChars, "segreto-lungo".length);
  assert.equal("password" in plan, false);
  assert.equal(JSON.stringify(plan).includes("segreto-lungo"), false);
});

test("stesso nome con altra email: trovato, non si crea un secondo associato", () => {
  const plan = classifySuperSaasUser(
    { email: "mrc.facciolo_pind@outlook.it", fullName: "Facciolo Marco", creditEur: 0, password: "x" },
    { members, enrollments: [], quotas: [] },
  );
  assert.equal(plan.decision, "found_name");
  assert.equal(plan.memberId, "m-marco");
  assert.equal(JSON.stringify(plan).includes('"password"'), false);
});

test("senza associato e con quota versata si crea; senza versamento si ignora", () => {
  const paid = classifySuperSaasUser(
    { email: "nuovo@example.com", fullName: "Nuovo Socio", creditEur: 6, password: "abcd1234" },
    {
      members,
      enrollments: [
        {
          email: "nuovo@example.com",
          first_name: "Nuovo",
          last_name: "Socio",
          payment_status: "PAGATO",
          amount_centesimi: 1500,
          fiscal_year: 2024,
          member_id: null,
          paid_at: "2024-01-02T00:00:00Z",
        },
      ],
      quotas: [],
    },
  );
  assert.equal(paid.decision, "create");
  assert.deepEqual(paid.quotaYears, [2024]);

  const unpaid = classifySuperSaasUser(
    { email: "altro@example.com", fullName: "Altro Nome", creditEur: 20, password: "abcd1234" },
    {
      members,
      enrollments: [
        {
          email: "altro@example.com",
          first_name: "Altro",
          last_name: "Nome",
          payment_status: "pending",
          amount_centesimi: 1500,
          fiscal_year: 2025,
          member_id: null,
        },
      ],
      quotas: [],
    },
  );
  assert.equal(unpaid.decision, "ignore");
  assert.equal(enrollmentIsPaid({ payment_status: "pending", amount_centesimi: 1500 }), false);
  assert.equal(quotaIsPaid({ amount_paid_eur: 15, paid_at: null }), true);
  assert.equal(quotaIsPaid({ amount_paid_eur: 0, paid_at: null }), false);
});

test("un versamento già collegato a un associato non crea un duplicato", () => {
  const plan = classifySuperSaasUser(
    { email: "nuovo@example.com", fullName: "Persona Diversa", creditEur: 0, password: "" },
    {
      members,
      enrollments: [
        {
          email: "nuovo@example.com",
          first_name: "Persona",
          last_name: "Diversa",
          payment_status: "PAGATO",
          amount_centesimi: 1500,
          paid_at: "2023-03-01",
          fiscal_year: 2023,
          member_id: "m-serena",
        },
      ],
      quotas: [],
    },
  );
  assert.equal(plan.decision, "found_enrollment");
  assert.equal(plan.memberId, "m-serena");
});

test("il riepilogo separa chi entra da chi resta fuori", () => {
  const summary = summarizeUserPlans([
    { decision: "found_email", creditEur: 20 },
    { decision: "create", creditEur: 7.5 },
    { decision: "ignore", creditEur: 106 },
  ]);
  assert.equal(summary.daCreare, 1);
  assert.equal(summary.ignorati, 1);
  assert.equal(summary.creditoIgnorato, 106);
  assert.equal(summary.creditoDaCreare, 7.5);
  assert.equal(creditReason("Nuovo@Example.com"), "SuperSaaS saldo nuovo@example.com");
});
