import {
  emailDomainError,
  normalizeInviteEmail,
  normalizePersonName,
  type Database,
} from "@musicpro/database";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureMemberAuthAccess } from "@/lib/admin/staff-auth";
import { authPublicOrigin } from "@/lib/auth/redirect-url";
import { sendEnrollmentEmail } from "@/lib/iscrizione/email-transport";
import { createIscrizioneMagicLink } from "@/lib/iscrizione/enrollment-service";

type Db = SupabaseClient<Database>;

export type CompanionGuestInput = {
  firstName: string;
  lastName: string;
  email: string;
};

export type CompanionInviteResult = {
  firstName: string;
  lastName: string;
  email: string;
  path: "existing_member" | "enrollment" | null;
  sent: boolean;
  inviteId?: string;
  message: string;
};

type MemberMatch = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
};

const ENROLLMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEDUPE_MS = 30 * 60 * 1000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bookerLabel(first: string, last: string): string {
  return `${first} ${last}`.trim() || "un associato MusicPro";
}

async function findMemberByFullName(
  db: Db,
  firstName: string,
  lastName: string,
): Promise<MemberMatch | null> {
  const first = normalizePersonName(firstName);
  const last = normalizePersonName(lastName);
  if (!first || !last) return null;

  const { data, error } = await db
    .from("members")
    .select("id, first_name, last_name, email")
    .limit(3000);

  if (error) {
    throw new Error(error.message);
  }

  return (
    (data ?? []).find(
      (row) =>
        normalizePersonName(row.first_name) === first &&
        normalizePersonName(row.last_name) === last,
    ) ?? null
  );
}

async function recentlySent(
  db: Db,
  invitedByMemberId: string,
  email: string,
): Promise<boolean> {
  const since = new Date(Date.now() - DEDUPE_MS).toISOString();
  const { data } = await db
    .from("booking_companion_invites")
    .select("id")
    .eq("invited_by_member_id", invitedByMemberId)
    .eq("email", email)
    .eq("status", "sent")
    .gte("created_at", since)
    .limit(1);
  return (data ?? []).length > 0;
}

async function insertInvite(
  db: Db,
  row: Database["public"]["Tables"]["booking_companion_invites"]["Insert"],
): Promise<string | undefined> {
  const { data, error } = await db
    .from("booking_companion_invites")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    console.error("[companion-invites] insert", error.message);
    return undefined;
  }
  return data.id;
}

