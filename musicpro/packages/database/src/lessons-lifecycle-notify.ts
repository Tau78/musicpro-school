import type { SupabaseClient } from "@supabase/supabase-js";

import { sendLessonFamilyEmail, sendSingleEmail } from "./messaging";
import type { Database } from "./types/database";

type NotifyClient = SupabaseClient<Database>;

export type LifecycleNotifyKind =
  | "pause"
  | "resume"
  | "close"
  | "remove_enrollment"
  | "close_request"
  | "undo";

export type LifecycleAccountingLine = {
  studentLabel: string;
  creditBalance: number;
  leftoverEurFamily: number;
  openFeesEur: number;
  openFeeCount: number;
};

export type CourseLifecycleNotifyInput = {
  kind: LifecycleNotifyKind;
  courseId: string;
  courseName: string;
  actorLabel: string;
  closedOn?: string | null;
  studentLabels?: string[];
  accounting?: LifecycleAccountingLine[];
  note?: string | null;
  familyMemberIds?: string[];
};

function formatEur(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatCredits(value: number): string {
  const abs = Math.abs(value);
  const noun = abs === 1 ? "lezione" : "lezioni";
  if (value < 0) return `debito ${abs} ${noun}`;
  return `${value} ${noun}`;
}

function accountingBlock(rows: LifecycleAccountingLine[]): string {
  if (rows.length === 0) {
    return "Nessun iscritto attivo o rette aperte.";
  }
  return rows
    .map((row) => {
      const fees =
        row.openFeeCount > 0
          ? `${row.openFeeCount} rette aperte (${formatEur(row.openFeesEur)})`
          : "nessuna retta aperta";
      const leftover =
        row.leftoverEurFamily > 0
          ? `, residuo famiglia ${formatEur(row.leftoverEurFamily)}`
          : "";
      return `• ${row.studentLabel}: wallet ${formatCredits(row.creditBalance)}, ${fees}${leftover}`;
    })
    .join("\n");
}

function staffCopy(input: CourseLifecycleNotifyInput): {
  subject: string;
  body: string;
} {
  const course = input.courseName.trim() || "Corso";
  const who = input.actorLabel.trim() || "Operatore";
  const students =
    input.studentLabels && input.studentLabels.length > 0
      ? input.studentLabels.join(", ")
      : "—";

  switch (input.kind) {
    case "pause":
      return {
        subject: `Coda lezioni: ${course} in pausa`,
        body: `${who} ha messo in pausa «${course}».\nLe lezioni future sono state cancellate e le sale liberate.\nIscritti: ${students}`,
      };
    case "resume":
      return {
        subject: `Coda lezioni: ${course} ripreso`,
        body: `${who} ha ripreso «${course}».\nLe lezioni future sono state rigenerate dove la sala era libera (altrimenti da piazzare).`,
      };
    case "close":
      return {
        subject: `Coda lezioni: ${course} chiuso`,
        body: `${who} ha chiuso «${course}»${input.closedOn ? ` il ${input.closedOn}` : ""}.\nIscritti: ${students}\n\nSituazione contabile (anche con saldo aperto):\n${accountingBlock(input.accounting ?? [])}`,
      };
    case "remove_enrollment":
      return {
        subject: `Coda lezioni: uscita da ${course}`,
        body: `${who} ha rimosso ${students} da «${course}».\n\nSituazione contabile:\n${accountingBlock(input.accounting ?? [])}`,
      };
    case "close_request":
      return {
        subject: `Coda lezioni: richiesta chiusura ${course}`,
        body: `${who} chiede di chiudere «${course}».\n${input.note?.trim() ? `Nota: ${input.note.trim()}\n` : ""}Apri la Coda lezioni per chiudere o scartare.`,
      };
    case "undo":
      return {
        subject: `Coda lezioni: annullata un’azione su ${course}`,
        body: `${who} ha annullato l’ultima azione di ciclo vita su «${course}» (entro 24h).`,
      };
  }
}

function familyCopy(input: CourseLifecycleNotifyInput): {
  subject: string;
  body: string;
} | null {
  const course = input.courseName.trim() || "corso";
  if (input.kind === "close") {
    return {
      subject: `Corso chiuso: ${course}`,
      body: `Il corso «${course}» è stato chiuso${input.closedOn ? ` il ${input.closedOn}` : ""}.\nPer il saldo o le rette aperte vi contatterà la segreteria.`,
    };
  }
  if (input.kind === "remove_enrollment") {
    return {
      subject: `Uscita dal corso ${course}`,
      body: `L’iscrizione a «${course}» è stata chiusa.\nPer il saldo o le rette aperte vi contatterà la segreteria.`,
    };
  }
  return null;
}

async function listStaffRecipients(
  client: NotifyClient,
): Promise<{ email: string; label: string }[]> {
  const { data, error } = await client.rpc("list_lesson_staff_emails");
  if (error) return [];
  return (data ?? [])
    .map((row) => ({
      email: row.email?.trim() ?? "",
      label: row.label?.trim() || "Staff",
    }))
    .filter((row) => row.email);
}

export async function notifyCourseLifecycle(
  client: NotifyClient,
  input: CourseLifecycleNotifyInput,
): Promise<void> {
  const staff = staffCopy(input);
  const recipients = await listStaffRecipients(client);
  for (const recipient of recipients) {
    await sendSingleEmail(client, {
      to: recipient.email,
      subject: staff.subject,
      body: staff.body,
    });
  }

  const family = familyCopy(input);
  if (!family || !input.familyMemberIds?.length) return;

  for (const memberId of input.familyMemberIds) {
    await sendLessonFamilyEmail(client, memberId, {
      subject: family.subject,
      body: family.body,
    });
  }
}
