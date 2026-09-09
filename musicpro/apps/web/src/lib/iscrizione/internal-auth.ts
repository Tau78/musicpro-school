/**
 * Auth server-to-server per action interne iscrizione (es. completaInvioIscrizione).
 * Accetta ISCRIZIONE_INTERNAL_SECRET oppure CRON_SECRET (già usato Edge → Next).
 */

export function iscrizioneInternalSecret(): string {
  return (
    process.env.ISCRIZIONE_INTERNAL_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

export function isIscrizioneInternalAuthorized(request: Request): boolean {
  const secret = iscrizioneInternalSecret();
  if (!secret) return false;

  const headerSecret = request.headers
    .get("x-iscrizione-internal-secret")
    ?.trim();
  if (headerSecret && headerSecret === secret) return true;

  const auth = request.headers.get("authorization")?.trim() ?? "";
  return auth === `Bearer ${secret}`;
}
