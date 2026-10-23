/** Drive webViewLink: Gmail lo mostra come chip allegato col nome file Drive. */
export function isGoogleDriveFileUrl(url: string): boolean {
  return /drive\.google\.com\/(?:file\/d\/|open\?)/i.test(url);
}

/**
 * Testo body quando il PDF è già MIME-allegato.
 * Non mettere link Drive: Gmail lo rende come secondo chip «Iscrizione-…» (PDF doppio in UI).
 * Preferisci URL Storage (signed/public) se presente.
 */
export function enrollmentPdfEmailBodyHint(opts: {
  pdfUrl?: string | null;
  storagePdfUrl?: string | null;
  storagePath?: string | null;
  role: "admin" | "socio";
}): string {
  const candidates = [opts.storagePdfUrl, opts.pdfUrl]
    .map((u) => String(u || "").trim())
    .filter(Boolean);
  const safeUrl =
    candidates.find((u) => !isGoogleDriveFileUrl(u)) || "";
  if (opts.role === "socio") {
    return safeUrl ? `\nCopia online:\n${safeUrl}\n` : "";
  }
  if (safeUrl) return `PDF: ${safeUrl}`;
  if (opts.storagePath) {
    return `PDF allegato (path interno: ${opts.storagePath}).`;
  }
  return "PDF in allegato.";
}
