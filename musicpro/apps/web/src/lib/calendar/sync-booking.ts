/**
 * Richiede sync Google Calendar via API interna (non blocca UX se fallisce).
 */
export async function requestBookingCalendarSync(
  bookingId: string,
  action: "upsert" | "delete" = "upsert",
): Promise<void> {
  try {
    await fetch(`/api/bookings/${bookingId}/calendar-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      credentials: "same-origin",
    });
  } catch {
    // Sync best-effort — errore registrato lato server/Edge
  }
}
