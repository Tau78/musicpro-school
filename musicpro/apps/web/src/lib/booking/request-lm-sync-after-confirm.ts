/** Best-effort sync LM (backup oltre al trigger DB / email confirm). */
export function requestLastMinuteSyncAfterConfirm(bookingId: string): void {
  const id = bookingId.trim();
  if (!id) return;
  void fetch(`/api/bookings/${encodeURIComponent(id)}/lm-sync`, {
    method: "POST",
    credentials: "same-origin",
  }).catch(() => {});
}