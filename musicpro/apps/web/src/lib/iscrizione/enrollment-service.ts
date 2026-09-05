import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listAnnualQuotaSettings,
  upsertMemberAnnualQuotas,
  type Database,
} from "@musicpro/database";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

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
const TOKEN_KEY_PREFIX = "iscrizione_token:";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const inviata =
    !!String(rec.pdf_url || "").trim() || rec.confirmation_email_sent;

  return {
    found: true as const,
    idIscrizione: rec.legacy_enrollment_id || rec.id,
    pagamentoStato: rec.payment_status,
    pagato: isPaidStatus(rec.payment_status),
    inviata,
    nome: rec.first_name,
    cognome: rec.last_name,
    importoCentesimi: rec.amount_centesimi,
    pdfUrl: rec.pdf_url || "",
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

export async function sincronizzaPagamento(idIscrizione: string) {
  const db = createServiceRoleClient();
  const stato = await getStatoIscrizione(idIscrizione);

  if (!stato.found) {
    return { found: false, pagato: false };
  }

  if (stato.pagato) {
    return {
      ...stato,
      pagato: true,
      already: true,
      idIscrizione,
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
      const updated = await getStatoIscrizione(idIscrizione);
      return {
        ...updated,
        pagato: true,
        synced: true,
        idIscrizione,
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
): Promise<string> {
  const token = await storeMagicToken(db, email, { ttlMs });
  return iscrizioneLinkFromToken(token);
}

async function sendMagicLinkEmail(
  email: string,
  link: string,
  nome: string,
  variant: "default" | "cash" = "default",
): Promise<boolean> {
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
    return false;
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
    return false;
  }

  return true;
}

async function createAndSendMagicLink(db: Db, member: MemberRow) {
  if (!member.email) return false;
  const link = await createIscrizioneMagicLink(db, member.email);
  const fields = memberToFormFields(member);
  const tutorNome = String(member.manual_tutor_first_name || "").trim();
  await sendMagicLinkEmail(
    member.email,
    link,
    tutorNome || String(fields.nome || "Associato"),
  );
  return true;
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
): Promise<MemberRow> {
  const existing = await findMemberByEmail(db, email);
  if (existing) {
    if (existing.is_enrollment_draft) {
      const patch: Database["public"]["Tables"]["members"]["Update"] = {
        first_name: nome || existing.first_name,
        last_name: cognome || existing.last_name,
        draft_expires_at: new Date(
          Date.now() + MAGIC_LINK_TTL_MS,
        ).toISOString(),
      };
      const { data, error } = await db
        .from("members")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(
          error?.message || "Impossibile aggiornare la bozza associato.",
        );
      }
      return data;
    }

    const softPatch: Database["public"]["Tables"]["members"]["Update"] = {};
    if (!String(existing.first_name || "").trim() && nome) {
      softPatch.first_name = nome;
    }
    if (!String(existing.last_name || "").trim() && cognome) {
      softPatch.last_name = cognome;
    }
    if (Object.keys(softPatch).length > 0) {
      const { data, error } = await db
        .from("members")
        .update(softPatch)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(
          error?.message || "Impossibile aggiornare l'associato.",
        );
      }
      return data;
    }

    return existing;
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

  return data;
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
  memberId?: string;
  message?: string;
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
  const member = await findOrCreateCashEnrollmentMember(
    db,
    nome,
    cognome,
    email,
  );

  await markCashQuotaPaid(db, member.id);

  const token = await storeMagicToken(db, email, {
    memberId: member.id,
    cashQuotaPaid: true,
  });
  const link = iscrizioneLinkFromToken(token);
  const greeting =
    String(member.first_name || "").trim() || nome || "Associato";
  const emailSent = await sendMagicLinkEmail(email, link, greeting, "cash");

  return {
    success: true,
    link,
    emailSent,
    memberId: member.id,
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

export async function inviaIscrizioneConPagamento(data: EnrollmentFormData) {
  if (!String(data.email || "").trim()) {
    throw new Error("Email obbligatoria.");
  }
  if (!String(data.nome || "").trim() || !String(data.cognome || "").trim()) {
    throw new Error("Nome e cognome obbligatori.");
  }
  if (!String(data.cf || "").trim()) {
    throw new Error("Codice fiscale obbligatorio.");
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

  const idIscrizione = randomUUID();
  const anno = currentFiscalYear();
  const importoCents = QUOTA_ASSOCIATIVA_CENTESIMI;

  const payload = {
    ...data,
    metodo_pagamento: "Stripe",
  };

  const { data: inserted, error: insertErr } = await db
    .from("enrollments")
    .insert({
      id: idIscrizione,
      legacy_enrollment_id: idIscrizione,
      member_id: tokenMember?.id ?? null,
      first_name: String(data.nome || "").trim(),
      last_name: String(data.cognome || "").trim(),
      email: String(data.email || "").trim(),
      tax_code: String(data.cf || "").toUpperCase().trim(),
      phone: String(data.telefono || "").trim(),
      fiscal_year: anno,
      amount_centesimi: importoCents,
      payment_status: "PENDING",
      form_payload: payload as Database["public"]["Tables"]["enrollments"]["Insert"]["form_payload"],
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || "Impossibile salvare l'iscrizione.");
  }

  const linkRes = await createStripePaymentLinkQuotaAssociativa({
    idIscrizione,
    memberId: tokenMember?.id,
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

  return {
    success: true,
    idIscrizione,
    checkoutUrl: linkRes.url,
  };
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

  if (rec.pdf_url || rec.confirmation_email_sent) {
    return {
      success: true,
      alreadySent: true,
      name: rec.first_name,
      pdfUrl: rec.pdf_url || "",
    };
  }

  // TODO: generazione PDF + invio email (stub — segna come accodato)
  console.info(
    `[iscrizione] completaInvioIscrizione stub per ${rec.id} (${rec.email})`,
  );

  return {
    success: true,
    queued: true,
    name: rec.first_name,
  };
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
    };
  }

  if (op === "validateIscrizioneToken") {
    return validateIscrizioneToken(params.token || "");
  }

  if (op === "getStatoIscrizione") {
    return getStatoIscrizione(params.idIscrizione || "");
  }

  return { success: false, message: `Operazione GET non valida: ${op}` };
}

export async function salvaAggiornamentoAssociatoIscrizione(
  data: EnrollmentFormData,
) {
  if (!isRinnovo(data)) {
    throw new Error("Operazione riservata agli associati già registrati.");
  }
  if (!formText(data.nome) || !formText(data.cognome)) {
    throw new Error("Nome e cognome obbligatori.");
  }
  if (!formText(data.cf)) {
    throw new Error("Codice fiscale obbligatorio.");
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

  const cf = formText(member.tax_code || data.cf).toUpperCase();
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
    tax_code: formText(data.cf).toUpperCase() || null,
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
