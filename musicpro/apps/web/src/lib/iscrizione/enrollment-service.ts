import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getNextMemberNumber,
  listAnnualQuotaSettings,
  upsertMemberAnnualQuotas,
  type Database,
} from "@musicpro/database";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { generateEnrollmentPdf } from "./enrollment-pdf";
import {
  createStripePaymentLinkQuotaAssociativa,
  QUOTA_ASSOCIATIVA_CENTESIMI,
  syncStripePaymentForEnrollment,
} from "./stripe-payment-link";
import { getStripeConfig } from "./stripe-config";

type Db = SupabaseClient<Database>;
type EnrollmentRow = Database["public"]["Tables"]["enrollments"]["Row"];
type MemberRow = Database["public"]["Tables"]["members"]["Row"];

type MagicTokenInfo = {
  email: string;
  expiresAt: string;
  usedAt: string | null;
  memberId?: string | null;
  cashQuotaPaid?: boolean;
};

const MAGIC_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const ENROLLMENT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_TIMEOUT_MS = 8000;
const ENROLLMENTS_STORAGE_BUCKET = "enrollments";
/**
 * Fresh signed URL TTL when resolving from pdf_storage_path (Option B).
 * Not durable truth — refreshed on each read; 7d is enough for email "Copia online".
 */
const ENROLLMENT_PDF_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7;
const TOKEN_KEY_PREFIX = "iscrizione_token:";
/** Bearer per getDatiIscrizionePerForm (mitiga IDOR su UUID). TTL ≈ pending sessionStorage. */
const FORM_ACCESS_KEY_PREFIX = "iscrizione_form_access:";
const FORM_ACCESS_TTL_MS = ENROLLMENT_DRAFT_TTL_MS;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EnrollmentPdfFields = {
  pdf_url?: string | null;
  pdf_storage_path?: string | null;
};

export interface EnrollmentFormData {
  nome?: string;
  cognome?: string;
  email?: string;
  cf?: string;
  telefono?: string;
  signatureData?: string;
  privacy_accepted?: boolean | string;
  photo_consent?: boolean | string;
  rinnovo_associato?: boolean | string;
  [key: string]: unknown;
}

function currentFiscalYear(): number {
  return new Date().getFullYear();
}

function isPaidStatus(status: string | null | undefined): boolean {
  return String(status || "").toUpperCase().trim() === "PAGATO";
}

function isRinnovo(data: EnrollmentFormData): boolean {
  return (
    data.rinnovo_associato === true ||
    String(data.rinnovo_associato || "").toLowerCase() === "true"
  );
}

function isFormFlagTrue(value: unknown): boolean {
  return (
    value === true ||
    String(value || "").toLowerCase() === "true" ||
    String(value || "") === "on"
  );
}

function photoConsentFromForm(data: EnrollmentFormData): boolean {
  return isFormFlagTrue(data.photo_consent);
}

function photoConsentPatch(consented: boolean) {
  return {
    photo_consent: consented,
    photo_consent_at: consented ? new Date().toISOString() : null,
  };
}

function formText(value: unknown): string {
  return String(value || "").trim();
}

function memberToFormFields(member: MemberRow): Record<string, string | boolean> {
  return {
    nome: String(member.first_name || "").trim(),
    cognome: String(member.last_name || "").trim(),
    luogo_nascita: String(member.birth_place || "").trim(),
    prov_nascita: String(member.birth_province || "").toUpperCase().trim(),
    data_nascita: member.birth_date
      ? String(member.birth_date).substring(0, 10)
      : "",
    cf: String(member.tax_code || "").toUpperCase().trim(),
    indirizzo: String(member.address_street || "").trim(),
    cap: String(member.address_postal_code || "").trim(),
    citta: String(member.address_city || "").trim(),
    prov: String(member.address_province || "").toUpperCase().trim(),
    email: String(member.email || "").trim(),
    telefono: String(member.phone || "").trim(),
    tutore_nome: String(member.manual_tutor_first_name || "").trim(),
    tutore_cognome: String(member.manual_tutor_last_name || "").trim(),
    tutore_telefono: String(member.manual_tutor_phone || "").trim(),
    tutore_email: String(member.manual_tutor_email || "").trim(),
    tutore_cf: String(member.manual_tutor_tax_code || "").toUpperCase().trim(),
    corso: "",
    rinnovo_associato: true,
    photo_consent: Boolean(member.photo_consent),
  };
}

async function findMemberByCf(db: Db, cf: string): Promise<MemberRow | null> {
  const target = String(cf || "").toUpperCase().trim();
  if (!target) return null;

  const { data } = await db
    .from("members")
    .select("*")
    .ilike("tax_code", target)
    .maybeSingle();

  return data;
}

async function findMemberByEmail(db: Db, email: string): Promise<MemberRow | null> {
  const target = String(email || "").toLowerCase().trim();
  if (!target) return null;

  // Stessa tabella: include le bozze (is_enrollment_draft), nessun filtro.
  const { data } = await db
    .from("members")
    .select("*")
    .ilike("email", target)
    .maybeSingle();

  return data;
}

async function findMemberByIdentifier(
  db: Db,
  identifier: string,
): Promise<MemberRow | null> {
  const id = String(identifier || "").trim();
  if (!id) return null;
  if (id.includes("@")) return findMemberByEmail(db, id);
  if (id.length >= 11) return findMemberByCf(db, id);
  return null;
}

async function hasQuotaPaidForMember(
  db: Db,
  memberId: string,
): Promise<boolean> {
  const id = String(memberId || "").trim();
  if (!id) return false;

  const anno = currentFiscalYear();
  const { data: quota } = await db
    .from("member_annual_quotas")
    .select("paid_at")
    .eq("member_id", id)
    .eq("fiscal_year", anno)
    .maybeSingle();

  return !!quota?.paid_at;
}

async function hasQuotaPaidThisYear(db: Db, cf: string): Promise<boolean> {
  const target = String(cf || "").toUpperCase().trim();
  if (!target) return false;

  const anno = currentFiscalYear();

  const { data: enrollments } = await db
    .from("enrollments")
    .select("payment_status")
    .eq("fiscal_year", anno)
    .ilike("tax_code", target);

  if (
    enrollments?.some((row) => isPaidStatus(row.payment_status))
  ) {
    return true;
  }

  const member = await findMemberByCf(db, target);
  if (!member) return false;

  return hasQuotaPaidForMember(db, member.id);
}

async function findMemberById(
  db: Db,
  memberId: string,
): Promise<MemberRow | null> {
  const id = String(memberId || "").trim();
  if (!id) return null;

  const { data } = await db
    .from("members")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return data;
}

