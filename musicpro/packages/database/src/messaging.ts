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

export function googleSmtpEnvConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SMTP_USER?.trim() &&
      process.env.GOOGLE_SMTP_APP_PASSWORD?.trim(),
  );
}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export type EmailSendOutcome =
  | { ok: true }
  | { ok: false; error: string; skipped?: boolean };

export type DeliverEmailFn = (item: {
  to: string;
  subject: string;
  body: string;
}) => Promise<EmailSendOutcome>;

export interface SendBulkMessageInput {
  memberIds: string[];
  channel: MessageChannel;
  subject: string;
  body: string;
  templateId?: string | null;
  campaignName?: string;
  createdBy?: string | null;
  /** Riprende una campagna già creata (invio a lotti). */
  campaignId?: string | null;
  /** Invio SMTP/altro se Resend manca. */
  sendEmail?: DeliverEmailFn;
  /** Stop e restituisci i rimanenti (default 80s). */
  timeBudgetMs?: number;
}

export interface SendBulkMessageResult {
  success: boolean;
  sent: number;
  failed: number;
  skipped: number;
  campaignId?: string;
  errorMessage?: string;
  warnings?: string[];
  pendingMemberIds?: string[];
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
  const envFrom =
    process.env.EMAIL_FROM?.trim() ||
    process.env.GOOGLE_SMTP_FROM?.trim() ||
    process.env.BOOKING_EMAIL_FROM?.trim();
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

/**
 * Resend a lotti, altrimenti callback SMTP. Rispetta un deadline per non
 * far scadere la funzione Vercel a metà di centinaia di invii.
 */
async function deliverEmails(
  from: string,
  items: EmailBatchItem[],
  fallback: DeliverEmailFn | undefined,
  deadlineMs: number,
): Promise<{
  outcomes: Map<string, EmailSendOutcome>;
  pendingIds: string[];
}> {
  const outcomes = new Map<string, EmailSendOutcome>();
  const pendingIds: string[] = [];
  if (items.length === 0) return { outcomes, pendingIds };

  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    if (!fallback) {
      for (const item of items) {
        outcomes.set(item.memberId, {
          ok: false,
          skipped: true,
          error: "Nessun trasporto email configurato",
        });
      }
      return { outcomes, pendingIds };
    }

    for (let i = 0; i < items.length; i++) {
      if (Date.now() >= deadlineMs) {
        pendingIds.push(...items.slice(i).map((item) => item.memberId));
        break;
      }
      const item = items[i]!;
      outcomes.set(
        item.memberId,
        await fallback({
          to: item.to,
          subject: item.subject,
          body: item.body,
        }),
      );
    }
    return { outcomes, pendingIds };
  }

  for (const chunk of chunkArray(items, RESEND_BATCH_CHUNK)) {
    if (Date.now() >= deadlineMs) {
      pendingIds.push(...chunk.map((item) => item.memberId));
      continue;
    }

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
      if (Date.now() >= deadlineMs) {
        pendingIds.push(item.memberId);
        continue;
      }
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

  return { outcomes, pendingIds };
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
  if (input.channel === "email") {
    if (!resendConfigured() && !input.sendEmail) {
      return {
        success: false,
        sent: 0,
        failed: 0,
        skipped: 0,
        errorMessage:
          "Nessun trasporto email. Configura GOOGLE_SMTP_USER / GOOGLE_SMTP_APP_PASSWORD (già usati per l'iscrizione) oppure RESEND_API_KEY.",
      };
    }
    if (!resendConfigured() && input.sendEmail) {
      warnings.push("Invio via SMTP Google Workspace (Resend non è configurato).");
    }
  }
  if (input.channel === "telegram" && !process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    warnings.push(
      "TELEGRAM_BOT_TOKEN assente: i messaggi Telegram verranno conteggiati come saltati.",
    );
  }

  const existingCampaignId = input.campaignId?.trim() || "";
  let campaignId = existingCampaignId;

  if (!campaignId) {
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

    campaignId = campaign.id;

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
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let pendingMemberIds: string[] = [];
  const deadlineMs = Date.now() + Math.max(5_000, input.timeBudgetMs ?? 80_000);

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

    const { outcomes, pendingIds } = await deliverEmails(
      emailFrom,
      toSend,
      input.sendEmail,
      deadlineMs,
    );
    pendingMemberIds = pendingIds;
    const pendingSet = new Set(pendingIds);
    const sentIds: string[] = [];
    const errorsByMessage = new Map<string, string[]>();

    function recordError(memberId: string, message: string) {
      const list = errorsByMessage.get(message) ?? [];
      list.push(memberId);
      errorsByMessage.set(message, list);
    }

    for (const item of toSend) {
      if (pendingSet.has(item.memberId)) continue;
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
    const telegramQueue = members.filter((member) => {
      if (member.telegram_chat_id?.trim()) return true;
      skipped += 1;
      skippedIds.push(member.id);
      return false;
    });

    if (skippedIds.length > 0) {
      await markRecipients(client, campaignId, skippedIds, {
        error_message: "Telegram chat ID mancante",
      });
    }

    for (let i = 0; i < telegramQueue.length; i++) {
      if (Date.now() >= deadlineMs) {
        pendingMemberIds = telegramQueue.slice(i).map((m) => m.id);
        break;
      }
      const member = telegramQueue[i]!;
      const ctx: PlaceholderContext = {
        firstName: member.first_name,
        lastName: member.last_name,
        memberNumber: member.member_number,
      };
      const personalizedBody = applyMessagePlaceholders(body, ctx);
      const result = await sendTelegramMessage(
        member.telegram_chat_id!.trim(),
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
  }

  const stillSending = pendingMemberIds.length > 0;
  await client
    .from("message_campaigns")
    .update(
      stillSending
        ? { status: "sending" }
        : {
            status: "sent",
            sent_at: new Date().toISOString(),
          },
    )
    .eq("id", campaignId);

  return {
    success: true,
    sent,
    failed,
    skipped,
    campaignId,
    pendingMemberIds: stillSending ? pendingMemberIds : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