async function createEnrollmentDraft(
  db: Db,
  firstName: string,
  lastName: string,
  email: string,
): Promise<string> {
  const { data, error } = await db
    .from("members")
    .insert({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email,
      is_enrollment_draft: true,
      member_number: null,
      is_active: true,
      draft_expires_at: new Date(Date.now() + ENROLLMENT_TTL_MS).toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Impossibile creare la bozza iscrizione.");
  }
  return data.id;
}

async function sendExistingMemberEmail(params: {
  to: string;
  firstName: string;
  bookerName: string;
  loginUrl: string;
}): Promise<{ sent: boolean; error?: string }> {
  const subject = "Quota associativa MusicPro — accedi alla tua area";
  const text = [
    `Ciao ${params.firstName},`,
    "",
    `${params.bookerName} ti ha indicato come persona che entra in sala prove.`,
    "Accedi alla tua area associato per versare la quota (se non è in regola) e controllare che i dati siano aggiornati:",
    params.loginUrl,
    "",
    "Se non ti aspettavi questo messaggio, puoi ignorarlo.",
    "",
    "MusicPro School",
  ].join("\n");
  const html = `<!DOCTYPE html>
<html lang="it"><body style="font-family:sans-serif;color:#1a1a1a;padding:24px;">
<p>Ciao ${escapeHtml(params.firstName)},</p>
<p>${escapeHtml(params.bookerName)} ti ha indicato come persona che entra in sala prove.</p>
<p>Accedi alla tua area associato per versare la quota (se non è in regola) e controllare che i dati siano aggiornati.</p>
<p><a href="${escapeHtml(params.loginUrl)}" style="display:inline-block;background:#0b3d5c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;">Apri area associato</a></p>
<p style="color:#6b7280;font-size:13px;">Se non ti aspettavi questo messaggio, puoi ignorarlo.</p>
</body></html>`;

  return sendEnrollmentEmail({
    to: [params.to],
    subject,
    text,
    html,
    preferGoogleSmtp: true,
  });
}

async function sendEnrollmentRequestEmail(params: {
  to: string;
  firstName: string;
  bookerName: string;
  enrollUrl: string;
}): Promise<{ sent: boolean; error?: string }> {
  const subject = "Iscrizione MusicPro — completa i dati";
  const text = [
    `Ciao ${params.firstName},`,
    "",
    `${params.bookerName} ti ha indicato per entrare in sala prove.`,
    "Non risulti ancora in anagrafica: completa l'iscrizione da questo link (modulo precompilato, modificabile):",
    params.enrollUrl,
    "",
    "Il link è valido 7 giorni.",
    "",
    "MusicPro School",
  ].join("\n");
  const html = `<!DOCTYPE html>
<html lang="it"><body style="font-family:sans-serif;color:#1a1a1a;padding:24px;">
<p>Ciao ${escapeHtml(params.firstName)},</p>
<p>${escapeHtml(params.bookerName)} ti ha indicato per entrare in sala prove.</p>
<p>Completa l'iscrizione da questo link (i campi sono precompilati e modificabili).</p>
<p><a href="${escapeHtml(params.enrollUrl)}" style="display:inline-block;background:#0b3d5c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;">Completa iscrizione</a></p>
<p style="color:#6b7280;font-size:13px;">Il link è valido 7 giorni.</p>
</body></html>`;

  return sendEnrollmentEmail({
    to: [params.to],
    subject,
    text,
    html,
    preferGoogleSmtp: true,
  });
}

async function magicLinkToAssociateArea(
  db: Db,
  email: string,
): Promise<string> {
  const origin = authPublicOrigin(process.env);
  const next = "/dashboard/impostazioni";
  const { data, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data) {
    throw new Error(error?.message || "Impossibile generare il magic link.");
  }

  const hashedToken =
    data.properties?.hashed_token?.trim() ||
    data.properties?.email_otp?.trim() ||
    "";
  if (hashedToken) {
    return `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&next=${encodeURIComponent(next)}`;
  }
  const action = data.properties?.action_link?.trim();
  if (!action) {
    throw new Error("Magic link associato non disponibile.");
  }
  return action;
}

export function parseCompanionGuests(
  raw: CompanionGuestInput[],
): { guests: CompanionGuestInput[]; errors: string[] } {
  const guests: CompanionGuestInput[] = [];
  const errors: string[] = [];

  raw.forEach((row, index) => {
    const firstName = row.firstName.trim();
    const lastName = row.lastName.trim();
    const email = normalizeInviteEmail(row.email);
    const empty = !firstName && !lastName && !email;
    if (empty) return;

    const label = `Riga ${index + 1}`;
    if (!firstName || !lastName) {
      errors.push(`${label}: nome e cognome obbligatori.`);
    }
    const domainError = emailDomainError(row.email);
    if (domainError) {
      errors.push(`${label}: ${domainError}`);
    }
    if (firstName && lastName && !domainError) {
      guests.push({ firstName, lastName, email });
    }
  });

  return { guests, errors };
}

export async function sendCompanionInvites(params: {
  db: Db;
  invitedByMemberId: string;
  bookerFirstName: string;
  bookerLastName: string;
  guests: CompanionGuestInput[];
}): Promise<CompanionInviteResult[]> {
  const bookerName = bookerLabel(params.bookerFirstName, params.bookerLastName);
  const results: CompanionInviteResult[] = [];

  for (const guest of params.guests) {
    try {
      if (await recentlySent(params.db, params.invitedByMemberId, guest.email)) {
        results.push({
          ...guest,
          path: null,
          sent: true,
          message: "Email già inviata di recente.",
        });
        continue;
      }

      const match = await findMemberByFullName(
        params.db,
        guest.firstName,
        guest.lastName,
      );

      if (match) {
        const auth = await ensureMemberAuthAccess(params.db, match.id, {
          email: guest.email,
        });
        if (auth.status === "invalid_email" || auth.status === "no_email") {
          throw new Error("Email non valida per l'accesso associato.");
        }
        const loginUrl = await magicLinkToAssociateArea(params.db, guest.email);
        const mail = await sendExistingMemberEmail({
          to: guest.email,
          firstName: guest.firstName,
          bookerName,
          loginUrl,
        });
        const inviteId = await insertInvite(params.db, {
          invited_by_member_id: params.invitedByMemberId,
          first_name: guest.firstName,
          last_name: guest.lastName,
          email: guest.email,
          path: "existing_member",
          matched_member_id: match.id,
          status: mail.sent ? "sent" : "failed",
          error: mail.sent ? null : mail.error ?? "Invio email fallito",
        });
        results.push({
          ...guest,
          path: "existing_member",
          sent: mail.sent,
          inviteId,
          message: mail.sent
            ? "Inviato magic link all'area associato."
            : mail.error ?? "Invio email fallito.",
        });
        continue;
      }

      const draftId = await createEnrollmentDraft(
        params.db,
        guest.firstName,
        guest.lastName,
        guest.email,
      );
      const enrollUrl = await createIscrizioneMagicLink(
        params.db,
        guest.email,
        ENROLLMENT_TTL_MS,
        draftId,
      );
      const mail = await sendEnrollmentRequestEmail({
        to: guest.email,
        firstName: guest.firstName,
        bookerName,
        enrollUrl,
      });
      const inviteId = await insertInvite(params.db, {
        invited_by_member_id: params.invitedByMemberId,
        first_name: guest.firstName,
        last_name: guest.lastName,
        email: guest.email,
        path: "enrollment",
        matched_member_id: draftId,
        status: mail.sent ? "sent" : "failed",
        error: mail.sent ? null : mail.error ?? "Invio email fallito",
      });
      results.push({
        ...guest,
        path: "enrollment",
        sent: mail.sent,
        inviteId,
        message: mail.sent
          ? "Inviata richiesta di iscrizione."
          : mail.error ?? "Invio email fallito.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const inviteId = await insertInvite(params.db, {
        invited_by_member_id: params.invitedByMemberId,
        first_name: guest.firstName,
        last_name: guest.lastName,
        email: guest.email,
        path: "enrollment",
        status: "failed",
        error: message,
      });
      results.push({
        ...guest,
        path: null,
        sent: false,
        inviteId,
        message,
      });
    }
  }

  return results;
}

export async function attachCompanionInvitesToBooking(
  db: Db,
  invitedByMemberId: string,
  bookingId: string,
  inviteIds: string[],
): Promise<void> {
  const ids = inviteIds.filter(Boolean);
  if (ids.length === 0) return;

  const { error } = await db
    .from("booking_companion_invites")
    .update({ booking_id: bookingId })
    .eq("invited_by_member_id", invitedByMemberId)
    .in("id", ids)
    .is("booking_id", null);

  if (error) {
    console.error("[companion-invites] attach", error.message);
  }
}