async function getEnrollmentById(
  db: Db,
  idIscrizione: string,
): Promise<EnrollmentRow | null> {
  const id = String(idIscrizione || "").trim();
  if (!id) return null;

  const { data: byId } = await db
    .from("enrollments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (byId) return byId;

  const { data: byLegacy } = await db
    .from("enrollments")
    .select("*")
    .eq("legacy_enrollment_id", id)
    .maybeSingle();

  return byLegacy;
}

export async function getStatoIscrizione(idIscrizione: string) {
  const db = createServiceRoleClient();
  const rec = await getEnrollmentById(db, idIscrizione);
  if (!rec) return { found: false as const };

  const storagePath = String(rec.pdf_storage_path || "").trim();
  const inviata =
    !!String(rec.pdf_url || "").trim() ||
    !!storagePath ||
    rec.confirmation_email_sent;
  const pagato = isPaidStatus(rec.payment_status);
  // pdf_storage_path is durable; pdfUrl is a fresh signed/public URL when path exists.
  const pdfUrl = await resolveEnrollmentPdfUrl(db, rec);

  return {
    found: true as const,
    idIscrizione: rec.legacy_enrollment_id || rec.id,
    pagamentoStato: rec.payment_status,
    pagato,
    inviata,
    nome: rec.first_name,
    cognome: rec.last_name,
    importoCentesimi: rec.amount_centesimi,
    pdfUrl,
    checkoutUrl: pagato ? "" : String(rec.payment_link_url || "").trim(),
  };
}

async function markEnrollmentPaid(
  db: Db,
  enrollmentId: string,
  piId?: string,
) {
  await db
    .from("enrollments")
    .update({
      payment_status: "PAGATO",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: piId
        ? String(piId).substring(0, 64)
        : undefined,
    })
    .eq("id", enrollmentId);
}

async function tryCompletaInvioAfterPaid(idIscrizione: string): Promise<{
  inviata: boolean;
  invioInCorso?: boolean;
  invioError?: string;
}> {
  try {
    const result = await completaInvioIscrizione(idIscrizione);
    const already =
      "alreadySent" in result && Boolean(result.alreadySent);
    const queued =
      ("queued" in result && Boolean(result.queued)) ||
      ("inProgress" in result && Boolean(result.inProgress));
    return {
      inviata: Boolean(already || (result.success && !queued)),
      invioInCorso: queued,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sincronizzaPagamento] completaInvio:", message);
    return { inviata: false, invioError: message };
  }
}

export async function sincronizzaPagamento(idIscrizione: string) {
  const db = createServiceRoleClient();
  const stato = await getStatoIscrizione(idIscrizione);

  if (!stato.found) {
    return { found: false, pagato: false };
  }

  if (stato.pagato) {
    const invio = stato.inviata
      ? { inviata: true as const }
      : await tryCompletaInvioAfterPaid(idIscrizione);
    const updated = await getStatoIscrizione(idIscrizione);
    return {
      ...updated,
      pagato: true,
      already: true,
      idIscrizione,
      inviata: Boolean(updated.inviata || invio.inviata),
      invioInCorso: invio.invioInCorso,
      invioError: "invioError" in invio ? invio.invioError : undefined,
    };
  }

  const rec = await getEnrollmentById(db, idIscrizione);
  if (!rec) return { found: false, pagato: false };

  const plId = String(rec.payment_link_id || "").trim();
  if (!plId) {
    return {
      ...stato,
      pagato: false,
      idIscrizione,
      message: "Payment Link non trovato.",
    };
  }

  try {
    const cfg = getStripeConfig();
    const sync = await syncStripePaymentForEnrollment(
      cfg,
      rec.legacy_enrollment_id || rec.id,
      plId,
    );

    if (sync.pagato) {
      await markEnrollmentPaid(db, rec.id, sync.piId);
      const invio = await tryCompletaInvioAfterPaid(idIscrizione);
      const updated = await getStatoIscrizione(idIscrizione);
      return {
        ...updated,
        pagato: true,
        synced: true,
        idIscrizione,
        inviata: Boolean(updated.inviata || invio.inviata),
        invioInCorso: invio.invioInCorso,
        invioError: "invioError" in invio ? invio.invioError : undefined,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...stato, pagato: false, idIscrizione, message };
  }

  return { ...stato, pagato: false, idIscrizione };
}

async function storeMagicToken(
  db: Db,
  email: string,
  options?: {
    ttlMs?: number;
    memberId?: string;
    cashQuotaPaid?: boolean;
  },
): Promise<string> {
  const token = randomUUID();
  const ttl = options?.ttlMs ?? MAGIC_LINK_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  const payload: MagicTokenInfo = {
    email: String(email || "").trim().toLowerCase(),
    expiresAt,
    usedAt: null,
  };
  if (options?.memberId) payload.memberId = options.memberId;
  if (options?.cashQuotaPaid) payload.cashQuotaPaid = true;

  await db.from("app_settings").upsert({
    key: `${TOKEN_KEY_PREFIX}${token}`,
    value: JSON.stringify(payload),
    description: "Magic link iscrizione associato",
  });

  return token;
}

function magicLinkBaseUrl(): string {
  return (process.env.STRIPE_RETURN_URL || "https://iscrizione.musicproeventi.it/")
    .trim()
    .replace(/[?&].*$/, "")
    .replace(/\/?$/, "/");
}

function iscrizioneLinkFromToken(token: string): string {
  return `${magicLinkBaseUrl()}?iscrizioneToken=${encodeURIComponent(token)}`;
}

/** Full iscrizione URL. Default TTL 24h (rinnovo); pass ttlMs for prova (30g). */
export async function createIscrizioneMagicLink(
  db: Db,
  email: string,
  ttlMs?: number,
  memberId?: string,
): Promise<string> {
  const token = await storeMagicToken(db, email, { ttlMs, memberId });
  return iscrizioneLinkFromToken(token);
}

async function sendMagicLinkEmail(
  email: string,
  link: string,
  nome: string,
  variant: "default" | "cash" = "default",
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() ||
    process.env.BOOKING_EMAIL_FROM?.trim() ||
    "MusicPro School <noreply@school.musicproeventi.it>";

  const subject =
    variant === "cash"
      ? "Completa l'iscrizione MusicPro (quota già versata)"
      : "Il tuo link per l'iscrizione MusicPro";

  const body =
    variant === "cash"
      ? [
          `Ciao ${nome},`,
          "",
          "Hai già versato la quota associativa in sede.",
          "Usa questo link per inserire i dati mancanti e firmare l'iscrizione:",
          link,
          "",
          "Il link è valido 24 ore e può essere usato una sola volta.",
          "",
          "Se non hai richiesto tu questo messaggio, puoi ignorarlo.",
          "",
          "MusicPro School",
        ].join("\n")
      : [
          `Ciao ${nome},`,
          "",
          "Usa questo link per aggiornare i dati e completare l'iscrizione:",
          link,
          "",
          "Se non hai richiesto tu questo messaggio, puoi ignorarlo.",
          "",
          "MusicPro School",
        ].join("\n");

  if (!apiKey) {
    console.warn(
      `[iscrizione] RESEND_API_KEY assente: magic link non inviato a ${email} (${nome}): ${link}`,
    );
    return {
      sent: false,
      error: "RESEND_API_KEY assente su Vercel",
    };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      text: body,
      html: body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/\r\n|\r|\n/g, "<br />"),
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error(
      `[iscrizione] Resend ${res.status} inviando magic link a ${email}: ${errBody.slice(0, 400)}`,
    );
    return {
      sent: false,
      error: `Resend HTTP ${res.status}`,
    };
  }

  return { sent: true };
}

async function notifyAdminCashEnrollmentCompleted(input: {
  nome: string;
  cognome: string;
  email: string;
  cf: string;
  memberId: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return;

  const from =
    process.env.EMAIL_FROM?.trim() ||
    process.env.BOOKING_EMAIL_FROM?.trim() ||
    "MusicPro School <noreply@school.musicproeventi.it>";
  const toRaw =
    process.env.EMAIL_SEGRETERIA?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "musicproeventi@gmail.com";
  const recipients = toRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!recipients.length) return;

  const subject = `ISCRIZIONE CONTANTI: ${input.cognome} ${input.nome}`;
  const text = [
    "Nuova iscrizione completata (quota già versata in sede).",
    `Nome: ${input.nome} ${input.cognome}`,
    `Email: ${input.email}`,
    `CF: ${input.cf}`,
    `Member ID: ${input.memberId}`,
    "",
    "Il socio ha compilato e firmato il modulo online.",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        text,
        html: text.replace(/\r\n|\r|\n/g, "<br />"),
      }),
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Controlli anagrafici condivisi (form contanti / rinnovo / nuova iscrizione). */
export function validateEnrollmentAnagrafica(data: EnrollmentFormData): string | null {
  const nome = formText(data.nome);
  const cognome = formText(data.cognome);
  const cf = formText(data.cf).toUpperCase();
  const email = formText(data.email).toLowerCase();
  const telefono = formText(data.telefono).replace(/[\s().-]/g, "");
  const cap = formText(data.cap);
  const prov = formText(data.prov).toUpperCase();
  const provNascita = formText(data.prov_nascita).toUpperCase();
  const dataNascita = formText(data.data_nascita).substring(0, 10);
  const luogo = formText(data.luogo_nascita);
  const indirizzo = formText(data.indirizzo);
  const citta = formText(data.citta);

  if (!nome || !cognome) return "Nome e cognome obbligatori.";
  if (!luogo) return "Luogo di nascita obbligatorio.";
  if (!/^[A-Z]{2}$/.test(provNascita)) {
    return "Provincia di nascita: inserisci 2 lettere (es. GE).";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascita)) {
    return "Data di nascita non valida.";
  }
  const born = new Date(`${dataNascita}T12:00:00`);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (Number.isNaN(born.getTime()) || born > today) {
    return "La data di nascita non può essere nel futuro.";
  }
  const oldest = new Date();
  oldest.setFullYear(oldest.getFullYear() - 120);
  if (born < oldest) {
    return "Data di nascita non plausibile.";
  }

  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) {
    return "Codice fiscale non valido (16 caratteri, formato italiano).";
  }
  if (!indirizzo) return "Indirizzo obbligatorio.";
  if (!/^\d{5}$/.test(cap)) return "CAP non valido (5 cifre).";
  if (!citta) return "Città obbligatoria.";
  if (!/^[A-Z]{2}$/.test(prov)) {
    return "Provincia di residenza: inserisci 2 lettere (es. GE).";
  }
  if (!email || !EMAIL_RE.test(email)) return "Email non valida.";
  const phoneDigits = telefono.replace(/^\+/, "").replace(/\D/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 15) {
    return "Cellulare non valido (almeno 9 cifre).";
  }

  const ageMs = today.getTime() - born.getTime();
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < 18) {
    if (!formText(data.tutore_nome) || !formText(data.tutore_cognome)) {
      return "Per i minorenni sono obbligatori nome e cognome del genitore/tutore.";
    }
    const tutoreCf = formText(data.tutore_cf).toUpperCase();
    if (
      tutoreCf &&
      !/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(
        tutoreCf,
      )
    ) {
      return "Codice fiscale del tutore non valido.";
    }
  }

  return null;
}

