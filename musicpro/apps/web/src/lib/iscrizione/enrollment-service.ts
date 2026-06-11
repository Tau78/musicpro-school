import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@musicpro/database";

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

const MAGIC_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_KEY_PREFIX = "iscrizione_token:";

export interface EnrollmentFormData {
  nome?: string;
  cognome?: string;
  email?: string;
  cf?: string;
  telefono?: string;
  signatureData?: string;
  privacy_accepted?: boolean | string;
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

  const { data: quota } = await db
    .from("member_annual_quotas")
    .select("paid_at")
    .eq("member_id", member.id)
    .eq("fiscal_year", anno)
    .maybeSingle();

  return !!quota?.paid_at;
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

async function storeMagicToken(db: Db, email: string): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString();

  await db.from("app_settings").upsert({
    key: `${TOKEN_KEY_PREFIX}${token}`,
    value: JSON.stringify({ email, expiresAt, usedAt: null }),
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

async function sendMagicLinkEmailStub(email: string, link: string, nome: string) {
  console.info(
    `[iscrizione] Magic link stub → ${email} (${nome}): ${link}`,
  );
}

async function createAndSendMagicLink(db: Db, member: MemberRow) {
  if (!member.email) return false;
  const token = await storeMagicToken(db, member.email);
  const link = `${magicLinkBaseUrl()}?iscrizioneToken=${encodeURIComponent(token)}`;
  const fields = memberToFormFields(member);
  await sendMagicLinkEmailStub(
    member.email,
    link,
    String(fields.nome || "Associato"),
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

export async function validateIscrizioneToken(token: string) {
  const tok = String(token || "").trim();
  if (!tok) return { found: false, message: "Token mancante." };

  const db = createServiceRoleClient();
  const { data: setting } = await db
    .from("app_settings")
    .select("value")
    .eq("key", `${TOKEN_KEY_PREFIX}${tok}`)
    .maybeSingle();

  if (!setting?.value) {
    return { found: false, message: "Link non valido o scaduto." };
  }

  let rowInfo: { email: string; expiresAt: string; usedAt: string | null };
  try {
    rowInfo = JSON.parse(setting.value) as typeof rowInfo;
  } catch {
    return { found: false, message: "Link non valido." };
  }

  if (new Date() > new Date(rowInfo.expiresAt)) {
    return { found: false, message: "Link scaduto. Richiedine uno nuovo." };
  }

  const member = await findMemberByEmail(db, rowInfo.email);
  if (!member) return { found: false, message: "Associato non trovato." };

  const fields = memberToFormFields(member);
  return {
    found: true,
    rinnovo: true,
    nome: fields.nome,
    cognome: fields.cognome,
    fields,
    privacyAccepted: true,
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
  const dup = await valutaDuplicatoIscrizione(db, data);
  if (dup.blocked) {
    return { success: false, code: dup.code, message: dup.message };
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

  if (
    action === "inviaIscrizione" ||
    action === "inviaIscrizioneConPagamento"
  ) {
    return inviaIscrizioneConPagamento(body as EnrollmentFormData);
  }

  return inviaIscrizioneConPagamento(body as EnrollmentFormData);
}
