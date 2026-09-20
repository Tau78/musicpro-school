import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMemberQuotaHistory,
  type MemberAnnualQuota,
} from "./quotas.ts";

function quota(
  partial: Partial<MemberAnnualQuota> &
    Pick<MemberAnnualQuota, "fiscalYear" | "paidAt">,
): MemberAnnualQuota {
  return {
    id: `q-${partial.fiscalYear}`,
    memberId: "m1",
    amountPaidEur: partial.amountPaidEur ?? null,
    amountDueEur: partial.amountDueEur ?? 15,
    notes: null,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("storico include anni senza riga come non versata", () => {
  const rows = buildMemberQuotaHistory({
    enrolledAt: "2024-03-01",
    throughYear: 2026,
    settings: [
      {
        id: "s",
        fiscalYear: 2025,
        amountEur: 15,
        createdAt: "",
        updatedAt: "",
      },
    ],
    quotas: [
      quota({
        fiscalYear: 2026,
        paidAt: "2026-01-10T12:00:00.000Z",
        amountPaidEur: 15,
      }),
    ],
  });

  assert.deepEqual(
    rows.map((r) => [r.fiscalYear, r.status, r.paidAt?.slice(0, 10) ?? null]),
    [
      [2026, "versata", "2026-01-10"],
      [2025, "non_versata", null],
      [2024, "non_versata", null],
    ],
  );
  assert.equal(rows.find((r) => r.fiscalYear === 2025)?.amountEur, 15);
});

test("senza iscrizione parte dalla prima quota", () => {
  const rows = buildMemberQuotaHistory({
    enrolledAt: null,
    throughYear: 2025,
    quotas: [
      quota({ fiscalYear: 2023, paidAt: "2023-02-01T12:00:00.000Z" }),
      quota({ fiscalYear: 2025, paidAt: null }),
    ],
  });
  assert.deepEqual(
    rows.map((r) => [r.fiscalYear, r.status]),
    [
      [2025, "non_versata"],
      [2024, "non_versata"],
      [2023, "versata"],
    ],
  );
});
