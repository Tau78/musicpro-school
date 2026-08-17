import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

type BandsClient = SupabaseClient<Database>;

export type BandMemberStatus =
  | "pending_invite"
  | "pending_quota"
  | "active"
  | "expired";

export type BandMemberRole = "founder" | "member";

export type BandInviteStatus = "pending" | "accepted" | "expired" | "revoked";

export type QuotaPaymentItemStatus =
  | "pending"
  | "completed"
  | "failed"
  | "refunded";

export type BandErrorCode =
  | "NOT_AUTHENTICATED"
  | "QUOTA_NOT_PAID"
  | "INVALID_NAME"
  | "INVALID_TOKEN"
  | "INVITE_NOT_FOUND"
  | "INVITE_EXPIRED"
  | "INVITE_REVOKED"
  | "INVITE_ALREADY_ACCEPTED"
  | "EMAIL_MISMATCH"
  | "ALREADY_MEMBER"
  | "NOT_FOUND"
  | "NOT_AUTHORIZED"
  | "FOUNDER_CANNOT_LEAVE"
  | "UNKNOWN";

export interface Band {
  id: string;
  name: string;
  founderMemberId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MyBandSummary extends Band {
  myRole: BandMemberRole;
  myStatus: BandMemberStatus;
  memberCount: number;
  activeMemberCount: number;
  allQuotaOk: boolean;
}

export interface BandMember {
  bandId: string;
  memberId: string;
  status: BandMemberStatus;
  role: BandMemberRole;
  joinedAt: string | null;
  invitedEmail: string | null;
  member?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
}

export interface BandInvite {
  id: string;
  bandId: string;
  email: string;
  token: string;
  status: BandInviteStatus;
  expiresAt: string;
  invitedByMemberId: string;
  createdAt: string;
}

export interface QuotaPayment {
  id: string;
  paidByMemberId: string;
  stripePaymentIntentId: string | null;
  totalAmountEur: number;
  fiscalYear: number;
  createdAt: string;
}

export interface QuotaPaymentItem {
  id: string;
  quotaPaymentId: string;
  memberId: string;
  amountEur: number;
  fiscalYear: number;
  paidByMemberId: string;
  status: QuotaPaymentItemStatus;
}

export interface BandMutationResult {
  success: boolean;
  bandId?: string;
  errorCode?: BandErrorCode;
  errorMessage?: string;
}

export interface AcceptBandInviteResult {
  success: boolean;
  bandId?: string;
  memberStatus?: BandMemberStatus;
  alreadyMember?: boolean;
  errorCode?: BandErrorCode;
  errorMessage?: string;
}

export interface CreateBandInviteResult {
  success: boolean;
  invite?: BandInvite;
  errorMessage?: string;
}

export interface BandInvitePreview {
  id: string;
  bandId: string;
  bandName: string;
  email: string;
  status: BandInviteStatus;
  expiresAt: string;
  expired: boolean;
}

export interface LeaveBandResult {
  success: boolean;
  errorCode?: BandErrorCode;
  errorMessage?: string;
}

const BAND_ERROR_MESSAGES_IT: Record<BandErrorCode, string> = {
  NOT_AUTHENTICATED: "Devi effettuare l'accesso.",
  QUOTA_NOT_PAID:
    "Devi aver pagato la quota associativa per creare una band.",
  INVALID_NAME: "Inserisci un nome valido per la band.",
  INVALID_TOKEN: "Link invito non valido.",
  INVITE_NOT_FOUND: "Invito non trovato o già utilizzato.",
  INVITE_EXPIRED:
    "Questo invito è scaduto. Chiedi un nuovo link al founder.",
  INVITE_REVOKED: "Questo invito è stato revocato.",
  INVITE_ALREADY_ACCEPTED: "Questo invito è già stato accettato.",
  EMAIL_MISMATCH:
    "L'invito è stato inviato a un'altra email. Accedi con l'account corretto.",
  ALREADY_MEMBER: "Sei già membro di questa band.",
  NOT_FOUND: "Band non trovata.",
  NOT_AUTHORIZED: "Non hai i permessi per questa operazione.",
  FOUNDER_CANNOT_LEAVE:
    "Il founder non può abbandonare la band. Trasferisci il ruolo o elimina la band.",
  UNKNOWN: "Si è verificato un errore imprevisto.",
};

const BAND_COLUMNS =
  "id, name, founder_member_id, created_at, updated_at";

const BAND_MEMBER_COLUMNS =
  "band_id, member_id, status, role, joined_at, invited_email";

const BAND_INVITE_COLUMNS =
  "id, band_id, email, token, status, expires_at, invited_by_member_id, created_at";

const INVITE_DEFAULT_TTL_DAYS = 7;

type BandRow = {
  id: string;
  name: string;
  founder_member_id: string;
  created_at: string;
  updated_at: string;
};

type BandMemberRow = {
  band_id: string;
  member_id: string;
  status: BandMemberStatus;
  role: BandMemberRole;
  joined_at: string | null;
  invited_email: string | null;
};

type BandInviteRow = {
  id: string;
  band_id: string;
  email: string;
  token: string;
  status: BandInviteStatus;
  expires_at: string;
  invited_by_member_id: string;
  created_at: string;
};

interface CreateBandSafeResponse {
  success: boolean;
  band_id?: string;
  name?: string;
  error_code?: BandErrorCode;
  error_message?: string;
}

interface AcceptBandInviteSafeResponse {
  success: boolean;
  band_id?: string;
  member_status?: BandMemberStatus;
  already_member?: boolean;
  error_code?: BandErrorCode;
  error_message?: string;
}

interface ListMyBandsResponse {
  success: boolean;
  bands?: Array<{
    band_id: string;
    name: string;
    founder_member_id: string;
    created_at: string;
    updated_at: string;
    my_role: BandMemberRole;
    my_status: BandMemberStatus;
    member_count: number;
    active_member_count: number;
    all_quota_ok: boolean;
  }>;
  error_code?: BandErrorCode;
  error_message?: string;
}

function mapBand(row: BandRow): Band {
  return {
    id: row.id,
    name: row.name,
    founderMemberId: row.founder_member_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBandMember(row: BandMemberRow): BandMember {
  return {
    bandId: row.band_id,
    memberId: row.member_id,
    status: row.status,
    role: row.role,
    joinedAt: row.joined_at,
    invitedEmail: row.invited_email,
  };
}

function mapBandInvite(row: BandInviteRow): BandInvite {
  return {
    id: row.id,
    bandId: row.band_id,
    email: row.email,
    token: row.token,
    status: row.status,
    expiresAt: row.expires_at,
    invitedByMemberId: row.invited_by_member_id,
    createdAt: row.created_at,
  };
}

function defaultInviteExpiresAt(): string {
  const expires = new Date();
  expires.setDate(expires.getDate() + INVITE_DEFAULT_TTL_DAYS);
  return expires.toISOString();
}

export function bandMemberStatusLabel(status: BandMemberStatus): string {
  switch (status) {
    case "pending_invite":
      return "Invito in attesa";
    case "pending_quota":
      return "Quota da versare";
    case "active":
      return "Attivo";
    case "expired":
      return "Quota scaduta";
    default:
      return status;
  }
}

export function bandMemberRoleLabel(role: BandMemberRole): string {
  return role === "founder" ? "Founder" : "Membro";
}

export async function listMyBands(
  client: BandsClient,
): Promise<MyBandSummary[]> {
  const { data, error } = await client.rpc("list_my_bands");

  if (error) {
    throw new Error(`Impossibile caricare le band: ${error.message}`);
  }

  const result = data as ListMyBandsResponse | null;

  if (!result?.success) {
    const code = result?.error_code ?? "UNKNOWN";
    throw new Error(
      result?.error_message ??
        BAND_ERROR_MESSAGES_IT[code] ??
        BAND_ERROR_MESSAGES_IT.UNKNOWN,
    );
  }

  return (result.bands ?? []).map((row) => ({
    id: row.band_id,
    name: row.name,
    founderMemberId: row.founder_member_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    myRole: row.my_role,
    myStatus: row.my_status,
    memberCount: row.member_count,
    activeMemberCount: row.active_member_count,
    allQuotaOk: row.all_quota_ok,
  }));
}

export async function getBand(
  client: BandsClient,
  bandId: string,
): Promise<Band | null> {
  const { data, error } = await client
    .from("bands")
    .select(BAND_COLUMNS)
    .eq("id", bandId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare la band: ${error.message}`);
  }

  if (!data) return null;

  return mapBand(data as BandRow);
}

export async function createBand(
  client: BandsClient,
  name: string,
): Promise<BandMutationResult> {
  const { data, error } = await client.rpc("create_band_safe", {
    p_name: name.trim(),
  });

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  const result = data as CreateBandSafeResponse | null;

  if (!result?.success) {
    const code = result?.error_code ?? "UNKNOWN";
    return {
      success: false,
      errorCode: code,
      errorMessage:
        result?.error_message ??
        BAND_ERROR_MESSAGES_IT[code] ??
        BAND_ERROR_MESSAGES_IT.UNKNOWN,
    };
  }

  return {
    success: true,
    bandId: result.band_id,
  };
}

export async function createBandInvite(
  client: BandsClient,
  params: {
    bandId: string;
    email: string;
    invitedByMemberId: string;
    expiresAt?: string;
  },
): Promise<CreateBandInviteResult> {
  const email = params.email.trim().toLowerCase();

  if (!email) {
    return {
      success: false,
      errorMessage: "Inserisci l'email dell'invitato.",
    };
  }

  const { data, error } = await client
    .from("band_invites")
    .insert({
      band_id: params.bandId,
      email,
      invited_by_member_id: params.invitedByMemberId,
      expires_at: params.expiresAt ?? defaultInviteExpiresAt(),
    })
    .select(BAND_INVITE_COLUMNS)
    .single();

  if (error) {
    if (error.code === "42501") {
      return {
        success: false,
        errorMessage: BAND_ERROR_MESSAGES_IT.NOT_AUTHORIZED,
      };
    }
    return {
      success: false,
      errorMessage: error.message || "Impossibile creare l'invito.",
    };
  }

  return {
    success: true,
    invite: mapBandInvite(data as BandInviteRow),
  };
}

export async function acceptBandInvite(
  client: BandsClient,
  token: string,
): Promise<AcceptBandInviteResult> {
  const { data, error } = await client.rpc("accept_band_invite", {
    p_token: token.trim(),
  });

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  const result = data as AcceptBandInviteSafeResponse | null;

  if (!result?.success) {
    const code = result?.error_code ?? "UNKNOWN";
    return {
      success: false,
      errorCode: code,
      errorMessage:
        result?.error_message ??
        BAND_ERROR_MESSAGES_IT[code] ??
        BAND_ERROR_MESSAGES_IT.UNKNOWN,
    };
  }

  return {
    success: true,
    bandId: result.band_id,
    memberStatus: result.member_status,
    alreadyMember: result.already_member,
  };
}

export async function listBandMembers(
  client: BandsClient,
  bandId: string,
): Promise<BandMember[]> {
  const { data, error } = await client
    .from("band_members")
    .select(BAND_MEMBER_COLUMNS)
    .eq("band_id", bandId)
    .order("role", { ascending: true })
    .order("joined_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`Impossibile caricare i membri: ${error.message}`);
  }

  const rows = (data ?? []) as BandMemberRow[];
  if (rows.length === 0) return [];

  const memberIds = [...new Set(rows.map((row) => row.member_id))];
  const { data: members, error: membersError } = await client
    .from("members")
    .select("id, first_name, last_name, email")
    .in("id", memberIds);

  if (membersError) {
    throw new Error(
      `Impossibile caricare gli associati: ${membersError.message}`,
    );
  }

  const memberById = new Map(
    (members ?? []).map((member) => [
      member.id,
      {
        id: member.id,
        firstName: member.first_name,
        lastName: member.last_name,
        email: member.email,
      },
    ]),
  );

  return rows.map((row) => ({
    ...mapBandMember(row),
    member: memberById.get(row.member_id) ?? null,
  }));
}

export async function leaveBand(
  client: BandsClient,
  bandId: string,
  memberId: string,
): Promise<LeaveBandResult> {
  const { data: membership, error: lookupError } = await client
    .from("band_members")
    .select("role")
    .eq("band_id", bandId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (lookupError) {
    return {
      success: false,
      errorMessage: lookupError.message,
    };
  }

  if (!membership) {
    return {
      success: false,
      errorCode: "NOT_FOUND",
      errorMessage: BAND_ERROR_MESSAGES_IT.NOT_FOUND,
    };
  }

  if ((membership as { role: BandMemberRole }).role === "founder") {
    return {
      success: false,
      errorCode: "FOUNDER_CANNOT_LEAVE",
      errorMessage: BAND_ERROR_MESSAGES_IT.FOUNDER_CANNOT_LEAVE,
    };
  }

  const { error } = await client
    .from("band_members")
    .delete()
    .eq("band_id", bandId)
    .eq("member_id", memberId);

  if (error) {
    if (error.code === "42501") {
      return {
        success: false,
        errorCode: "NOT_AUTHORIZED",
        errorMessage: BAND_ERROR_MESSAGES_IT.NOT_AUTHORIZED,
      };
    }
    return {
      success: false,
      errorMessage: error.message || "Impossibile abbandonare la band.",
    };
  }

  return { success: true };
}

export async function getBandInviteByToken(
  client: BandsClient,
  token: string,
): Promise<BandInvitePreview | null> {
  const normalized = token.trim();
  if (!normalized) return null;

  const { data, error } = await client
    .from("band_invites")
    .select(BAND_INVITE_COLUMNS)
    .eq("token", normalized)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const invite = mapBandInvite(data as BandInviteRow);
  const band = await getBand(client, invite.bandId);
  if (!band) return null;

  const expired =
    invite.status !== "pending" ||
    new Date(invite.expiresAt).getTime() <= Date.now();

  return {
    id: invite.id,
    bandId: invite.bandId,
    bandName: band.name,
    email: invite.email,
    status: expired && invite.status === "pending" ? "expired" : invite.status,
    expiresAt: invite.expiresAt,
    expired,
  };
}
