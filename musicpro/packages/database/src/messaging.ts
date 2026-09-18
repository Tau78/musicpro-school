import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

type MessagingClient = SupabaseClient<Database>;

export type MessageChannel = "email" | "telegram";

export interface PlaceholderContext {
  firstName: string;
  lastName: string;
  memberNumber: number | null;
}

/**
 * PostgREST `.in()` is a GET query-string. Too many UUIDs → HTTP 400 "Bad Request"
 * (URL over ~8KB). Keep chunks well under that.
 */
export const POSTGREST_IN_CHUNK = 50;
const RECIPIENT_INSERT_CHUNK = 100;
const RESEND_BATCH_CHUNK = 100;

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  const n = Math.max(1, size);
  for (let i = 0; i < items.length; i += n) {
    chunks.push(items.slice(i, i + n));
  }
  return chunks;
}

export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function publicDbError(
  error: { message?: string; details?: string } | null | undefined,
  fallback: string,
): string {
  const message = error?.message?.trim() ?? "";
  const details = error?.details?.trim() ?? "";
  const combined = [message, details].filter(Boolean).join(" — ");
  if (!combined) return fallback;
  if (/bad request/i.test(combined)) {
    return `${fallback} Elenco destinatari troppo lungo per una sola richiesta.`;
  }
  return combined;
}

export interface SendBulkMessageInput {
  memberIds: string[];
  channel: MessageChannel;
  subject: string;
  body: string;
  templateId?: string | null;
  campaignName?: string;
  createdBy?: string | null;
}

export interface SendBulkMessageResult {
  success: boolean;
  sent: number;
  failed: number;
  skipped: number;
  campaignId?: string;
  errorMessage?: string;
  warnings?: string[];
}

type MemberSendRow = {
  id: string;
  first_name: string;
  last_name: string;
  member_number: number | null;
  email: string | null;
  telegram_chat_id: string | null;
};

/**
 * Sostituisce i segnaposto GAS e varianti inglesi.
 */
export function applyMessagePlaceholders(
  text: string,
  ctx: PlaceholderContext,
): string {
  const numero = ctx.memberNumber != null ? String(ctx.memberNumber) : "";
  return text
    .replace(/\{\{nome\}\}/gi, ctx.firstName)
    .replace(/\{\{cognome\}\}/gi, ctx.lastName)
    .replace(/\{\{numero\}\}/gi, numero)
    .replace(/\{\{first_name\}\}/gi, ctx.firstName)
    .replace(/\{\{last_name\}\}/gi, ctx.lastName)
    .replace(/\{\{member_number\}\}/gi, numero);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\r\n|\r|\n/g, "<br />");
}

async function resolveEmailFrom(
  client: MessagingClient,
): Promise<string> {
  const envFrom = process.env.EMAIL_FROM?.trim() || process.env.BOOKING_EMAIL_FROM?.trim();
  if (envFrom) return envFrom;

  const { data } = await client
    .from("app_settings")
    .select("value")
    .eq("key", "segreteria_email")
    .maybeSingle();

  const segreteria = data?.value?.trim();
  if (segreteria) {
    if (segreteria.includes("<")) return segreteria;
    return `MusicPro School <${segreteria}>`;
  }

  return "MusicPro School <noreply@school.musicproeventi.it>";
}

export type EmailAttachment = {
  filename: string;
  contentBase64: string;
};

async function sendEmailViaResend(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
}): Promise<{ ok: true } | { ok: false; error: string; skipped?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      skipped: true,
      error: "RESEND_API_KEY non configurata",
    };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      text: params.body,
      html: textToHtml(params.body),
      ...(params.attachments?.length
        ? {
            attachments: params.attachments.map((file) => ({
              filename: file.filename,
              content: file.contentBase64,
            })),
          }
        : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error: `Resend ${res.status}: ${body.slice(0, 400)}`,
    };
  }

  return { ok: true };
}

