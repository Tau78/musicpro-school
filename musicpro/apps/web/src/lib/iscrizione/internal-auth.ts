/**
 * Auth server-to-server per action interne iscrizione (es. completaInvioIscrizione).
 * Accetta ISCRIZIONE_INTERNAL_SECRET oppure CRON_SECRET (già usato Edge → Next).
 *
 * In produzione il secret è obbligatorio (fail-closed → 503 se assente).
 * In non-prod senza secret l'action resta aperta per dev locale.
 */

export function iscrizioneInternalSecret(): string {
  return (
    process.env.ISCRIZIONE_INTERNAL_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

/** Prod Vercel o NODE_ENV=production (anche `next start` / preview build). */
export function isIscrizioneProductionEnv(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
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

export type CompletaInvioGate =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: string };

/**
 * Gate per POST action=completaInvioIscrizione.
 * - Prod senza secret → 503 (fail-closed)
 * - Secret presente ma auth fallisce → 401
 * - Non-prod senza secret → ok (dev locale)
 */
export function gateCompletaInvioIscrizione(request: Request): CompletaInvioGate {
  const secret = iscrizioneInternalSecret();
  if (!secret) {
    if (isIscrizioneProductionEnv()) {
      return {
        ok: false,
        status: 503,
        message: "Configurazione server incompleta (secret interno)",
      };
    }
    return { ok: true };
  }
  if (!isIscrizioneInternalAuthorized(request)) {
    return { ok: false, status: 401, message: "Non autorizzato" };
  }
  return { ok: true };
}
