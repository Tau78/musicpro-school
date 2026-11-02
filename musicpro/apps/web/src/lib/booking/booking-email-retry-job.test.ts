import { describe, expect, it } from "vitest";

import { decideBookingEmailRetry } from "./booking-email-retry-job";
import { MEMBER_BOOKING_CONFIRM_SUBJECT } from "./process-booking-email";

const NOW = Date.parse("2026-11-02T12:00:00.000Z");
const PAID_AT = "2026-11-02T11:00:00.000Z";

describe("decideBookingEmailRetry", () => {
  it("invia se non c'è mai un sent al socio", () => {
    const decision = decideBookingEmailRetry({
      nowMs: NOW,
      memberEmail: "socio@example.com",
      paymentMethod: "nexi",
      totalPriceEur: 20,
      paidAtIso: PAID_AT,
      updatedAtIso: PAID_AT,
      emailLogs: [],
      receiptEmailedAt: null,
      hasEmessaReceipt: false,
    });
    expect(decision).toEqual({
      action: "send",
      force: false,
      reason: "conferma mai inviata con successo",
    });
  });

  it("force se conferma inviata ma ricevuta non marcata emailed", () => {
    const decision = decideBookingEmailRetry({
      nowMs: NOW,
      memberEmail: "socio@example.com",
      paymentMethod: "nexi",
      totalPriceEur: 20,
      paidAtIso: PAID_AT,
      updatedAtIso: PAID_AT,
      emailLogs: [
        {
          recipient_email: "socio@example.com",
          subject: MEMBER_BOOKING_CONFIRM_SUBJECT,
          status: "sent",
          created_at: "2026-11-02T11:05:00.000Z",
        },
      ],
      receiptEmailedAt: null,
      hasEmessaReceipt: true,
    });
    expect(decision).toEqual({
      action: "send",
      force: true,
      reason: "ricevuta emessa ma non marcata inviata per email",
    });
  });

  it("salta se conferma già inviata e ricevuta ok", () => {
    const decision = decideBookingEmailRetry({
      nowMs: NOW,
      memberEmail: "socio@example.com",
      paymentMethod: "nexi",
      totalPriceEur: 20,
      paidAtIso: PAID_AT,
      updatedAtIso: PAID_AT,
      emailLogs: [
        {
          recipient_email: "socio@example.com",
          subject: MEMBER_BOOKING_CONFIRM_SUBJECT,
          status: "sent",
          created_at: "2026-11-02T11:05:00.000Z",
        },
      ],
      receiptEmailedAt: "2026-11-02T11:05:01.000Z",
      hasEmessaReceipt: true,
    });
    expect(decision.action).toBe("skip");
  });
});