type EmailBatchItem = {
  memberId: string;
  to: string;
  subject: string;
  body: string;
};

type EmailSendOutcome = { ok: true } | { ok: false; error: string; skipped?: boolean };

/**
 * Fino a 100 email per chiamata. Se il batch intero fallisce (es. un indirizzo
 * invalido), riprova i singoli della stessa fetta.
 */
async function sendEmailBatchViaResend(
  from: string,
  items: EmailBatchItem[],
): Promise<Map<string, EmailSendOutcome>> {
  const outcomes = new Map<string, EmailSendOutcome>();
  if (items.length === 0) return outcomes;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    for (const item of items) {
      outcomes.set(item.memberId, {
        ok: false,
        skipped: true,
        error: "RESEND_API_KEY non configurata",
      });
    }
    return outcomes;
  }

  for (const chunk of chunkArray(items, RESEND_BATCH_CHUNK)) {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        chunk.map((item) => ({
          from,
          to: [item.to],
          subject: item.subject,
          text: item.body,
          html: textToHtml(item.body),
        })),
      ),
    });

    if (res.ok) {
      for (const item of chunk) {
        outcomes.set(item.memberId, { ok: true });
      }
      continue;
    }

    for (const item of chunk) {
      outcomes.set(
        item.memberId,
        await sendEmailViaResend({
          from,
          to: item.to,
          subject: item.subject,
          body: item.body,
        }),
      );
    }
  }

  return outcomes;
}

async function fetchMembersForSend(
  client: MessagingClient,
  memberIds: string[],
): Promise<{ members: MemberSendRow[]; errorMessage?: string }> {
  const members: MemberSendRow[] = [];
  for (const chunk of chunkArray(memberIds, POSTGREST_IN_CHUNK)) {
    const { data, error } = await client
      .from("members")
      .select("id, first_name, last_name, member_number, email, telegram_chat_id")
      .in("id", chunk);
    if (error) {
      return {
        members: [],
        errorMessage: publicDbError(
          error,
          "Impossibile caricare i destinatari.",
        ),
      };
    }
    members.push(...((data ?? []) as MemberSendRow[]));
  }
  return { members };
}

async function insertRecipients(
  client: MessagingClient,
  rows: Array<{
    campaign_id: string;
    member_id: string;
    email: string | null;
    telegram_chat_id: string | null;
  }>,
): Promise<{ errorMessage?: string }> {
  for (const chunk of chunkArray(rows, RECIPIENT_INSERT_CHUNK)) {
    const { error } = await client
      .from("message_campaign_recipients")
      .insert(chunk);
    if (error) {
      return {
        errorMessage: publicDbError(
          error,
          "Impossibile salvare i destinatari della campagna.",
        ),
      };
    }
  }
  return {};
}

async function markRecipients(
  client: MessagingClient,
  campaignId: string,
  memberIds: string[],
  patch: { sent_at?: string; error_message?: string | null },
) {
  for (const chunk of chunkArray(memberIds, POSTGREST_IN_CHUNK)) {
    await client
      .from("message_campaign_recipients")
      .update(patch)
      .eq("campaign_id", campaignId)
      .in("member_id", chunk);
  }
}

export type SendSingleEmailInput = {
  to: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
};

export type SendSingleEmailResult =
  | { ok: true }
  | { ok: false; error: string; skipped?: boolean };

/**
 * Invio email singolo via Resend (niente campagna). Se manca la chiave, skipped.
 */
export async function sendSingleEmail(
  client: MessagingClient,
  input: SendSingleEmailInput,
): Promise<SendSingleEmailResult> {
  const to = input.to.trim();
  if (!to) {
    return { ok: false, skipped: true, error: "Destinatario email mancante." };
  }
  const from = await resolveEmailFrom(client);
  return sendEmailViaResend({
    from,
    to,
    subject: input.subject,
    body: input.body,
    attachments: input.attachments,
  });
}