async function createAndSendMagicLink(db: Db, member: MemberRow) {
  if (!member.email) return false;
  const link = await createIscrizioneMagicLink(
    db,
    member.email,
    undefined,
    member.id,
  );
  const fields = memberToFormFields(member);
  const tutorNome = String(member.manual_tutor_first_name || "").trim();
  const mail = await sendMagicLinkEmail(
    member.email,
    link,
    tutorNome || String(fields.nome || "Associato"),
  );
  return mail.sent;
}

export async function richiediLinkIscrizioneAssociato(identifier: string) {
  const msg =
    "Se i dati corrispondono a un associato registrato, riceverai via email un link personalizzato entro pochi minuti.";

  try {
    const db = createServiceRoleClient();
    const member = await findMemberByIdentifier(db, identifier);
    if (member?.email) await createAndSendMagicLink(db, member);
  } catch (err) {
    console.error("[richiediLinkIscrizioneAssociato]", err);
  }

  return { success: true, message: msg };
}

function tokenFromForm(data: EnrollmentFormData): string {
  return String(data.iscrizioneToken || data.token || "").trim();
}

function parseMagicTokenValue(raw: string): MagicTokenInfo | null {
  try {
    const parsed = JSON.parse(raw) as MagicTokenInfo;
    if (!parsed?.email || !parsed?.expiresAt) return null;
    return {
      email: String(parsed.email).trim().toLowerCase(),
      expiresAt: String(parsed.expiresAt),
      usedAt: parsed.usedAt ? String(parsed.usedAt) : null,
      memberId: parsed.memberId ? String(parsed.memberId) : null,
      cashQuotaPaid: Boolean(parsed.cashQuotaPaid),
    };
  } catch {
    return null;
  }
}

async function loadMagicToken(
  db: Db,
  token: string,
): Promise<{ key: string; info: MagicTokenInfo } | null> {
  const tok = String(token || "").trim();
  if (!tok) return null;

  const key = `${TOKEN_KEY_PREFIX}${tok}`;
  const { data: setting } = await db
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (!setting?.value) return null;
  const info = parseMagicTokenValue(setting.value);
  if (!info) return null;
  return { key, info };
}

function isMagicTokenUsable(info: MagicTokenInfo): boolean {
  if (info.usedAt) return false;
  return new Date() <= new Date(info.expiresAt);
}

async function resolveMemberFromTokenInfo(
  db: Db,
  info: MagicTokenInfo,
): Promise<MemberRow | null> {
  if (info.memberId) {
    const byId = await findMemberById(db, info.memberId);
    if (byId) return byId;
  }
  return findMemberByEmail(db, info.email);
}

async function memberFromIscrizioneToken(
  db: Db,
  token: string,
): Promise<MemberRow | null> {
  const loaded = await loadMagicToken(db, token);
  if (!loaded || !isMagicTokenUsable(loaded.info)) return null;
  return resolveMemberFromTokenInfo(db, loaded.info);
}

async function markMagicTokenUsed(db: Db, token: string): Promise<void> {
  const loaded = await loadMagicToken(db, token);
  if (!loaded) return;

  const next: MagicTokenInfo = {
    ...loaded.info,
    usedAt: new Date().toISOString(),
  };

  await db
    .from("app_settings")
    .update({ value: JSON.stringify(next) })
    .eq("key", loaded.key);
}

/**
 * formAccessToken: random secret legato all'enrollment in app_settings.
 * Il client lo tiene in sessionStorage e lo passa a getDatiIscrizionePerForm;
 * senza match → { found: false } (niente leak di fields/signature).
 */
async function issueFormAccessToken(
  db: Db,
  enrollmentId: string,
): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + FORM_ACCESS_TTL_MS).toISOString();
  await db.from("app_settings").upsert({
    key: `${FORM_ACCESS_KEY_PREFIX}${enrollmentId}`,
    value: JSON.stringify({ token, expiresAt }),
    description: "Access token ripristino form iscrizione post-pagamento",
  });
  return token;
}

