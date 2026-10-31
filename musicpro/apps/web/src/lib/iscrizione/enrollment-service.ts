import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emitFiscalReceiptForQuotaPayment,
  getNextMemberNumber,
  grantMemberRole,
  isMemberQuotaPaidForYear,
  listAnnualQuotaSettings,
  markFiscalReceiptEmailed,
  resolveOnlineQuotaFiscalYear,
  upsertMemberAnnualQuotas,
  type Database,
} from "@musicpro/database";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { uploadEnrollmentPdfToDrive } from "@/lib/reimbursements/google-drive";

import { generateEnrollmentPdf } from "./enrollment-pdf";
import {
  enrollmentPdfDriveAliases,
} from "./enrollment-pdf";
import {
  sendEnrollmentEmail,
  type EnrollmentAttachment,
} from "./email-transport";
import { ensureFiscalReceiptAttachment } from "@/lib/lezioni/issue-receipt-copy";
import {
  createNexiQuotaAssociativaPaymentLink,
  QUOTA_ASSOCIATIVA_CENTESIMI,
  syncNexiPaymentForEnrollment,
} from "./nexi-quota-payment-link";
import {
  payFirstPackWithQuotaFromForm,
  startEnrollmentCombinedLessonPayment,
  upsertEnrollmentLessonIntent,
} from "./enrollment-lesson-intents";
import {
  SCHOOL_APP_URL,
  schoolEmailBodyFromText,
  schoolEmailTextFooter,
  wrapSchoolEmail,
} from "@/lib/email/school-email-layout";

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
/** Cartella piatta Drive «Iscrizioni» (legacy GAS `FOLDER_ISCRIZIONI_ID`). */
const LEGACY_ISCRIZIONI_FLAT_FOLDER_ID = "1XCo-t2VwgOr6Pu7cWiiNcSxz4CXgPe6T";
/** Fallback root Drive iscrizioni (Codice.js ROOT_ISCRIZIONI_FOLDER_ID). */
const FALLBACK_ISCRIZIONI_ROOT_FOLDER_ID = "1s9IxsGHytPFHuBhJWBBaUlX_iRdNXxo5";

async function getEnrollmentDriveRootFolderId(db: Db): Promise<string> {
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "root_enrollments_folder_id")
    .maybeSingle();
  const fromSettings = String(data?.value || "").trim();
  return (
    fromSettings ||
    process.env.ISCRIZIONI_DRIVE_ROOT_FOLDER_ID?.trim() ||
    FALLBACK_ISCRIZIONI_ROOT_FOLDER_ID
  );
}

async function publishEnrollmentPdfToDrive(params: {
  db: Db;
  cognome: string;
  nome: string;
  filename: string;
  bytes: Uint8Array;
}): Promise<{ pdfUrl: string | null; error?: string }> {
  const rootFolderId = await getEnrollmentDriveRootFolderId(params.db);
  const associateFolderName = `${params.cognome} ${params.nome}`.trim();
  const drive = await uploadEnrollmentPdfToDrive({
    rootFolderId,
    flatFolderId: LEGACY_ISCRIZIONI_FLAT_FOLDER_ID,
    associateFolderName: associateFolderName || "Iscrizione",
    filename: params.filename,
    bytes: params.bytes,
    trashAliases: enrollmentPdfDriveAliases(params.cognome, params.nome),
  });
  if (!drive.ok) {
    console.warn(`[iscrizione] drive pdf: ${drive.error}`);
    return { pdfUrl: null, error: drive.error };
  }
  return { pdfUrl: drive.webViewLink };
}

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
  lezioni_enabled?: boolean | string;
  lesson_course_id?: string;
  lesson_teacher_member_id?: string;
  pay_first_pack_with_quota?: boolean | string;
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
  fiscalYear?: number,
): Promise<boolean> {
  const id = String(memberId || "").trim();
  if (!id) return false;
  const anno = fiscalYear ?? currentFiscalYear();
  return isMemberQuotaPaidForYear(db, id, anno);
}

async function hasPaidEnrollmentForYear(
  db: Db,
  cf: string,
  fiscalYear: number,
): Promise<boolean> {
  const target = String(cf || "").toUpperCase().trim();
  if (!target) return false;

  const { data: enrollments } = await db
    .from("enrollments")
    .select("payment_status")
    .eq("fiscal_year", fiscalYear)
    .ilike("tax_code", target);

  return Boolean(
    enrollments?.some((row) => isPaidStatus(row.payment_status)),
  );
}

async function resolveMemberOnlineQuotaYear(
  db: Db,
  memberId: string | null | undefined,
  cf?: string | null,
): Promise<{ fiscalYear: number; alreadyPaid: boolean }> {
  const resolved = await resolveOnlineQuotaFiscalYear(db, memberId);
  if (resolved.alreadyPaid) return resolved;

  const taxCode = String(cf || "").toUpperCase().trim();
  if (!taxCode) return resolved;

  if (await hasPaidEnrollmentForYear(db, taxCode, resolved.fiscalYear)) {
    return { fiscalYear: resolved.fiscalYear, alreadyPaid: true };
  }
  return resolved;
}

