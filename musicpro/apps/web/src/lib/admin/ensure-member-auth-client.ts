/**
 * Dopo create/update anagrafica: garantisce Auth + user_id se c'è email.
 * Non blocca il salvataggio UI se fallisce (restituisce messaggio warning).
 */
export async function ensureMemberAuthClient(params: {
  memberId: string;
  email: string | null | undefined;
}): Promise<{ ok: boolean; warning?: string }> {
  const email = params.email?.trim() ?? "";
  if (!email) {
    return { ok: true };
  }

  try {
    const response = await fetch("/api/admin/members/ensure-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        memberId: params.memberId,
        email,
      }),
    });
    const payload = (await response.json()) as {
      success?: boolean;
      message?: string;
      skipped?: boolean;
    };
    if (!response.ok || !payload.success) {
      return {
        ok: false,
        warning:
          payload.message ??
          "Anagrafica salvata, ma l'account di accesso non è stato creato. Riprova o usa Accesso/password.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      warning:
        "Anagrafica salvata, ma non è stato possibile creare l'account di accesso (rete).",
    };
  }
}