async function verifyFormAccessToken(
  db: Db,
  enrollmentId: string,
  token: string,
): Promise<boolean> {
  const tok = String(token || "").trim();
  const id = String(enrollmentId || "").trim();
  if (!tok || !id) return false;

  const { data: setting } = await db
    .from("app_settings")
    .select("value")
    .eq("key", `${FORM_ACCESS_KEY_PREFIX}${id}`)
    .maybeSingle();
  if (!setting?.value) return false;

  try {
    const parsed = JSON.parse(String(setting.value)) as {
      token?: string;
      expiresAt?: string;
    };
    if (!parsed.token || parsed.token !== tok) return false;
    if (parsed.expiresAt && new Date() > new Date(parsed.expiresAt)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function validateIscrizioneToken(token: string) {
  const tok = String(token || "").trim();
  if (!tok) return { found: false, message: "Token mancante." };

  const db = createServiceRoleClient();
  const loaded = await loadMagicToken(db, tok);
  if (!loaded) {
    return { found: false, message: "Link non valido o scaduto." };
  }
  if (loaded.info.usedAt) {
    return { found: false, message: "Questo link è già stato utilizzato." };
  }
  if (!isMagicTokenUsable(loaded.info)) {
    return { found: false, message: "Link non valido o scaduto." };
  }

  const member = await resolveMemberFromTokenInfo(db, loaded.info);
  if (!member) {
    return { found: false, message: "Link non valido o scaduto." };
  }

  const fields = memberToFormFields(member);
  const quotaByMember = await hasQuotaPaidForMember(db, member.id);
  const quotaByCf = await hasQuotaPaidThisYear(db, String(fields.cf || ""));
  const quotaGiaPagata =
    Boolean(loaded.info.cashQuotaPaid) || quotaByMember || quotaByCf;

  return {
    found: true,
    rinnovo: true,
    quotaGiaPagata,
    nome: fields.nome,
    cognome: fields.cognome,
    fields,
    privacyAccepted: true,
    photoAccepted: Boolean(member.photo_consent),
  };
}

async function findOrCreateCashEnrollmentMember(
  db: Db,
  nome: string,
  cognome: string,
  email: string,
): Promise<{ member: MemberRow; reusedEmail: boolean; previousName: string }> {
  const existing = await findMemberByEmail(db, email);
  if (existing) {
    const previousName = [
      String(existing.first_name || "").trim(),
      String(existing.last_name || "").trim(),
    ]
      .filter(Boolean)
      .join(" ");
    // Sportello: nome/cognome digitati dall'admin vincono sempre sull'anagrafica
    // legata a questa email (prima soft-patch lasciava il vecchio nome → link “bloccati”).
    const patch: Database["public"]["Tables"]["members"]["Update"] = {
      first_name: nome || existing.first_name,
      last_name: cognome || existing.last_name,
    };
    if (existing.is_enrollment_draft) {
      patch.draft_expires_at = new Date(
        Date.now() + MAGIC_LINK_TTL_MS,
      ).toISOString();
    }
    const { data, error } = await db
      .from("members")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(
        error?.message || "Impossibile aggiornare l'associato per lo sportello.",
      );
    }
    return { member: data, reusedEmail: true, previousName };
  }

  const { data, error } = await db
    .from("members")
    .insert({
      first_name: nome,
      last_name: cognome,
      email,
      is_enrollment_draft: true,
      member_number: null,
      draft_expires_at: new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString(),
      is_active: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Impossibile creare la bozza associato.");
  }

  return { member: data, reusedEmail: false, previousName: "" };
}

function memberPatchFromForm(
  data: EnrollmentFormData,
): Database["public"]["Tables"]["members"]["Update"] {
  const cf = formText(data.cf).toUpperCase();
  const patch: Database["public"]["Tables"]["members"]["Update"] = {
    first_name: formText(data.nome),
    last_name: formText(data.cognome),
    birth_place: formText(data.luogo_nascita) || null,
    birth_province: formText(data.prov_nascita).toUpperCase() || null,
    address_street: formText(data.indirizzo) || null,
    address_postal_code: formText(data.cap) || null,
    address_city: formText(data.citta) || null,
    address_province: formText(data.prov).toUpperCase() || null,
    tax_code: cf || null,
    phone: formText(data.telefono) || null,
    email: formText(data.email).toLowerCase() || null,
    manual_tutor_first_name: formText(data.tutore_nome) || null,
    manual_tutor_last_name: formText(data.tutore_cognome) || null,
    manual_tutor_phone: formText(data.tutore_telefono) || null,
    manual_tutor_email: formText(data.tutore_email) || null,
    manual_tutor_tax_code: formText(data.tutore_cf).toUpperCase() || null,
    ...photoConsentPatch(photoConsentFromForm(data)),
  };
  const dataNascita = formText(data.data_nascita);
  if (dataNascita) {
    patch.birth_date = dataNascita.substring(0, 10);
  }
  return patch;
}

/**
 * Bozza members per nuova iscrizione (senza magic link).
 * Necessaria perché apply_stripe_quota_payment richiede member_id sull'enrollment.
 */
async function findOrCreateEnrollmentDraftMember(
  db: Db,
  data: EnrollmentFormData,
): Promise<MemberRow> {
  const nome = formText(data.nome);
  const cognome = formText(data.cognome);
  const email = formText(data.email).toLowerCase();
  const cf = formText(data.cf).toUpperCase();
  const draftExpires = new Date(
    Date.now() + ENROLLMENT_DRAFT_TTL_MS,
  ).toISOString();
  const formPatch = memberPatchFromForm(data);

  const byCf = cf ? await findMemberByCf(db, cf) : null;
  if (byCf) {
    const existing = byCf;
    if (existing.is_enrollment_draft) {
      const { data: updated, error } = await db
        .from("members")
        .update({
          ...formPatch,
          is_enrollment_draft: true,
          draft_expires_at: draftExpires,
          member_number: null,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error || !updated) {
        throw new Error(
          error?.message || "Impossibile aggiornare la bozza associato.",
        );
      }
      return updated;
    }

    // Stesso CF già in anagrafe: collega senza sovrascrivere (completaInvio dopo PAGATO).
    const soft: Database["public"]["Tables"]["members"]["Update"] = {
      ...photoConsentPatch(photoConsentFromForm(data)),
    };
    if (!String(existing.first_name || "").trim() && nome) soft.first_name = nome;
    if (!String(existing.last_name || "").trim() && cognome) {
      soft.last_name = cognome;
    }
    if (!String(existing.email || "").trim() && email) soft.email = email;
    if (!String(existing.phone || "").trim() && formText(data.telefono)) {
      soft.phone = formText(data.telefono);
    }

    const { data: updated, error } = await db
      .from("members")
      .update(soft)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !updated) {
      throw new Error(
        error?.message || "Impossibile aggiornare l'associato.",
      );
    }
    return updated;
  }

  // Mai collegare per sola email a un socio pieno (CF diverso): rischio quota sul member sbagliato.
  const byEmail = email ? await findMemberByEmail(db, email) : null;
  if (byEmail && !byEmail.is_enrollment_draft) {
    const existingCf = String(byEmail.tax_code || "").toUpperCase().trim();
    if (existingCf && existingCf !== cf) {
      throw new Error(
        "Questa email risulta già usata da un altro associato. Usa un'email diversa oppure richiedi il link personalizzato.",
      );
    }
  }
  if (byEmail?.is_enrollment_draft) {
    const { data: updated, error } = await db
      .from("members")
      .update({
        ...formPatch,
        is_enrollment_draft: true,
        draft_expires_at: draftExpires,
        member_number: null,
      })
      .eq("id", byEmail.id)
      .select("*")
      .single();
    if (error || !updated) {
      throw new Error(
        error?.message || "Impossibile aggiornare la bozza associato.",
      );
    }
    return updated;
  }

  const { data: inserted, error } = await db
    .from("members")
    .insert({
      ...formPatch,
      first_name: nome,
      last_name: cognome,
      email: email || null,
      is_enrollment_draft: true,
      member_number: null,
      draft_expires_at: draftExpires,
      is_active: true,
      gdpr_consent: isFormFlagTrue(data.privacy_accepted),
      gdpr_consent_at: isFormFlagTrue(data.privacy_accepted)
        ? new Date().toISOString()
        : null,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || "Impossibile creare la bozza associato.");
  }

  return inserted;
}

async function markCashQuotaPaid(db: Db, memberId: string): Promise<void> {
  const anno = currentFiscalYear();
  const settings = await listAnnualQuotaSettings(db);
  const setting = settings.find((row) => row.fiscalYear === anno);
  const amountEur =
    setting?.amountEur ?? QUOTA_ASSOCIATIVA_CENTESIMI / 100;
  const paidAt = new Date().toISOString().slice(0, 10);

  const result = await upsertMemberAnnualQuotas(db, [
    {
      memberId,
      fiscalYear: anno,
      paidAt,
      amountPaidEur: amountEur,
      amountDueEur: amountEur,
      notes: "contanti",
    },
  ]);

  if (!result.success) {
    throw new Error(result.errorMessage || "Impossibile registrare la quota.");
  }
}

/** Sportello: nome/cognome/email → quota contanti + magic link 24h. */
export async function creaIscrizioneContantiEInvia(input: {
  nome: string;
  cognome: string;
  email: string;
}): Promise<{
  success: boolean;
  link?: string;
  emailSent?: boolean;
  emailError?: string;
  memberId?: string;
  message?: string;
  warning?: string;
  memberName?: string;
}> {
  const nome = formText(input.nome);
  const cognome = formText(input.cognome);
  const email = formText(input.email).toLowerCase();

  if (!nome || !cognome) {
    return { success: false, message: "Nome e cognome obbligatori." };
  }
  if (!email || !EMAIL_RE.test(email)) {
    return { success: false, message: "Email non valida." };
  }

  const db = createServiceRoleClient();
  const created = await findOrCreateCashEnrollmentMember(
    db,
    nome,
    cognome,
    email,
  );
  const member = created.member;

  await markCashQuotaPaid(db, member.id);

  const token = await storeMagicToken(db, email, {
    memberId: member.id,
    cashQuotaPaid: true,
  });
  const link = iscrizioneLinkFromToken(token);
  const greeting =
    String(member.first_name || "").trim() || nome || "Associato";
  const mail = await sendMagicLinkEmail(email, link, greeting, "cash");

  const newName = `${nome} ${cognome}`.trim();
  let warning: string | undefined;
  if (
    created.reusedEmail &&
    created.previousName &&
    created.previousName.toLowerCase() !== newName.toLowerCase()
  ) {
    warning = `Questa email era già collegata a «${created.previousName}»: anagrafica aggiornata a «${newName}». Usa un'email diversa per ogni persona.`;
  }

  return {
    success: true,
    link,
    emailSent: mail.sent,
    emailError: mail.error,
    memberId: member.id,
    memberName: greeting,
    warning,
  };
}

async function valutaDuplicatoIscrizione(
  db: Db,
  data: EnrollmentFormData,
): Promise<{ blocked: boolean; code?: string; message?: string }> {
  const cf = String(data.cf || "").toUpperCase().trim();

  if (await hasQuotaPaidThisYear(db, cf)) {
    return {
      blocked: true,
      code: "QUOTA_GIA_PAGATA",
      message:
        "La quota associativa risulta già pagata per quest'anno. Controlla la email o scrivi a musicproeventi@gmail.com.",
    };
  }

  if (isRinnovo(data)) return { blocked: false };

  const tokenMember = await memberFromIscrizioneToken(db, tokenFromForm(data));
  if (tokenMember) return { blocked: false };

  const member = await findMemberByCf(db, cf);
  if (member) {
    try {
      await createAndSendMagicLink(db, member);
    } catch (mailErr) {
      console.error("[valutaDuplicatoIscrizione] magic link:", mailErr);
    }
    return {
      blocked: true,
      code: "GIA_ASSOCIATO",
      message:
        "Questo codice fiscale risulta già registrato. Ti abbiamo inviato un link personalizzato via email per aggiornare i dati e pagare la quota.",
    };
  }

  return { blocked: false };
}

async function findPendingEnrollmentByCf(
  db: Db,
  cf: string,
): Promise<EnrollmentRow | null> {
  const target = String(cf || "").toUpperCase().trim();
  if (!target) return null;

  const { data } = await db
    .from("enrollments")
    .select("*")
    .eq("tax_code", target)
    .neq("payment_status", "PAGATO")
    .order("created_at", { ascending: false })
    .limit(1);

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Bozza enrollment + Payment Link + member draft (per webhook quota).
 * Non chiude la bozza né invia email finché payment_status !== PAGATO.
 * Riusa bozza non pagata (id o stesso CF) per ritentare senza rifare il form.
 */
export async function inviaIscrizioneConPagamento(data: EnrollmentFormData) {
  const anagErr = validateEnrollmentAnagrafica(data);
  if (anagErr) {
    throw new Error(anagErr);
  }
  if (!data.signatureData) {
    throw new Error("Firma digitale obbligatoria.");
  }

  const db = createServiceRoleClient();
  const tokenMember = await memberFromIscrizioneToken(db, tokenFromForm(data));
  const dup = await valutaDuplicatoIscrizione(db, data);
  if (dup.blocked) {
    return { success: false, code: dup.code, message: dup.message };
  }

  // Nuova iscrizione: crea/riusa bozza members così apply_stripe_quota_payment ha member_id.
  const member =
    tokenMember ?? (await findOrCreateEnrollmentDraftMember(db, data));

  if (tokenMember) {
    const { error: photoErr } = await db
      .from("members")
      .update(photoConsentPatch(photoConsentFromForm(data)))
      .eq("id", tokenMember.id);
    if (photoErr) {
      throw new Error(
        photoErr.message || "Impossibile aggiornare il consenso foto.",
      );
    }
  }

  const anno = currentFiscalYear();
  const importoCents = QUOTA_ASSOCIATIVA_CENTESIMI;
  const cf = String(data.cf || "").toUpperCase().trim();
  const payload = {
    ...data,
    metodo_pagamento: "Stripe",
  };

  const resumeId = String(data.idIscrizione || data.id || "").trim();
  let pending =
    (resumeId ? await getEnrollmentById(db, resumeId) : null) ||
    (await findPendingEnrollmentByCf(db, cf));

  if (pending && isPaidStatus(pending.payment_status)) {
    pending = null;
  }

  if (pending) {
    const idIscrizione = pending.legacy_enrollment_id || pending.id;
    const existingUrl = String(pending.payment_link_url || "").trim();
    const existingStato = String(pending.payment_status || "")
      .toUpperCase()
      .trim();

    await db
      .from("enrollments")
      .update({
        first_name: String(data.nome || "").trim(),
        last_name: String(data.cognome || "").trim(),
        email: String(data.email || "").trim(),
        tax_code: cf,
        phone: String(data.telefono || "").trim(),
        fiscal_year: anno,
        amount_centesimi: importoCents,
        member_id: member.id,
        form_payload:
          payload as Database["public"]["Tables"]["enrollments"]["Insert"]["form_payload"],
      })
      .eq("id", pending.id);

    if (existingUrl && existingStato !== "ERRORE") {
      await db
        .from("enrollments")
        .update({ payment_status: "INVIATO" })
        .eq("id", pending.id);
      const formAccessToken = await issueFormAccessToken(db, pending.id);
      return {
        success: true,
        idIscrizione,
        checkoutUrl: existingUrl,
        reused: true,
        memberId: member.id,
        formAccessToken,
      };
    }

    const linkResReuse = await createStripePaymentLinkQuotaAssociativa({
      idIscrizione,
      memberId: member.id,
      nome: String(data.nome || ""),
      cognome: String(data.cognome || ""),
      importoCentesimi: importoCents,
      annoSocietario: anno,
      idempotencyKey: `iscrizione_retry_${idIscrizione}_${Date.now()}`,
    });

    if (!linkResReuse.success || !linkResReuse.url) {
      await db
        .from("enrollments")
        .update({ payment_status: "ERRORE" })
        .eq("id", pending.id);
      throw new Error(
        linkResReuse.message ||
          "Impossibile creare il link di pagamento Stripe.",
      );
    }

    await db
      .from("enrollments")
      .update({
        payment_status: "INVIATO",
        payment_link_url: linkResReuse.url,
        payment_link_id: linkResReuse.stripeId || null,
        payment_total_centesimi: linkResReuse.totaleCents || importoCents,
      })
      .eq("id", pending.id);

    const formAccessTokenReuse = await issueFormAccessToken(db, pending.id);
    return {
      success: true,
      idIscrizione,
      checkoutUrl: linkResReuse.url,
      reused: true,
      memberId: member.id,
      formAccessToken: formAccessTokenReuse,
    };
  }

  const idIscrizione = randomUUID();

  const { data: inserted, error: insertErr } = await db
    .from("enrollments")
    .insert({
      id: idIscrizione,
      legacy_enrollment_id: idIscrizione,
      member_id: member.id,
      first_name: String(data.nome || "").trim(),
      last_name: String(data.cognome || "").trim(),
      email: String(data.email || "").trim(),
      tax_code: cf,
      phone: String(data.telefono || "").trim(),
      fiscal_year: anno,
      amount_centesimi: importoCents,
      payment_status: "PENDING",
      form_payload:
        payload as Database["public"]["Tables"]["enrollments"]["Insert"]["form_payload"],
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || "Impossibile salvare l'iscrizione.");
  }

  const linkRes = await createStripePaymentLinkQuotaAssociativa({
    idIscrizione,
    memberId: member.id,
    nome: String(data.nome || ""),
    cognome: String(data.cognome || ""),
    importoCentesimi: importoCents,
    annoSocietario: anno,
    idempotencyKey: `iscrizione_${idIscrizione}`,
  });

  if (!linkRes.success || !linkRes.url) {
    await db
      .from("enrollments")
      .update({ payment_status: "ERRORE" })
      .eq("id", idIscrizione);
    throw new Error(
      linkRes.message || "Impossibile creare il link di pagamento Stripe.",
    );
  }

  await db
    .from("enrollments")
    .update({
      payment_status: "INVIATO",
      payment_link_url: linkRes.url,
      payment_link_id: linkRes.stripeId || null,
      payment_total_centesimi: linkRes.totaleCents || importoCents,
    })
    .eq("id", idIscrizione);

  const formAccessToken = await issueFormAccessToken(db, idIscrizione);
  return {
    success: true,
    idIscrizione,
    checkoutUrl: linkRes.url,
    reused: false,
    memberId: member.id,
    formAccessToken,
  };
}

function parseEnrollmentFormPayload(
  payload: EnrollmentRow["form_payload"],
): EnrollmentFormData {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  return payload as EnrollmentFormData;
}

function segreteriaRecipients(): string[] {
  const toRaw =
    process.env.EMAIL_SEGRETERIA?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "musicproeventi@gmail.com";
  return toRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resendFromAddress(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.BOOKING_EMAIL_FROM?.trim() ||
    "MusicPro School <noreply@school.musicproeventi.it>"
  );
}

async function sendResendEmail(params: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    content_type?: string;
  }>;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY assente" };
  }
  if (!params.to.length) {
    return { sent: false, error: "Nessun destinatario" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: resendFromAddress(),
        to: params.to,
        subject: params.subject,
        text: params.text,
        html:
          params.html ||
          params.text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/\r\n|\r|\n/g, "<br />"),
        attachments: params.attachments?.length
          ? params.attachments
          : undefined,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return {
        sent: false,
        error: `Resend HTTP ${res.status}: ${errBody.slice(0, 200)}`,
      };
    }
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function ensureEnrollmentPdfBucket(db: Db): Promise<string | null> {
  const { data: buckets, error: listError } = await db.storage.listBuckets();
  if (listError) return listError.message;

  if ((buckets ?? []).some((b) => b.id === ENROLLMENTS_STORAGE_BUCKET)) {
    return null;
  }

  const { error } = await db.storage.createBucket(ENROLLMENTS_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf"],
  });
  if (error && !/already exists/i.test(error.message)) {
    return error.message;
  }
  return null;
}

async function isEnrollmentBucketPublic(db: Db): Promise<boolean> {
  const { data: buckets } = await db.storage.listBuckets();
  const bucket = (buckets ?? []).find(
    (b) => b.id === ENROLLMENTS_STORAGE_BUCKET || b.name === ENROLLMENTS_STORAGE_BUCKET,
  );
  return Boolean(bucket?.public);
}

/**
 * Create a download URL from a storage path.
 * Public bucket → public URL; private → fresh signed URL (TTL below; not DB truth).
 */
export async function getEnrollmentPdfUrl(
  storagePath: string,
  client?: Db,
): Promise<string | null> {
  const path = String(storagePath || "").trim();
  if (!path) return null;

  const db = client ?? createServiceRoleClient();
  if (await isEnrollmentBucketPublic(db)) {
    const { data: pub } = db.storage
      .from(ENROLLMENTS_STORAGE_BUCKET)
      .getPublicUrl(path);
    return pub.publicUrl || null;
  }

  const { data: signed, error } = await db.storage
    .from(ENROLLMENTS_STORAGE_BUCKET)
    .createSignedUrl(path, ENROLLMENT_PDF_SIGNED_URL_TTL_SEC);
  if (error) {
    console.warn(`[iscrizione] signed pdf url: ${error.message}`);
    return null;
  }
  return signed?.signedUrl || null;
}

/**
 * Prefer pdf_storage_path (durable); mint a fresh signed/public URL on read.
 * Falls back to stored pdf_url for legacy rows without a path.
 */
export async function resolveEnrollmentPdfUrl(
  db: Db,
  row: EnrollmentPdfFields,
): Promise<string> {
  const storagePath = String(row.pdf_storage_path || "").trim();
  if (storagePath) {
    const fresh = await getEnrollmentPdfUrl(storagePath, db);
    if (fresh) return fresh;
  }
  return String(row.pdf_url || "").trim();
}

async function uploadEnrollmentPdf(
  db: Db,
  enrollmentId: string,
  filename: string,
  bytes: Uint8Array,
): Promise<{ pdfUrl: string | null; storagePath: string | null }> {
  const bucketErr = await ensureEnrollmentPdfBucket(db);
  if (bucketErr) {
    console.warn(`[iscrizione] storage bucket: ${bucketErr}`);
    return { pdfUrl: null, storagePath: null };
  }

  const storagePath = `${currentFiscalYear()}/${enrollmentId}/${filename}`;
  const { error: uploadError } = await db.storage
    .from(ENROLLMENTS_STORAGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) {
    console.warn(`[iscrizione] upload pdf: ${uploadError.message}`);
    return { pdfUrl: null, storagePath: null };
  }

  // storagePath is durable truth in DB; pdfUrl is a fresh link for email / response only.
  const pdfUrl = await getEnrollmentPdfUrl(storagePath, db);
  return { pdfUrl, storagePath };
}

async function promoteMemberAfterPaidEnrollment(
  db: Db,
  enrollment: EnrollmentRow,
  form: EnrollmentFormData,
): Promise<MemberRow> {
  let member: MemberRow | null = enrollment.member_id
    ? await findMemberById(db, enrollment.member_id)
    : null;

  if (!member) {
    member = await findOrCreateEnrollmentDraftMember(db, {
      ...form,
      nome: form.nome || enrollment.first_name,
      cognome: form.cognome || enrollment.last_name,
      email: form.email || enrollment.email,
      cf: form.cf || enrollment.tax_code || "",
      telefono: form.telefono || enrollment.phone || "",
    });
    await db
      .from("enrollments")
      .update({ member_id: member.id })
      .eq("id", enrollment.id);
  }

  const nowIso = new Date().toISOString();
  const patch: Database["public"]["Tables"]["members"]["Update"] = {
    ...memberPatchFromForm({
      ...form,
      nome: form.nome || enrollment.first_name,
      cognome: form.cognome || enrollment.last_name,
      email: form.email || enrollment.email,
      cf: form.cf || enrollment.tax_code || "",
      telefono: form.telefono || enrollment.phone || "",
    }),
    is_enrollment_draft: false,
    draft_expires_at: null,
  };

  if (member.member_number == null) {
    patch.member_number = await getNextMemberNumber(db);
  }
  if (!member.enrolled_at) {
    patch.enrolled_at = nowIso;
  }
  if (!member.gdpr_consent) {
    patch.gdpr_consent = true;
    patch.gdpr_consent_at = nowIso;
  }

  const { data: updated, error } = await db
    .from("members")
    .update(patch)
    .eq("id", member.id)
    .select("*")
    .single();
  if (error || !updated) {
    throw new Error(
      error?.message || "Impossibile aggiornare l'associato dopo il pagamento.",
    );
  }

  // Quota: idempotente se webhook ha già scritto.
  if (!(await hasQuotaPaidForMember(db, updated.id))) {
    try {
      const anno = enrollment.fiscal_year || currentFiscalYear();
      const settings = await listAnnualQuotaSettings(db);
      const setting = settings.find((row) => row.fiscalYear === anno);
      const amountEur =
        setting?.amountEur ??
        (enrollment.amount_centesimi || QUOTA_ASSOCIATIVA_CENTESIMI) / 100;
      const paidAt = new Date().toISOString().slice(0, 10);
      const result = await upsertMemberAnnualQuotas(db, [
        {
          memberId: updated.id,
          fiscalYear: anno,
          paidAt,
          amountPaidEur: amountEur,
          amountDueEur: amountEur,
          notes: "stripe",
        },
      ]);
      if (!result.success) {
        console.error(
          "[completaInvioIscrizione] quota upsert:",
          result.errorMessage,
        );
      }
    } catch (quotaErr) {
      console.error("[completaInvioIscrizione] quota upsert:", quotaErr);
    }
  }

  return updated;
}

/**
 * Dati form salvati prima del pagamento (ripristino pagina iscrizione).
 * Richiede formAccessToken (emesso da inviaIscrizione*) — senza match → found:false.
 */
export async function getDatiIscrizionePerForm(
  idIscrizione: string,
  formAccessToken?: string,
) {
  const db = createServiceRoleClient();
  const rec = await getEnrollmentById(db, idIscrizione);
  if (!rec || !rec.form_payload) return { found: false as const };

  const ok = await verifyFormAccessToken(
    db,
    rec.id,
    String(formAccessToken || ""),
  );
  if (!ok) return { found: false as const };

  try {
    const data = parseEnrollmentFormPayload(rec.form_payload);
    const signatureData = String(data.signatureData || "");
    const fields = { ...data };
    delete fields.signatureData;

    const privacyAccepted =
      isFormFlagTrue(data.privacy_accepted) || Boolean(signatureData);
    const photoAccepted = isFormFlagTrue(data.photo_consent);
    const pagato = isPaidStatus(rec.payment_status);
    const inviata =
      !!String(rec.pdf_url || "").trim() ||
      !!String(rec.pdf_storage_path || "").trim() ||
      rec.confirmation_email_sent;

    return {
      found: true as const,
      idIscrizione: rec.legacy_enrollment_id || rec.id,
      pagato,
      inviata,
      fields,
      signatureData,
      privacyAccepted,
      photoAccepted,
      checkoutUrl: pagato ? "" : String(rec.payment_link_url || "").trim(),
      pagamentoStato: rec.payment_status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { found: false as const, message };
  }
}

export async function completaInvioIscrizione(idIscrizione: string) {
  const db = createServiceRoleClient();
  const rec = await getEnrollmentById(db, idIscrizione);
  if (!rec) throw new Error("Iscrizione non trovata.");

  if (!isPaidStatus(rec.payment_status)) {
    throw new Error(
      "Pagamento non ancora confermato. Attendi qualche secondo e riprova.",
    );
  }

  if (rec.confirmation_email_sent) {
    return {
      success: true,
      alreadySent: true,
      name: rec.first_name,
      pdfUrl: await resolveEnrollmentPdfUrl(db, rec),
    };
  }

  // Claim anti-doppia email (poll paralleli): usa confirmation_email_sent_at come lock.
  const CLAIM_STALE_MS = 2 * 60 * 1000;
  const priorClaimAt = rec.confirmation_email_sent_at
    ? new Date(rec.confirmation_email_sent_at).getTime()
    : 0;
  if (
    priorClaimAt &&
    Date.now() - priorClaimAt < CLAIM_STALE_MS &&
    !rec.confirmation_email_sent
  ) {
    return {
      success: true,
      queued: true,
      inProgress: true,
      name: rec.first_name,
      pdfUrl: await resolveEnrollmentPdfUrl(db, rec),
    };
  }

  const claimIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - CLAIM_STALE_MS).toISOString();

  let claimedId: string | null = null;
  const { data: claimFresh, error: claimFreshErr } = await db
    .from("enrollments")
    .update({ confirmation_email_sent_at: claimIso })
    .eq("id", rec.id)
    .eq("confirmation_email_sent", false)
    .is("confirmation_email_sent_at", null)
    .select("id")
    .maybeSingle();
  if (claimFreshErr) {
    throw new Error(claimFreshErr.message || "Claim invio iscrizione fallito.");
  }
  if (claimFresh?.id) {
    claimedId = claimFresh.id;
  } else {
    const { data: claimStale, error: claimStaleErr } = await db
      .from("enrollments")
      .update({ confirmation_email_sent_at: claimIso })
      .eq("id", rec.id)
      .eq("confirmation_email_sent", false)
      .lt("confirmation_email_sent_at", staleIso)
      .select("id")
      .maybeSingle();
    if (claimStaleErr) {
      throw new Error(
        claimStaleErr.message || "Claim invio iscrizione fallito.",
      );
    }
    if (claimStale?.id) claimedId = claimStale.id;
  }

  if (!claimedId) {
    const again = await getEnrollmentById(db, idIscrizione);
    if (again?.confirmation_email_sent) {
      return {
        success: true,
        alreadySent: true,
        name: again.first_name,
        pdfUrl: await resolveEnrollmentPdfUrl(db, again),
      };
    }
    return {
      success: true,
      queued: true,
      inProgress: true,
      name: rec.first_name,
      pdfUrl: await resolveEnrollmentPdfUrl(db, rec),
    };
  }

  const form = parseEnrollmentFormPayload(rec.form_payload);
  if (!Object.keys(form).length && !rec.email) {
    await db
      .from("enrollments")
      .update({ confirmation_email_sent_at: null })
      .eq("id", rec.id)
      .eq("confirmation_email_sent", false);
    throw new Error("Dati iscrizione mancanti.");
  }

  try {
  const member = await promoteMemberAfterPaidEnrollment(db, rec, form);

  const oggi = new Date().toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Rome",
  });
  const quotaEuro = (rec.amount_centesimi || QUOTA_ASSOCIATIVA_CENTESIMI) / 100;
  const pdf = await generateEnrollmentPdf({
    memberNumber: member.member_number,
    nome: formText(form.nome) || rec.first_name,
    cognome: formText(form.cognome) || rec.last_name,
    luogoNascita: formText(form.luogo_nascita),
    provNascita: formText(form.prov_nascita).toUpperCase(),
    dataNascita: formText(form.data_nascita),
    indirizzo: formText(form.indirizzo),
    cap: formText(form.cap),
    citta: formText(form.citta),
    prov: formText(form.prov).toUpperCase(),
    cf: formText(form.cf || rec.tax_code).toUpperCase(),
    email: formText(form.email) || rec.email,
    telefono: formText(form.telefono) || String(rec.phone || ""),
    corso: formText(form.corso),
    tutoreNome: formText(form.tutore_nome),
    tutoreCognome: formText(form.tutore_cognome),
    tutoreTelefono: formText(form.tutore_telefono),
    tutoreEmail: formText(form.tutore_email),
    tutoreCf: formText(form.tutore_cf).toUpperCase(),
    quotaLabel: `EUR ${quotaEuro.toFixed(2).replace(".", ",")}`,
    dataOggi: oggi,
    signatureData: formText(form.signatureData) || null,
  });

  const stored = await uploadEnrollmentPdf(
    db,
    rec.id,
    pdf.filename,
    pdf.bytes,
  );
  const pdfBase64 = Buffer.from(pdf.bytes).toString("base64");
  const attachment = {
    filename: pdf.filename,
    content: pdfBase64,
    content_type: "application/pdf" as const,
  };

  const socioEmail = (formText(form.email) || rec.email || "").toLowerCase();
  const nome = formText(form.nome) || rec.first_name;
  const cognome = formText(form.cognome) || rec.last_name;

  const socioMail = socioEmail
    ? await sendResendEmail({
        to: [socioEmail],
        subject: `Conferma Iscrizione MusicPro - ${nome} ${cognome}`,
        text: [
          `Ciao ${nome},`,
          "",
          "in allegato trovi la tua domanda di iscrizione firmata.",
          stored.pdfUrl ? `\nCopia online:\n${stored.pdfUrl}\n` : "",
          "Cordiali saluti,",
          "MusicPro Eventi",
        ]
          .filter((line) => line !== "")
          .join("\n"),
        attachments: [attachment],
      })
    : { sent: false, error: "Email socio mancante" };

  const adminPdfLine = stored.pdfUrl
    ? `PDF: ${stored.pdfUrl}`
    : stored.storagePath
      ? `PDF allegato (path interno: ${stored.storagePath}).`
      : "PDF allegato (storage non disponibile).";

  const adminMail = await sendResendEmail({
    to: segreteriaRecipients(),
    subject: `ISCRIZIONE: ${cognome} ${nome}`,
    text: [
      "Nuova iscrizione con pagamento Stripe.",
      `Nome: ${nome} ${cognome}`,
      `Email socio: ${socioEmail || "—"}`,
      `CF: ${formText(form.cf || rec.tax_code).toUpperCase() || "—"}`,
      `N. socio: ${member.member_number ?? "—"}`,
      `Member ID: ${member.id}`,
      adminPdfLine,
    ].join("\n"),
    attachments: [attachment],
  });

  if (!socioMail.sent && !adminMail.sent) {
    throw new Error(
      socioMail.error ||
        adminMail.error ||
        "Invio email iscrizione fallito (socio e segreteria).",
    );
  }

  if (!socioMail.sent) {
    console.error("[completaInvioIscrizione] email socio:", socioMail.error);
  }
  if (!adminMail.sent) {
    console.error("[completaInvioIscrizione] email admin:", adminMail.error);
  }

  // Socio aveva email ma Resend ha fallito: non marcare confirmation_email_sent
  // (altrimenti niente retry). Admin è best-effort. Rilascia claim → poll/webhook ritentano.
  if (socioEmail && !socioMail.sent) {
    await db
      .from("enrollments")
      .update({ confirmation_email_sent_at: null })
      .eq("id", rec.id)
      .eq("confirmation_email_sent", false);
    throw new Error(
      socioMail.error || "Invio email di conferma al socio fallito.",
    );
  }

  const nowIso = new Date().toISOString();
  await db
    .from("enrollments")
    .update({
      // pdf_url: short-lived convenience link; pdf_storage_path is durable truth.
      pdf_url: stored.pdfUrl,
      ...(stored.storagePath
        ? { pdf_storage_path: stored.storagePath }
        : {}),
      confirmation_email_sent: true,
      confirmation_email_sent_at: nowIso,
      member_id: member.id,
      first_name: nome,
      last_name: cognome,
      email: socioEmail || rec.email,
      tax_code: formText(form.cf || rec.tax_code).toUpperCase() || rec.tax_code,
    } as Database["public"]["Tables"]["enrollments"]["Update"])
    .eq("id", rec.id);

  return {
    success: true,
    alreadySent: false,
    queued: false,
    name: nome,
    pdfUrl: stored.pdfUrl || "",
    emailSocioSent: socioMail.sent,
    emailAdminSent: adminMail.sent,
    memberNumber: member.member_number,
  };
  } catch (err) {
    try {
      await db
        .from("enrollments")
        .update({ confirmation_email_sent_at: null })
        .eq("id", rec.id)
        .eq("confirmation_email_sent", false);
    } catch {
      /* ignore release errors */
    }
    throw err;
  }
}

