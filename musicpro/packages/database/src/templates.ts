import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

type TemplatesClient = SupabaseClient<Database>;

export type MessageTemplateChannel = "email" | "telegram" | "sms";

export interface MessageTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  channel: MessageTemplateChannel;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageTemplateInput = {
  name: string;
  subject: string;
  body: string;
  channel?: MessageTemplateChannel;
  createdBy?: string | null;
};

export interface TemplateMutationResult {
  success: boolean;
  id?: string;
  errorMessage?: string;
}

type TemplateRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  channel: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const TEMPLATE_COLUMNS =
  "id, name, subject, body, channel, created_by, created_at, updated_at";

function normalizeChannel(value: string): MessageTemplateChannel {
  if (value === "telegram" || value === "sms") return value;
  return "email";
}

function mapTemplate(row: TemplateRow): MessageTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    body: row.body,
    channel: normalizeChannel(row.channel),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateTemplateInput(input: MessageTemplateInput): string | null {
  const name = input.name.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();

  if (!name) return "Il nome del modello è obbligatorio.";
  if (!subject) return "L'oggetto è obbligatorio.";
  if (!body) return "Il testo del messaggio è obbligatorio.";
  if (name.length > 120) return "Il nome non può superare i 120 caratteri.";

  return null;
}

export async function listMessageTemplates(
  client: TemplatesClient,
): Promise<MessageTemplate[]> {
  const { data, error } = await client
    .from("message_templates")
    .select(TEMPLATE_COLUMNS)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Impossibile caricare i modelli: ${error.message}`);
  }

  return (data ?? []).map((row) => mapTemplate(row as TemplateRow));
}

export async function getMessageTemplateById(
  client: TemplatesClient,
  id: string,
): Promise<MessageTemplate | null> {
  const { data, error } = await client
    .from("message_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare il modello: ${error.message}`);
  }

  return data ? mapTemplate(data as TemplateRow) : null;
}

export async function createMessageTemplate(
  client: TemplatesClient,
  input: MessageTemplateInput,
): Promise<TemplateMutationResult> {
  const validationError = validateTemplateInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const { data, error } = await client
    .from("message_templates")
    .insert({
      name: input.name.trim(),
      subject: input.subject.trim(),
      body: input.body.trim(),
      channel: input.channel ?? "email",
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        errorMessage: "Esiste già un modello con questo nome.",
      };
    }
    return {
      success: false,
      errorMessage: error.message || "Impossibile creare il modello.",
    };
  }

  return { success: true, id: data.id };
}

export async function updateMessageTemplate(
  client: TemplatesClient,
  id: string,
  input: MessageTemplateInput,
): Promise<TemplateMutationResult> {
  const validationError = validateTemplateInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const { error } = await client
    .from("message_templates")
    .update({
      name: input.name.trim(),
      subject: input.subject.trim(),
      body: input.body.trim(),
      channel: input.channel ?? "email",
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        errorMessage: "Esiste già un modello con questo nome.",
      };
    }
    return {
      success: false,
      errorMessage: error.message || "Impossibile aggiornare il modello.",
    };
  }

  return { success: true, id };
}

export async function deleteMessageTemplate(
  client: TemplatesClient,
  id: string,
): Promise<TemplateMutationResult> {
  const { error } = await client.from("message_templates").delete().eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile eliminare il modello.",
    };
  }

  return { success: true, id };
}