async function quotaAmountCentsForYear(
  db: Db,
  fiscalYear: number,
): Promise<number> {
  const settings = await listAnnualQuotaSettings(db);
  const setting = settings.find((row) => row.fiscalYear === fiscalYear);
  if (setting) return Math.round(setting.amountEur * 100);
  return QUOTA_ASSOCIATIVA_CENTESIMI;
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
    const sync = await syncNexiPaymentForEnrollment(
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

function buildSocioSignedEnrollmentMail(params: {
  nome: string;
  pdfUrl?: string | null;
}): { text: string; html: string } {
  const htmlBodyParagraphs = [
    `Ciao ${params.nome},`,
    "",
    "in allegato trovi la tua domanda di iscrizione firmata.",
    "",
    "Cordiali saluti,",
    "MusicPro School",
  ].join("\n");

  const textLines = [
    `Ciao ${params.nome},`,
    "",
    "in allegato trovi la tua domanda di iscrizione firmata.",
  ];
  if (params.pdfUrl) {
    textLines.push("", "Copia online:", params.pdfUrl);
  }
  textLines.push("", "Cordiali saluti,", "MusicPro School");
  const text = textLines.join("\n") + schoolEmailTextFooter();

  const html = wrapSchoolEmail({
    appOrigin: SCHOOL_APP_URL,
    title: "Conferma iscrizione",
    htmlBody: schoolEmailBodyFromText(htmlBodyParagraphs),
    ctas: params.pdfUrl
      ? [{ href: params.pdfUrl, label: "Apri copia online" }]
      : undefined,
  });

  return { text, html };
}

/** Email segreteria: con link PDF online nessun allegato (Gmail duplica chip link Drive + MIME). */
function segreteriaEnrollmentMailAttachments(
  pdfUrl: string | null | undefined,
  enrollmentAttachment: EnrollmentAttachment,
): EnrollmentAttachment[] | undefined {
  if (pdfUrl?.trim()) return undefined;
  return [enrollmentAttachment];
}

async function sendMagicLinkEmail(
  email: string,
  link: string,
  nome: string,
  variant: "default" | "cash" = "default",
): Promise<{ sent: boolean; error?: string }> {
  const subject =
    variant === "cash"
      ? "Completa l'iscrizione MusicPro (quota già versata)"
      : "Il tuo link per l'iscrizione MusicPro";

  const title =
    variant === "cash" ? "Completa l'iscrizione" : "Il tuo link di iscrizione";

  const textLines =
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
        ]
      : [
          `Ciao ${nome},`,
          "",
          "Usa questo link per aggiornare i dati e completare l'iscrizione:",
          link,
          "",
          "Se non hai richiesto tu questo messaggio, puoi ignorarlo.",
        ];

  const text = textLines.join("\n") + schoolEmailTextFooter();

  const htmlBodyParagraphs =
    variant === "cash"
      ? [
          `Ciao ${nome},`,
          "",
          "Hai già versato la quota associativa in sede.",
          "Usa questo link per inserire i dati mancanti e firmare l'iscrizione:",
          "",
          "Il link è valido 24 ore e può essere usato una sola volta.",
          "",
          "Se non hai richiesto tu questo messaggio, puoi ignorarlo.",
        ].join("\n")
      : [
          `Ciao ${nome},`,
          "",
          "Usa questo link per aggiornare i dati e completare l'iscrizione:",
          "",
          "Se non hai richiesto tu questo messaggio, puoi ignorarlo.",
        ].join("\n");

  const html = wrapSchoolEmail({
    appOrigin: SCHOOL_APP_URL,
    title,
    htmlBody: schoolEmailBodyFromText(htmlBodyParagraphs),
    ctas: [{ href: link, label: "Apri il link" }],
  });

  const result = await sendEnrollmentEmail({
    to: [email],
    subject,
    text,
    html,
    timeoutMs: RESEND_TIMEOUT_MS,
  });
  if (!result.sent) {
    console.warn(
      `[iscrizione] magic link non inviato a ${email} (${nome}): ${result.error || "errore"} — ${link}`,
    );
  }
  return result;
}

async function finalizeCashEnrollmentDocuments(input: {
  db: Db;
  memberId: string;
  data: EnrollmentFormData;
  cf: string;
}): Promise<void> {
  const db = input.db;
  const nome = formText(input.data.nome);
  const cognome = formText(input.data.cognome);
  const email = enrollmentContactEmail(input.data);
  const phone = enrollmentContactPhone(input.data);
  const cf = input.cf;

  const { data: member, error: memberErr } = await db
    .from("members")
    .select("*")
    .eq("id", input.memberId)
    .maybeSingle();
  if (memberErr || !member) {
    throw new Error(memberErr?.message || "Associato non trovato per PDF contanti.");
  }

  const anno = currentFiscalYear();
  const nowIso = new Date().toISOString();
  const amountCents = QUOTA_ASSOCIATIVA_CENTESIMI;

  const { data: enrollment, error: insertErr } = await db
    .from("enrollments")
    .insert({
      member_id: member.id,
      first_name: nome,
      last_name: cognome,
      email: email || member.email || formText(input.data.tutore_email).toLowerCase() || "",
      tax_code: cf,
      phone: phone || member.phone || null,
      fiscal_year: anno,
      amount_centesimi: amountCents,
      payment_status: "PAGATO",
      form_payload: input.data as Database["public"]["Tables"]["enrollments"]["Insert"]["form_payload"],
    })
    .select("*")
    .single();
  if (insertErr || !enrollment) {
    throw new Error(insertErr?.message || "Impossibile creare enrollment contanti.");
  }

  await db
    .from("enrollments")
    .update({ paid_at: nowIso } as Database["public"]["Tables"]["enrollments"]["Update"])
    .eq("id", enrollment.id);

  const oggi = new Date().toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Rome",
  });
  const quotaEuro = amountCents / 100;
  const pdf = await generateEnrollmentPdf({
    memberNumber: member.member_number,
    nome,
    cognome,
    luogoNascita: formText(input.data.luogo_nascita),
    provNascita: formText(input.data.prov_nascita).toUpperCase(),
    dataNascita: formText(input.data.data_nascita),
    indirizzo: formText(input.data.indirizzo),
    cap: formText(input.data.cap),
    citta: formText(input.data.citta),
    prov: formText(input.data.prov).toUpperCase(),
    cf,
    email: formText(input.data.email).toLowerCase() || member.email || "",
    telefono: formText(input.data.telefono) || String(member.phone || ""),
    corso: formText(input.data.corso),
    tutoreNome: formText(input.data.tutore_nome),
    tutoreCognome: formText(input.data.tutore_cognome),
    tutoreTelefono: formText(input.data.tutore_telefono),
    tutoreEmail: formText(input.data.tutore_email),
    tutoreCf: formText(input.data.tutore_cf).toUpperCase(),
    quotaLabel: `EUR ${quotaEuro.toFixed(2).replace(".", ",")}`,
    dataOggi: oggi,
    signatureData: formText(input.data.signatureData) || null,
  });

  const stored = await uploadEnrollmentPdf(
    db,
    enrollment.id,
    pdf.filename,
    pdf.bytes,
  );
  const drive = await publishEnrollmentPdfToDrive({
    db,
    cognome,
    nome,
    filename: pdf.filename,
    bytes: pdf.bytes,
  });

  const pdfUrl = drive.pdfUrl || stored.pdfUrl;
  await db
    .from("enrollments")
    .update({
      pdf_url: pdfUrl,
      ...(stored.storagePath ? { pdf_storage_path: stored.storagePath } : {}),
      confirmation_email_sent: true,
      confirmation_email_sent_at: nowIso,
    } as Database["public"]["Tables"]["enrollments"]["Update"])
    .eq("id", enrollment.id);

  const pdfBase64 = Buffer.from(pdf.bytes).toString("base64");
  const attachment = {
    filename: pdf.filename,
    content: pdfBase64,
    content_type: "application/pdf" as const,
  };

  const adminPdfLine = pdfUrl
    ? `PDF: ${pdfUrl}`
    : stored.storagePath
      ? `PDF solo in allegato (link non disponibile). Path interno: ${stored.storagePath}.`
      : "PDF non disponibile (storage/Drive non configurati).";

  const adminMail = await sendResendEmail({
    to: segreteriaRecipients(),
    subject: `ISCRIZIONE CONTANTI: ${cognome} ${nome}`,
    text: [
      "Nuova iscrizione completata (quota già versata in sede).",
      `Nome: ${nome} ${cognome}`,
      `Email contatto: ${email || member.email || "—"}`,
      `CF: ${cf}`,
      `N. socio: ${member.member_number ?? "—"}`,
      `Member ID: ${member.id}`,
      adminPdfLine,
      "",
      "Il socio ha compilato e firmato il modulo online.",
    ].join("\n"),
    attachments: segreteriaEnrollmentMailAttachments(pdfUrl, attachment),
  });
  if (!adminMail.sent) {
    console.error("[finalizeCashEnrollmentDocuments] email admin:", adminMail.error);
  }

  if (email) {
    const socioContent = buildSocioSignedEnrollmentMail({ nome, pdfUrl });
    const socioMail = await sendResendEmail({
      to: [email],
      subject: `Conferma Iscrizione MusicPro - ${nome} ${cognome}`,
      text: socioContent.text,
      html: socioContent.html,
      attachments: [attachment],
    });
    if (!socioMail.sent) {
      console.error("[finalizeCashEnrollmentDocuments] email socio:", socioMail.error);
    }
  }
}


