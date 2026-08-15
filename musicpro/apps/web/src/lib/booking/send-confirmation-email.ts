export type BookingEmailTemplate = "confirm" | "modified";

export interface RequestBookingEmailOptions {
  template?: BookingEmailTemplate;
  force?: boolean;
}

export interface RequestBookingEmailResult {
  success: boolean;
  skipped?: boolean;
  sent?: boolean;
  devMode?: boolean;
  message?: string;
}

/**
 * Richiede invio email prenotazione via API interna (best-effort, non blocca UX).
 */
export async function requestBookingConfirmationEmail(
  bookingId: string,
  options: RequestBookingEmailOptions = {},
): Promise<RequestBookingEmailResult> {
  try {
    const resp = await fetch(
      `/api/bookings/${encodeURIComponent(bookingId)}/send-email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: options.template ?? "confirm",
          force: options.force ?? false,
        }),
        credentials: "same-origin",
      },
    );

    const data = (await resp.json()) as RequestBookingEmailResult & {
      dev_mode?: boolean;
    };

    return {
      success: resp.ok && data.success !== false,
      skipped: data.skipped,
      sent: data.sent,
      devMode: data.dev_mode,
      message: data.message,
    };
  } catch {
    return {
      success: false,
      message: "Impossibile inviare l'email di conferma.",
    };
  }
}