/** Due invii To distinti: tutore e allievo. Niente BCC. */
export async function sendLessonFamilyEmail(
  client: MessagingClient,
  memberId: string,
  input: {
    subject: string;
    body: string;
    attachments?: EmailAttachment[];
  },
): Promise<{ sent: number; skipped: number; warnings: string[] }> {
  const { data: member, error } = await client
    .from("members")
    .select("email, first_name, manual_tutor_email, manual_tutor_first_name")
    .eq("id", memberId)
    .maybeSingle();

  const warnings: string[] = [];
  if (error) {
    return { sent: 0, skipped: 0, warnings: [error.message] };
  }
  if (!member) {
    return { sent: 0, skipped: 0, warnings: ["Associato non trovato."] };
  }

  const addresses = new Set<string>();
  const tutor = member.manual_tutor_email?.trim().toLowerCase() ?? "";
  const own = member.email?.trim().toLowerCase() ?? "";
  if (tutor) addresses.add(tutor);
  if (own) addresses.add(own);

  if (addresses.size === 0) {
    return { sent: 0, skipped: 1, warnings: ["Nessuna email famiglia."] };
  }

  let sent = 0;
  let skipped = 0;
  for (const to of addresses) {
    const result = await sendSingleEmail(client, {
      to,
      subject: input.subject,
      body: input.body,
      attachments: input.attachments,
    });
    if (result.ok) sent += 1;
    else {
      skipped += 1;
      warnings.push(result.error);
    }
  }
  return { sent, skipped, warnings };
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string; skipped?: boolean }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return {
      ok: false,
      skipped: true,
      error: "TELEGRAM_BOT_TOKEN non configurato",
    };
  }

  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error: `Telegram ${res.status}: ${body.slice(0, 400)}`,
    };
  }

  const payload = (await res.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
  } | null;

  if (!payload?.ok) {
    return {
      ok: false,
      error: payload?.description || "Invio Telegram fallito",
    };
  }

  return { ok: true };
}

/**
 * Crea campagna + destinatari e invia email/Telegram personalizzati.
 */