function normalizePhoneDigits(raw: string): string {
  return String(raw || "")
    .replace(/[\s().-]/g, "")
    .replace(/^\+/, "")
    .replace(/\D/g, "");
}

function isValidPhoneDigits(digits: string): boolean {
  return digits.length >= 9 && digits.length <= 15;
}

/** Email di contatto iscrizione: studente, altrimenti tutore (minori senza email). */
export function enrollmentContactEmail(data: EnrollmentFormData): string {
  const student = formText(data.email).toLowerCase();
  if (student) return student;
  return formText(data.tutore_email).toLowerCase();
}

/** Telefono di contatto iscrizione: studente, altrimenti tutore. */
export function enrollmentContactPhone(data: EnrollmentFormData): string {
  const student = formText(data.telefono).replace(/[\s().-]/g, "");
  if (student) return student;
  return formText(data.tutore_telefono).replace(/[\s().-]/g, "");
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

  const ageMs = today.getTime() - born.getTime();
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  const isMinor = ageYears < 18;

  if (isMinor) {
    if (!formText(data.tutore_nome) || !formText(data.tutore_cognome)) {
      return "Per i minorenni sono obbligatori nome e cognome del genitore/tutore.";
    }
    const tutoreEmail = formText(data.tutore_email).toLowerCase();
    if (!tutoreEmail || !EMAIL_RE.test(tutoreEmail)) {
      return "Per i minorenni è obbligatoria un'email del genitore/tutore.";
    }
    const tutorePhoneDigits = normalizePhoneDigits(
      formText(data.tutore_telefono),
    );
    if (!isValidPhoneDigits(tutorePhoneDigits)) {
      return "Per i minorenni è obbligatorio un cellulare del genitore/tutore.";
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
    // Email/cellulare dello studente: opzionali; se presenti devono essere validi.
    if (email && !EMAIL_RE.test(email)) return "Email dello studente non valida.";
    if (telefono) {
      const phoneDigits = normalizePhoneDigits(telefono);
      if (!isValidPhoneDigits(phoneDigits)) {
        return "Cellulare dello studente non valido (almeno 9 cifre).";
      }
    }
  } else {
    if (!email || !EMAIL_RE.test(email)) return "Email non valida.";
    const phoneDigits = normalizePhoneDigits(telefono);
    if (!isValidPhoneDigits(phoneDigits)) {
      return "Cellulare non valido (almeno 9 cifre).";
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
  // Contanti sportello: quota già presa → solo anagrafica.
  // Online: se 2026 versata ma 2027 libera → non è «già pagata», si rinnova sul 2027.
  const target = Boolean(loaded.info.cashQuotaPaid)
    ? { fiscalYear: currentFiscalYear(), alreadyPaid: true }
    : await resolveMemberOnlineQuotaYear(
        db,
        member.id,
        String(fields.cf || ""),
      );
  const quotaGiaPagata = target.alreadyPaid;

  return {
    found: true,
    rinnovo: true,
    quotaGiaPagata,
    fiscalYear: target.fiscalYear,
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

/**
 * Registra solo la quota contanti. Non chiude la bozza:
 * is_enrollment_draft resta true finché salvaAggiornamentoAssociatoIscrizione
 * (CF + firma). Il trigger clear_enrollment_draft_on_quota richiede CF+GDPR.
 */
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
  const tokenMember = await memberFromIscrizioneToken(db, tokenFromForm(data));
  const member = tokenMember ?? (await findMemberByCf(db, cf));
  const target = await resolveMemberOnlineQuotaYear(db, member?.id, cf);

  if (target.alreadyPaid) {
    return {
      blocked: true,
      code: "QUOTA_GIA_PAGATA",
      message: `La quota associativa ${target.fiscalYear} risulta già pagata. Controlla la email o scrivi a musicproeventi@gmail.com.`,
    };
  }

  if (isRinnovo(data)) return { blocked: false };
  if (tokenMember) return { blocked: false };

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
  fiscalYear?: number,
): Promise<EnrollmentRow | null> {
  const target = String(cf || "").toUpperCase().trim();
  if (!target) return null;

  let query = db
    .from("enrollments")
    .select("*")
    .eq("tax_code", target)
    .neq("payment_status", "PAGATO")
    .order("created_at", { ascending: false })
    .limit(1);
  if (fiscalYear != null) {
    query = query.eq("fiscal_year", fiscalYear);
  }

  const { data } = await query;

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

  const cf = String(data.cf || "").toUpperCase().trim();
  const target = await resolveMemberOnlineQuotaYear(db, member.id, cf);
  if (target.alreadyPaid) {
    return {
      success: false,
      code: "QUOTA_GIA_PAGATA",
      message: `La quota associativa ${target.fiscalYear} risulta già pagata. Controlla la email o scrivi a musicproeventi@gmail.com.`,
    };
  }
  const anno = target.fiscalYear;
  const importoCents = await quotaAmountCentsForYear(db, anno);
  const payload = {
    ...data,
    metodo_pagamento: "Nexi",
  };
  const useCombinedLessonCheckout = payFirstPackWithQuotaFromForm(data);
  const quotaAlreadyPaid = false;

  const resumeId = String(data.idIscrizione || data.id || "").trim();
  let pending =
    (resumeId ? await getEnrollmentById(db, resumeId) : null) ||
    (await findPendingEnrollmentByCf(db, cf, anno));

  if (pending && isPaidStatus(pending.payment_status)) {
    pending = null;
  }
  // Bozza di un altro anno (es. 2026) non va riusata per un rinnovo 2027.
  if (pending && pending.fiscal_year != null && pending.fiscal_year !== anno) {
    pending = null;
  }

  if (pending) {
    const idIscrizione = pending.legacy_enrollment_id || pending.id;
    const existingUrl = String(pending.payment_link_url || "").trim();
    const existingStato = String(pending.payment_status || "")
      .toUpperCase()
      .trim();
    const sameYearLink =
      pending.fiscal_year === anno &&
      pending.amount_centesimi === importoCents;

    await db
      .from("enrollments")
      .update({
        first_name: String(data.nome || "").trim(),
        last_name: String(data.cognome || "").trim(),
        email: enrollmentContactEmail(data),
        tax_code: cf,
        phone: enrollmentContactPhone(data) || null,
        fiscal_year: anno,
        amount_centesimi: importoCents,
        member_id: member.id,
        form_payload:
          payload as Database["public"]["Tables"]["enrollments"]["Insert"]["form_payload"],
      })
      .eq("id", pending.id);

    const intentReuse = await upsertEnrollmentLessonIntent(db, {
      enrollmentId: pending.id,
      memberId: member.id,
      data,
    });

    if (
      existingUrl &&
      existingStato !== "ERRORE" &&
      sameYearLink &&
      !useCombinedLessonCheckout
    ) {
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

    if (useCombinedLessonCheckout && intentReuse) {
      const combinedReuse = await startEnrollmentCombinedLessonPayment({
        db,
        enrollmentId: pending.id,
        memberId: member.id,
        intent: intentReuse,
        nome: String(data.nome || ""),
        cognome: String(data.cognome || ""),
        email: enrollmentContactEmail(data),
        importoQuotaCents: importoCents,
        quotaAlreadyPaid,
      });

      await db
        .from("enrollments")
        .update({
          payment_status: "INVIATO",
          payment_link_url: combinedReuse.checkoutUrl,
          payment_link_id: combinedReuse.stripeId || null,
          payment_total_centesimi: combinedReuse.totaleCents,
        })
        .eq("id", pending.id);

      const formAccessTokenCombined = await issueFormAccessToken(db, pending.id);
      return {
        success: true,
        idIscrizione,
        checkoutUrl: combinedReuse.checkoutUrl,
        reused: Boolean(combinedReuse.reused),
        memberId: member.id,
        formAccessToken: formAccessTokenCombined,
        combinedLessonPack: true,
      };
    }

    const linkResReuse = await createNexiQuotaAssociativaPaymentLink({
      idIscrizione,
      memberId: member.id,
      nome: String(data.nome || ""),
      cognome: String(data.cognome || ""),
      importoCentesimi: importoCents,
      annoSocietario: anno,
      email: enrollmentContactEmail(data),
      idempotencyKey: `iscrizione_retry_${idIscrizione}_${Date.now()}`,
    });

    if (!linkResReuse.success || !linkResReuse.url) {
      await db
        .from("enrollments")
        .update({ payment_status: "ERRORE" })
        .eq("id", pending.id);
      throw new Error(
        linkResReuse.message ||
          "Impossibile creare il link di pagamento.",
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

    await upsertEnrollmentLessonIntent(db, {
      enrollmentId: pending.id,
      memberId: member.id,
      data,
    });

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
      email: enrollmentContactEmail(data),
      tax_code: cf,
      phone: enrollmentContactPhone(data) || null,
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

  const intentNew = await upsertEnrollmentLessonIntent(db, {
    enrollmentId: idIscrizione,
    memberId: member.id,
    data,
  });

  if (useCombinedLessonCheckout && intentNew) {
    try {
      const combined = await startEnrollmentCombinedLessonPayment({
        db,
        enrollmentId: idIscrizione,
        memberId: member.id,
        intent: intentNew,
        nome: String(data.nome || ""),
        cognome: String(data.cognome || ""),
        email: enrollmentContactEmail(data),
        importoQuotaCents: importoCents,
        quotaAlreadyPaid,
      });

      await db
        .from("enrollments")
        .update({
          payment_status: "INVIATO",
          payment_link_url: combined.checkoutUrl,
          payment_link_id: combined.stripeId || null,
          payment_total_centesimi: combined.totaleCents,
        })
        .eq("id", idIscrizione);

      const formAccessTokenCombined = await issueFormAccessToken(
        db,
        idIscrizione,
      );
      return {
        success: true,
        idIscrizione,
        checkoutUrl: combined.checkoutUrl,
        reused: Boolean(combined.reused),
        memberId: member.id,
        formAccessToken: formAccessTokenCombined,
        combinedLessonPack: true,
      };
    } catch (combinedErr) {
      await db
        .from("enrollments")
        .update({ payment_status: "ERRORE" })
        .eq("id", idIscrizione);
      throw combinedErr;
    }
  }

  const linkRes = await createNexiQuotaAssociativaPaymentLink({
    idIscrizione,
    memberId: member.id,
    nome: String(data.nome || ""),
    cognome: String(data.cognome || ""),
    importoCentesimi: importoCents,
    annoSocietario: anno,
    email: enrollmentContactEmail(data),
    idempotencyKey: `iscrizione_${idIscrizione}`,
  });

  if (!linkRes.success || !linkRes.url) {
    await db
      .from("enrollments")
      .update({ payment_status: "ERRORE" })
      .eq("id", idIscrizione);
    throw new Error(
      linkRes.message || "Impossibile creare il link di pagamento.",
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
  return sendEnrollmentEmail({
    ...params,
    timeoutMs: RESEND_TIMEOUT_MS,
  });
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

function enrollmentFormHasUsablePayload(form: EnrollmentFormData): boolean {
  return Boolean(
    formText(form.nome) ||
      formText(form.cognome) ||
      formText(form.cf) ||
      formText(form.signatureData) ||
      formText(form.email),
  );
}

/**
 * Post-quota onboarding/rinnovo app: enrollment senza form_payload (o payload vuoto).
 * Allinea ruolo associato da anagrafica su `members` senza PDF/email e senza
 * inventare GDPR. Chiude bozza/enrolled_at solo se CF+GDPR (come migration 110).
 */
async function finalizePaidEnrollmentFromMemberAnagrafica(
  db: Db,
  rec: EnrollmentRow,
): Promise<{
  success: true;
  alreadySent: false;
  skippedForm: true;
  name: string;
  pdfUrl: string;
  memberNumber: number | null;
  formStillRequired: boolean;
}> {
  if (!rec.member_id) {
    throw new Error(
      "Quota pagata ma iscrizione senza associato collegato. Contatta la segreteria.",
    );
  }

  const member = await findMemberById(db, rec.member_id);
  if (!member) {
    throw new Error(
      "Quota pagata ma profilo associato non trovato. Contatta la segreteria.",
    );
  }

  const nome = String(member.first_name || rec.first_name || "").trim();
  const cognome = String(member.last_name || rec.last_name || "").trim();
  const email = String(member.email || rec.email || "")
    .trim()
    .toLowerCase();
  if (!nome || !cognome) {
    throw new Error(
      "Quota pagata ma anagrafica incompleta sul profilo. Completa il modulo iscrizione o contatta la segreteria.",
    );
  }

  const nowIso = new Date().toISOString();
  const taxCode = String(member.tax_code || "").trim();
  const canCloseDraft = Boolean(taxCode && member.gdpr_consent);
  const patch: Database["public"]["Tables"]["members"]["Update"] = {};

  if (canCloseDraft) {
    patch.is_enrollment_draft = false;
    patch.draft_expires_at = null;
    if (!member.enrolled_at) {
      patch.enrolled_at = nowIso;
    }
    if (member.member_number == null) {
      patch.member_number = await getNextMemberNumber(db);
    }
  }

  let updated = member;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await db
      .from("members")
      .update(patch)
      .eq("id", member.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(
        error?.message ||
          "Impossibile aggiornare l'associato dopo il pagamento quota.",
      );
    }
    updated = data;
  }

  const roleResult = await grantMemberRole(db, updated.id, "associato", null);
  if (!roleResult.success) {
    console.error(
      "[finalizePaidEnrollmentFromMemberAnagrafica] grant associato:",
      roleResult.errorMessage,
    );
  }

  const form = {
    ...memberToFormFields(updated),
    source: "onboarding_quota_no_form",
  } as EnrollmentFormData;

  await db
    .from("enrollments")
    .update({
      confirmation_email_sent: true,
      confirmation_email_sent_at: nowIso,
      member_id: updated.id,
      first_name: nome,
      last_name: cognome,
      email: email || rec.email,
      tax_code:
        String(updated.tax_code || rec.tax_code || "").toUpperCase().trim() ||
        rec.tax_code,
      form_payload:
        form as Database["public"]["Tables"]["enrollments"]["Update"]["form_payload"],
    } as Database["public"]["Tables"]["enrollments"]["Update"])
    .eq("id", rec.id);

  return {
    success: true,
    alreadySent: false,
    skippedForm: true,
    name: nome,
    pdfUrl: "",
    memberNumber: updated.member_number,
    formStillRequired: !canCloseDraft,
  };
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
    // Non usare enrollment.email/phone come fallback: possono essere quelli del tutore
    // (contatto iscrizione), non l'identità Auth/anagrafica dello studente.
    member = await findOrCreateEnrollmentDraftMember(db, {
      ...form,
      nome: form.nome || enrollment.first_name,
      cognome: form.cognome || enrollment.last_name,
      email: form.email || "",
      cf: form.cf || enrollment.tax_code || "",
      telefono: form.telefono || "",
    });
    await db
      .from("enrollments")
      .update({ member_id: member.id })
      .eq("id", enrollment.id);
  }

  const nowIso = new Date().toISOString();
  // Solo consenso esplicito dal modulo (firma / privacy): non inventare GDPR
  // da snapshot onboarding_quota / anagrafica members.
  const formConsented =
    isFormFlagTrue(form.privacy_accepted) ||
    Boolean(formText(form.signatureData));
  const resolvedCf =
    formText(form.cf) ||
    String(enrollment.tax_code || "") ||
    String(member.tax_code || "");
  // Allineato a migration 110: chiudi bozza solo con CF + consenso (form o già su member).
  const canFullyEnroll =
    Boolean(resolvedCf.trim()) &&
    (formConsented || Boolean(member.gdpr_consent));

  // Preferisci form → member: non azzerare anagrafica con campi vuoti.
  // Email/telefono enrollment possono essere del tutore: non copiarli su members.
  const patch: Database["public"]["Tables"]["members"]["Update"] = {
    ...memberPatchFromForm({
      ...form,
      nome: formText(form.nome) || enrollment.first_name || member.first_name,
      cognome:
        formText(form.cognome) || enrollment.last_name || member.last_name,
      email: formText(form.email) || String(member.email || "").trim() || "",
      cf: resolvedCf,
      telefono:
        formText(form.telefono) || String(member.phone || "").trim() || "",
    }),
  };

  if (canFullyEnroll) {
    patch.is_enrollment_draft = false;
    patch.draft_expires_at = null;
    if (member.member_number == null) {
      patch.member_number = await getNextMemberNumber(db);
    }
    if (!member.enrolled_at) {
      patch.enrolled_at = nowIso;
    }
  }
  if (!member.gdpr_consent && formConsented) {
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

  const roleResult = await grantMemberRole(db, updated.id, "associato", null);
  if (!roleResult.success) {
    console.error(
      "[completaInvioIscrizione] grant associato:",
      roleResult.errorMessage,
    );
  }

  // Quota: idempotente se webhook ha già scritto (usa l'anno dell'enrollment).
  const anno = enrollment.fiscal_year || currentFiscalYear();
  if (!(await hasQuotaPaidForMember(db, updated.id, anno))) {
    try {
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
          notes: "nexi",
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
  const formSource = String(form.source || "");
  const isOnboardingSnapshot =
    formSource.startsWith("onboarding_quota") &&
    !formText(form.signatureData);
  // Snapshot app / payload vuoto: promote da members, niente PDF modulo vuoto.
  if (!enrollmentFormHasUsablePayload(form) || isOnboardingSnapshot) {
    try {
      return await finalizePaidEnrollmentFromMemberAnagrafica(db, rec);
    } catch (err) {
      await db
        .from("enrollments")
        .update({ confirmation_email_sent_at: null })
        .eq("id", rec.id)
        .eq("confirmation_email_sent", false);
      throw err;
    }
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
  const drive = await publishEnrollmentPdfToDrive({
    db,
    cognome: formText(form.cognome) || rec.last_name,
    nome: formText(form.nome) || rec.first_name,
    filename: pdf.filename,
    bytes: pdf.bytes,
  });
  const durablePdfUrl = drive.pdfUrl || stored.pdfUrl;
  const pdfBase64 = Buffer.from(pdf.bytes).toString("base64");
  const attachment = {
    filename: pdf.filename,
    content: pdfBase64,
    content_type: "application/pdf" as const,
  };

  const socioMailAttachments: EnrollmentAttachment[] = [attachment];
  let quotaReceiptId: string | null = null;
  let quotaReceiptNoteForAdmin = "";
  const quotaFiscalYear = rec.fiscal_year ?? currentFiscalYear();
  try {
    const quotaReceipt = await ensureFiscalReceiptAttachment(db, () =>
      emitFiscalReceiptForQuotaPayment(db, {
        memberId: member.id,
        fiscalYear: quotaFiscalYear,
      }),
    );
    if (quotaReceipt) {
      socioMailAttachments.push(quotaReceipt.attachment);
      quotaReceiptId = quotaReceipt.receiptId;
      quotaReceiptNoteForAdmin =
        "Ricevuta fiscale quota: in allegato nella mail al socio.";
    }
  } catch (quotaReceiptErr) {
    console.error(
      "[completaInvioIscrizione] ricevuta quota:",
      quotaReceiptErr instanceof Error
        ? quotaReceiptErr.message
        : String(quotaReceiptErr),
    );
  }

  const socioEmail = (
    formText(form.email) ||
    formText(form.tutore_email) ||
    rec.email ||
    ""
  ).toLowerCase();
  const nome = formText(form.nome) || rec.first_name;
  const cognome = formText(form.cognome) || rec.last_name;

  const socioContent = buildSocioSignedEnrollmentMail({
    nome,
    pdfUrl: durablePdfUrl,
  });
  const socioMail = socioEmail
    ? await sendResendEmail({
        to: [socioEmail],
        subject: `Conferma Iscrizione MusicPro - ${nome} ${cognome}`,
        text: socioContent.text,
        html: socioContent.html,
        attachments: socioMailAttachments,
      })
    : { sent: false, error: "Email socio mancante" };

  const adminPdfLine = durablePdfUrl
    ? `PDF: ${durablePdfUrl}`
    : stored.storagePath
      ? `PDF solo in allegato (link non disponibile). Path interno: ${stored.storagePath}.`
      : "PDF non disponibile (storage/Drive non configurati).";

  const adminMail = await sendResendEmail({
    to: segreteriaRecipients(),
    subject: `ISCRIZIONE: ${cognome} ${nome}`,
    text: [
      "Nuova iscrizione con pagamento online.",
      `Nome: ${nome} ${cognome}`,
      `Email socio: ${socioEmail || "—"}`,
      `CF: ${formText(form.cf || rec.tax_code).toUpperCase() || "—"}`,
      `N. socio: ${member.member_number ?? "—"}`,
      `Member ID: ${member.id}`,
      adminPdfLine,
      quotaReceiptNoteForAdmin,
    ]
      .filter(Boolean)
      .join("\n"),
    attachments: segreteriaEnrollmentMailAttachments(
      durablePdfUrl,
      attachment,
    ),
  });

  if (socioMail.sent && quotaReceiptId) {
    await markFiscalReceiptEmailed(db, quotaReceiptId);
  }

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
      // Prefer Drive webViewLink when available; pdf_storage_path remains durable in Storage.
      pdf_url: durablePdfUrl,
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
    pdfUrl: durablePdfUrl || "",
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
  // Solo anagrafica senza pagamento: serve almeno la quota dell'anno corrente
  // (o contanti sportello). Il rinnovo anticipato 2027 passa da pagamento.
  const quotaOk =
    Boolean(loaded?.info.cashQuotaPaid) ||
    (await hasQuotaPaidForMember(db, member.id, currentFiscalYear())) ||
    (await hasPaidEnrollmentForYear(db, cf, currentFiscalYear()));

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

  const roleResult = await grantMemberRole(db, member.id, "associato", null);
  if (!roleResult.success) {
    console.error(
      "[rinnovo/completa anagrafica] grant associato:",
      roleResult.errorMessage,
    );
  }

  if (token) {
    await markMagicTokenUsed(db, token);
  }

  // Non bloccare la risposta su PDF/email (spinner infinito in passato).
  if (loaded?.info.cashQuotaPaid) {
    void finalizeCashEnrollmentDocuments({
      db,
      memberId: member.id,
      data,
      cf,
    }).catch((finalizeErr) => {
      console.error(
        "[salvaAggiornamentoAssociatoIscrizione] finalize PDF contanti:",
        finalizeErr,
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


/** Ops: rigenera PDF+Drive per un'iscrizione già pagata (senza reinviare email). */
export async function regenerateEnrollmentPdfDocuments(
  idIscrizione: string,
): Promise<{
  success: boolean;
  enrollmentId: string;
  name: string;
  pdfUrl: string | null;
  storagePath: string | null;
  driveError?: string;
}> {
  const db = createServiceRoleClient();
  const rec = await getEnrollmentById(db, idIscrizione);
  if (!rec) throw new Error("Iscrizione non trovata.");
  if (!isPaidStatus(rec.payment_status)) {
    throw new Error("Iscrizione non pagata: impossibile rigenerare il PDF.");
  }

  const form = parseEnrollmentFormPayload(rec.form_payload);
  const member = await promoteMemberAfterPaidEnrollment(db, rec, form);

  const oggi = new Date().toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Rome",
  });
  const quotaEuro = (rec.amount_centesimi || QUOTA_ASSOCIATIVA_CENTESIMI) / 100;
  const nome = formText(form.nome) || rec.first_name;
  const cognome = formText(form.cognome) || rec.last_name;

  const pdf = await generateEnrollmentPdf({
    memberNumber: member.member_number,
    nome,
    cognome,
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
  const drive = await publishEnrollmentPdfToDrive({
    db,
    cognome,
    nome,
    filename: pdf.filename,
    bytes: pdf.bytes,
  });

  const pdfUrl = drive.pdfUrl || stored.pdfUrl;
  await db
    .from("enrollments")
    .update({
      pdf_url: pdfUrl,
      ...(stored.storagePath ? { pdf_storage_path: stored.storagePath } : {}),
    } as Database["public"]["Tables"]["enrollments"]["Update"])
    .eq("id", rec.id);

  return {
    success: true,
    enrollmentId: rec.id,
    name: `${cognome} ${nome}`.trim(),
    pdfUrl,
    storagePath: stored.storagePath,
    driveError: drive.error,
  };
}

/**
 * Ops: rigenera i PDF delle ultime N iscrizioni pagate (layout legacy).
 * Default: 20. Nessuna email.
 */
export async function backfillRecentEnrollmentPdfs(options?: {
  limit?: number;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  total: number;
  ok: number;
  failed: Array<{ id: string; name: string; error: string }>;
  results: Array<{ id: string; name: string; pdfUrl: string | null }>;
}> {
  const db = createServiceRoleClient();
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 200);
  const dryRun = Boolean(options?.dryRun);

  const { data, error } = await db
    .from("enrollments")
    .select("id, first_name, last_name, payment_status, paid_at, created_at")
    .eq("payment_status", "PAGATO")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Impossibile elencare le iscrizioni.");
  }

  const rows = data ?? [];
  const failed: Array<{ id: string; name: string; error: string }> = [];
  const results: Array<{ id: string; name: string; pdfUrl: string | null }> =
    [];

  for (const row of rows) {
    const name = `${row.last_name || ""} ${row.first_name || ""}`.trim();
    if (dryRun) {
      results.push({ id: row.id, name, pdfUrl: null });
      continue;
    }
    try {
      const out = await regenerateEnrollmentPdfDocuments(row.id);
      results.push({
        id: out.enrollmentId,
        name: out.name,
        pdfUrl: out.pdfUrl,
      });
    } catch (err) {
      failed.push({
        id: row.id,
        name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    success: failed.length === 0,
    total: rows.length,
    ok: results.length,
    failed,
    results,
  };
}

/** Ops: genera PDF+Drive per iscrizione contanti già salvata senza modulo (es. Lucia Oca). */
export async function backfillCashEnrollmentPdfForMember(
  memberId: string,
  data?: EnrollmentFormData,
) {
  const db = createServiceRoleClient();
  const { data: member, error } = await db
    .from("members")
    .select("*")
    .eq("id", memberId)
    .maybeSingle();
  if (error || !member) {
    throw new Error(error?.message || "Associato non trovato.");
  }
  const form: EnrollmentFormData = {
    nome: member.first_name || "",
    cognome: member.last_name || "",
    email: member.email || "",
    cf: member.tax_code || "",
    telefono: member.phone || "",
    luogo_nascita: member.birth_place || "",
    prov_nascita: member.birth_province || "",
    data_nascita: member.birth_date || "",
    indirizzo: member.address_street || "",
    cap: member.address_postal_code || "",
    citta: member.address_city || "",
    prov: member.address_province || "",
    tutore_nome: member.manual_tutor_first_name || "",
    tutore_cognome: member.manual_tutor_last_name || "",
    tutore_telefono: member.manual_tutor_phone || "",
    tutore_email: member.manual_tutor_email || "",
    tutore_cf: member.manual_tutor_tax_code || "",
    corso: "",
    ...(data || {}),
  };
  await finalizeCashEnrollmentDocuments({
    db,
    memberId: member.id,
    data: form,
    cf: String(member.tax_code || "").toUpperCase(),
  });
  return { success: true, memberId: member.id };
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
