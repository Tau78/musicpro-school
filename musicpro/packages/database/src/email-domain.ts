/**
 * Email con dominio e TLD reali (es. nome@dominio.it).
 * Rifiuta `user@gmail` o host senza punto.
 */
const EMAIL_WITH_DOMAIN =
  /^[a-z0-9._%+\-]+@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function normalizeInviteEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmailWithDomain(value: string): boolean {
  const email = normalizeInviteEmail(value);
  if (!email || email.length > 254) return false;
  if (email.includes("..")) return false;
  return EMAIL_WITH_DOMAIN.test(email);
}

export function emailDomainError(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "Email obbligatoria.";
  if (!isValidEmailWithDomain(raw)) {
    return "Inserisci un'email con dominio valido (es. nome@dominio.it).";
  }
  return null;
}

export function normalizePersonName(value: string | null | undefined): string {
  if (value == null) return "";
  const s = value.trim().toLowerCase();
  try {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    return s;
  }
}