export async function sendBulkMessages(
  client: MessagingClient,
  input: SendBulkMessageInput,
): Promise<SendBulkMessageResult> {
  const memberIds = Array.from(new Set(input.memberIds.filter(Boolean)));
  const subject = input.subject.trim();
  const body = input.body.trim();

  if (memberIds.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      errorMessage: "Nessun destinatario selezionato.",
    };
  }

  if (!body) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      errorMessage: "Il testo del messaggio è obbligatorio.",
    };
  }

  if (input.channel === "email" && !subject) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      errorMessage: "L'oggetto email è obbligatorio.",
    };
  }

  const loaded = await fetchMembersForSend(client, memberIds);
  if (loaded.errorMessage) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      errorMessage: loaded.errorMessage,
    };
  }

  const members = loaded.members;
  if (members.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      errorMessage: "Nessun associato trovato per gli ID selezionati.",
    };
  }

  const warnings: string[] = [];
  if (input.channel === "email" && !process.env.RESEND_API_KEY?.trim()) {
    warnings.push(
      "RESEND_API_KEY assente: le email verranno conteggiate come saltate.",
    );
  }
  if (input.channel === "telegram" && !process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    warnings.push(
      "TELEGRAM_BOT_TOKEN assente: i messaggi Telegram verranno conteggiati come saltati.",
    );
  }

  const campaignName =
    input.campaignName?.trim() ||
    `Messaggio ${input.channel} ${new Date().toLocaleString("it-IT")}`;

  const { data: campaign, error: campaignError } = await client
    .from("message_campaigns")
    .insert({
      template_id: input.templateId ?? null,
      name: campaignName,
      subject: subject || "(Telegram)",
      body,
      audiences: ["associati"],
      audience_filter: {
        channel: input.channel,
        member_count: memberIds.length,
      },
      status: "sending",
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      errorMessage: publicDbError(
        campaignError,
        "Impossibile creare la campagna messaggi.",
      ),
    };
  }

  const campaignId = campaign.id;

  const recipientRows = members.map((m) => ({
    campaign_id: campaignId,
    member_id: m.id,
    email: m.email,
    telegram_chat_id: m.telegram_chat_id,
  }));

  const inserted = await insertRecipients(client, recipientRows);
  if (inserted.errorMessage) {
    await client
      .from("message_campaigns")
      .update({ status: "cancelled" })
      .eq("id", campaignId);

    return {
      success: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      campaignId,
      errorMessage: inserted.errorMessage,
    };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  if (input.channel === "email") {
    const emailFrom = await resolveEmailFrom(client);
    const skippedIds: string[] = [];
    const toSend: EmailBatchItem[] = [];

    for (const member of members) {
      const email = member.email?.trim() ?? "";
      if (!email || !isPlausibleEmail(email)) {
        skipped += 1;
        skippedIds.push(member.id);
        continue;
      }
      const ctx: PlaceholderContext = {
        firstName: member.first_name,
        lastName: member.last_name,
        memberNumber: member.member_number,
      };
      toSend.push({
        memberId: member.id,
        to: email,
        subject: applyMessagePlaceholders(subject, ctx),
        body: applyMessagePlaceholders(body, ctx),
      });
    }

    if (skippedIds.length > 0) {
      await markRecipients(client, campaignId, skippedIds, {
        error_message: "Email mancante o non valida",
      });
    }

    const outcomes = await sendEmailBatchViaResend(emailFrom, toSend);
    const sentIds: string[] = [];
    const errorsByMessage = new Map<string, string[]>();

    function recordError(memberId: string, message: string) {
      const list = errorsByMessage.get(message) ?? [];
      list.push(memberId);
      errorsByMessage.set(message, list);
    }

    for (const item of toSend) {
      const result = outcomes.get(item.memberId);
      if (!result) {
        failed += 1;
        recordError(item.memberId, "Esito invio assente");
        continue;
      }
      if (result.ok) {
        sent += 1;
        sentIds.push(item.memberId);
      } else if (result.skipped) {
        skipped += 1;
        recordError(item.memberId, result.error);
      } else {
        failed += 1;
        recordError(item.memberId, result.error);
      }
    }

    if (sentIds.length > 0) {
      await markRecipients(client, campaignId, sentIds, {
        sent_at: new Date().toISOString(),
        error_message: null,
      });
    }
    for (const [error_message, ids] of errorsByMessage) {
      await markRecipients(client, campaignId, ids, { error_message });
    }
  } else {
    const skippedIds: string[] = [];
    for (const member of members) {
      const ctx: PlaceholderContext = {
        firstName: member.first_name,
        lastName: member.last_name,
        memberNumber: member.member_number,
      };
      const personalizedBody = applyMessagePlaceholders(body, ctx);

      if (!member.telegram_chat_id?.trim()) {
        skipped += 1;
        skippedIds.push(member.id);
        continue;
      }

      const result = await sendTelegramMessage(
        member.telegram_chat_id.trim(),
        personalizedBody,
      );

      if (result.ok) {
        sent += 1;
        await client
          .from("message_campaign_recipients")
          .update({
            sent_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("campaign_id", campaignId)
          .eq("member_id", member.id);
      } else if (result.skipped) {
        skipped += 1;
        await client
          .from("message_campaign_recipients")
          .update({ error_message: result.error })
          .eq("campaign_id", campaignId)
          .eq("member_id", member.id);
      } else {
        failed += 1;
        await client
          .from("message_campaign_recipients")
          .update({ error_message: result.error })
          .eq("campaign_id", campaignId)
          .eq("member_id", member.id);
      }
    }
    if (skippedIds.length > 0) {
      await markRecipients(client, campaignId, skippedIds, {
        error_message: "Telegram chat ID mancante",
      });
    }
  }

  await client
    .from("message_campaigns")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return {
    success: true,
    sent,
    failed,
    skipped,
    campaignId,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
