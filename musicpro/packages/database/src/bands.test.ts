import { describe, expect, it } from "vitest";

import { resolveDefaultBookingBandId, type MyBandSummary } from "./bands";

function band(
  partial: Partial<MyBandSummary> & Pick<MyBandSummary, "id">,
): MyBandSummary {
  return {
    name: "Band",
    founderMemberId: "m1",
    createdAt: "",
    updatedAt: "",
    myRole: "founder",
    myStatus: "active",
    memberCount: 1,
    activeMemberCount: 1,
    allQuotaOk: true,
    ...partial,
  };
}

describe("resolveDefaultBookingBandId", () => {
  it("prefers the sole founder band", () => {
    const id = resolveDefaultBookingBandId([
      band({ id: "b1", myRole: "founder" }),
      band({ id: "b2", myRole: "member", myStatus: "active" }),
    ]);
    expect(id).toBe("b1");
  });

  it("returns null when ambiguous", () => {
    const id = resolveDefaultBookingBandId([
      band({ id: "b1", myRole: "member" }),
      band({ id: "b2", myRole: "member" }),
    ]);
    expect(id).toBeNull();
  });

  it("uses the only active band", () => {
    const id = resolveDefaultBookingBandId([band({ id: "solo", myRole: "member" })]);
    expect(id).toBe("solo");
  });
});