export async function handleGetOp(
  op: string,
  params: { idIscrizione?: string; token?: string },
) {
  if (op === "sincronizzaPagamento") {
    const sync = await sincronizzaPagamento(params.idIscrizione || "");
    const stato = await getStatoIscrizione(params.idIscrizione || "");
    return {
      ...stato,
      ...sync,
      pagato: !!(stato.pagato || sync.pagato),
      inviata: !!(stato.inviata || ("inviata" in sync && sync.inviata)),
    };
  }

  if (op === "validateIscrizioneToken") {
    return validateIscrizioneToken(params.token || "");
  }

  if (op === "getStatoIscrizione") {
    return getStatoIscrizione(params.idIscrizione || "");
  }

  if (op === "getDatiIscrizionePerForm") {
    return getDatiIscrizionePerForm(
      params.idIscrizione || "",
      params.token || "",
    );
  }

  return { success: false, message: `Operazione GET non valida: ${op}` };
}

export async function salvaAggiornamentoAssociatoIscrizione(
  data: EnrollmentFormData,
) {
  if (!isRinnovo(data)) {
    throw new Error("Operazione riservata agli associati già registrati.");
  }
  const anagErr = validateEnrollmentAnagrafica(data);
  if (anagErr) {
    throw new Error(anagErr);
  }
  if (!data.signatureData) {
    throw new Error("Firma digitale obbligatoria.");
  }

  const db = createServiceRoleClient();
  const token = tokenFromForm(data);
  const loaded = token ? await loadMagicToken(db, token) : null;
  if (token && (!loaded || !isMagicTokenUsable(loaded.info))) {
    throw new Error("Link non valido, scaduto o già utilizzato.");
  }

  const tokenMember = loaded
    ? await resolveMemberFromTokenInfo(db, loaded.info)
    : null;
  const member = tokenMember ?? (await findMemberByCf(db, formText(data.cf)));
  if (!member) {
    throw new Error("Associato non trovato in rubrica. Contatta la segreteria.");
  }

  const cf = formText(data.cf).toUpperCase();
  const quotaOk =
    Boolean(loaded?.info.cashQuotaPaid) ||
    (await hasQuotaPaidForMember(db, member.id)) ||
    (await hasQuotaPaidThisYear(db, cf));

  if (!quotaOk) {
    return {
      success: false,
      code: "QUOTA_NON_PAGATA",
      message:
        "La quota associativa per quest'anno non risulta ancora pagata. Procedi al pagamento.",
    };
  }

  const nowIso = new Date().toISOString();
  const patch: Database["public"]["Tables"]["members"]["Update"] = {
    first_name: formText(data.nome),
    last_name: formText(data.cognome),
    birth_place: formText(data.luogo_nascita) || null,
    birth_province: formText(data.prov_nascita).toUpperCase() || null,
    address_street: formText(data.indirizzo) || null,
    address_postal_code: formText(data.cap) || null,
    address_city: formText(data.citta) || null,
    address_province: formText(data.prov).toUpperCase() || null,
    tax_code: cf,
    phone: formText(data.telefono) || null,
    email: formText(data.email) || null,
    manual_tutor_first_name: formText(data.tutore_nome) || null,
    manual_tutor_last_name: formText(data.tutore_cognome) || null,
    manual_tutor_phone: formText(data.tutore_telefono) || null,
    manual_tutor_email: formText(data.tutore_email) || null,
    manual_tutor_tax_code: formText(data.tutore_cf).toUpperCase() || null,
    is_enrollment_draft: false,
    draft_expires_at: null,
    ...photoConsentPatch(photoConsentFromForm(data)),
  };
  if (member.member_number == null) {
    patch.member_number = await getNextMemberNumber(db);
  }
  if (!member.enrolled_at) {
    patch.enrolled_at = nowIso;
  }
  if (!member.gdpr_consent) {
    patch.gdpr_consent = true;
    patch.gdpr_consent_at = nowIso;
  }
  const dataNascita = formText(data.data_nascita);
  if (dataNascita) {
    patch.birth_date = dataNascita.substring(0, 10);
  }

  const { error } = await db.from("members").update(patch).eq("id", member.id);
  if (error) {
    throw new Error(
      error.message || "Impossibile aggiornare i dati dell'associato.",
    );
  }

  if (token) {
    await markMagicTokenUsed(db, token);
  }

  // Non bloccare la risposta su Resend (era la causa del spinner infinito).
  if (loaded?.info.cashQuotaPaid) {
    void notifyAdminCashEnrollmentCompleted({
      nome: formText(data.nome),
      cognome: formText(data.cognome),
      email: formText(data.email) || member.email || "",
      cf,
      memberId: member.id,
    }).catch((notifyErr) => {
      console.error(
        "[salvaAggiornamentoAssociatoIscrizione] notify admin:",
        notifyErr,
      );
    });
  }

  return {
    success: true,
    skipPayment: true,
    message:
      "Dati aggiornati con successo. La quota per quest'anno risulta già pagata.",
    nome: formText(data.nome),
  };
}

export async function handlePostAction(body: Record<string, unknown>) {
  const action = String(body.action || "inviaIscrizione").trim();

  if (action === "completaInvioIscrizione") {
    return completaInvioIscrizione(
      String(body.idIscrizione || body.id || ""),
    );
  }

  if (action === "getDatiIscrizionePerForm") {
    return getDatiIscrizionePerForm(
      String(body.idIscrizione || body.id || ""),
      String(body.token || body.formAccessToken || ""),
    );
  }

  if (action === "richiediLinkIscrizioneAssociato") {
    return richiediLinkIscrizioneAssociato(
      String(body.identifier || body.email || body.cf || ""),
    );
  }

  if (action === "getStatoIscrizione") {
    return getStatoIscrizione(String(body.idIscrizione || body.id || ""));
  }

  if (action === "salvaAggiornamentoAssociatoIscrizione") {
    return salvaAggiornamentoAssociatoIscrizione(body as EnrollmentFormData);
  }

  if (
    action === "inviaIscrizione" ||
    action === "inviaIscrizioneConPagamento"
  ) {
    return inviaIscrizioneConPagamento(body as EnrollmentFormData);
  }

  return inviaIscrizioneConPagamento(body as EnrollmentFormData);
}
