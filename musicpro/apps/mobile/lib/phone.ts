/**
 * Normalizza un telefono IT per wa.me: solo cifre.
 * - Prefisso 0 locale → 39…
 * - Già 39… → invariato (cifre)
 * - Altri internazionali già con country code → cifre thus
 * Restituisce null se non usabile.
 */
export function normalizeItPhoneForWa(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("39") && digits.length >= 10) {
    return digits;
  }
  if (digits.startsWith("0") && digits.length >= 9) {
    return `39${digits.slice(1)}`;
  }
  // Cellulare IT senza 0 (3xx…): anteponi 39
  if (digits.startsWith("3") && digits.length >= 9 && digits.length <= 11) {
    return `39${digits}`;
  }
  if (digits.length >= 10) {
    return digits;
  }
  return null;
}
