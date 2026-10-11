import { describe, expect, it } from "vitest";

import { resolveOnlineQuotaFiscalYearFromState } from "./quotas";

describe("resolveOnlineQuotaFiscalYearFromState", () => {
  it("usa l'anno corrente se non ancora versato", () => {
    expect(
      resolveOnlineQuotaFiscalYearFromState({
        currentYear: 2026,
        currentYearPaid: false,
        nextYearConfigured: true,
        nextYearPaid: false,
      }),
    ).toEqual({ fiscalYear: 2026, alreadyPaid: false });
  });

  it("passa al 2027 se il 2026 è già versato", () => {
    expect(
      resolveOnlineQuotaFiscalYearFromState({
        currentYear: 2026,
        currentYearPaid: true,
        nextYearConfigured: true,
        nextYearPaid: false,
      }),
    ).toEqual({ fiscalYear: 2027, alreadyPaid: false });
  });

  it("segna già pagato se anche il 2027 è versato", () => {
    expect(
      resolveOnlineQuotaFiscalYearFromState({
        currentYear: 2026,
        currentYearPaid: true,
        nextYearConfigured: true,
        nextYearPaid: true,
      }),
    ).toEqual({ fiscalYear: 2027, alreadyPaid: true });
  });

  it("resta sull'anno corrente se il successivo non è configurato", () => {
    expect(
      resolveOnlineQuotaFiscalYearFromState({
        currentYear: 2026,
        currentYearPaid: true,
        nextYearConfigured: false,
        nextYearPaid: false,
      }),
    ).toEqual({ fiscalYear: 2026, alreadyPaid: true });
  });
});
