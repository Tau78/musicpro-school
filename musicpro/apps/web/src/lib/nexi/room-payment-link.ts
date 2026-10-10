import { eurosToCents } from "@/lib/nexi/cod-trans";
import { mintNexiPayment } from "@/lib/nexi/mint-payment";
import { buildRoomBookingReturnUrl } from "@/lib/nexi/return-urls";

export { eurosToCents };

export interface RoomPaymentLinkResult {
  success: boolean;
  url?: string;
  stripeId?: string;
  paymentId?: string;
  totaleCents?: number;
  message?: string;
}

export async function createNexiRoomBookingPaymentLink(opts: {
  bookingId: string;
  roomName: string;
  importoCentesimi: number;
  memberName?: string;
  memberId?: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  idempotencyKey?: string;
  returnBaseUrl?: string;
}): Promise<RoomPaymentLinkResult> {
  const bookingId = String(opts.bookingId || "").trim();
  if (!bookingId) {
    return { success: false, message: "ID prenotazione mancante." };
  }

  const importoCents = parseInt(String(opts.importoCentesimi), 10);
  if (!Number.isFinite(importoCents) || importoCents < 50) {
    return { success: false, message: "Importo prenotazione non valido." };
  }

  const importoDisplay = (importoCents / 100).toFixed(2);
  const roomName = String(opts.roomName || "Sala prova").trim();
  const returnBase = (
    opts.returnBaseUrl || "https://school.musicproeventi.it/dashboard"
  ).trim();

  const returnUrl = buildRoomBookingReturnUrl(returnBase, {
    bookingId,
    importo: importoDisplay,
  });

  const nameParts = String(opts.memberName || "").trim().split(/\s+/);
  const firstName = opts.firstName || nameParts[0] || "";
  const lastName = opts.lastName || nameParts.slice(1).join(" ") || "";

  return mintNexiPayment({
    flow: "room_booking",
    amountCents: importoCents,
    returnUrl,
    description: `Prenotazione ${roomName}`,
    firstName,
    lastName,
    email: opts.email,
    bookingId,
    memberId: opts.memberId || null,
    metadata: {
      mp_flow: "room_booking",
      mp_id_prenotazione: bookingId,
    },
  });
}
