import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

type MembersClient = SupabaseClient<Database>;

export interface MemberSummary {
  id: string;
  memberNumber: number | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  telegramChatId: string | null;
  isActive: boolean;
}

export interface MemberDetail {
  id: string;
  memberNumber: number | null;
  enrolledAt: string | null;
  firstName: string;
  lastName: string;
  birthPlace: string | null;
  birthProvince: string | null;
  birthDate: string | null;
  addressStreet: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressProvince: string | null;
  taxCode: string | null;
  phone: string | null;
  email: string | null;
  legacyTutorMemberNumber: number | null;
  legacyTutorFullName: string | null;
  manualTutorFirstName: string | null;
  manualTutorLastName: string | null;
  manualTutorPhone: string | null;
  manualTutorEmail: string | null;
  manualTutorTaxCode: string | null;
  telegramChatId: string | null;
  gdprConsent: boolean;
  gdprConsentAt: string | null;
  isActive: boolean;
}

export type MemberInput = Omit<MemberDetail, "id">;

type MemberRow = {
  id: string;
  member_number: number | null;
  enrolled_at: string | null;
  first_name: string;
  last_name: string;
  birth_place: string | null;
  birth_province: string | null;
  birth_date: string | null;
  address_street: string | null;
  address_postal_code: string | null;
  address_city: string | null;
  address_province: string | null;
  tax_code: string | null;
  phone: string | null;
  email: string | null;
  legacy_tutor_member_number: number | null;
  legacy_tutor_full_name: string | null;
  manual_tutor_first_name: string | null;
  manual_tutor_last_name: string | null;
  manual_tutor_phone: string | null;
  manual_tutor_email: string | null;
  manual_tutor_tax_code: string | null;
  telegram_chat_id: string | null;
  gdpr_consent: boolean;
  gdpr_consent_at: string | null;
  is_active: boolean;
};

const MEMBER_LIST_COLUMNS =
  "id, member_number, first_name, last_name, phone, email, telegram_chat_id, is_active";

const MEMBER_DETAIL_COLUMNS =
  "id, member_number, enrolled_at, first_name, last_name, birth_place, birth_province, birth_date, address_street, address_postal_code, address_city, address_province, tax_code, phone, email, legacy_tutor_member_number, legacy_tutor_full_name, manual_tutor_first_name, manual_tutor_last_name, manual_tutor_phone, manual_tutor_email, manual_tutor_tax_code, telegram_chat_id, gdpr_consent, gdpr_consent_at, is_active";

function mapMemberSummary(row: MemberRow): MemberSummary {
  return {
    id: row.id,
    memberNumber: row.member_number,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    telegramChatId: row.telegram_chat_id,
    isActive: row.is_active,
  };
}

function mapMemberDetail(row: MemberRow): MemberDetail {
  return {
    id: row.id,
    memberNumber: row.member_number,
    enrolledAt: row.enrolled_at,
    firstName: row.first_name,
    lastName: row.last_name,
    birthPlace: row.birth_place,
    birthProvince: row.birth_province,
    birthDate: row.birth_date,
    addressStreet: row.address_street,
    addressPostalCode: row.address_postal_code,
    addressCity: row.address_city,
    addressProvince: row.address_province,
    taxCode: row.tax_code,
    phone: row.phone,
    email: row.email,
    legacyTutorMemberNumber: row.legacy_tutor_member_number,
    legacyTutorFullName: row.legacy_tutor_full_name,
    manualTutorFirstName: row.manual_tutor_first_name,
    manualTutorLastName: row.manual_tutor_last_name,
    manualTutorPhone: row.manual_tutor_phone,
    manualTutorEmail: row.manual_tutor_email,
    manualTutorTaxCode: row.manual_tutor_tax_code,
    telegramChatId: row.telegram_chat_id,
    gdprConsent: row.gdpr_consent,
    gdprConsentAt: row.gdpr_consent_at,
    isActive: row.is_active,
  };
}

function memberInputToRow(input: MemberInput): Record<string, unknown> {
  return {
    member_number: input.memberNumber,
    enrolled_at: input.enrolledAt || null,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    birth_place: emptyToNull(input.birthPlace),
    birth_province: emptyToNull(input.birthProvince),
    birth_date: input.birthDate || null,
    address_street: emptyToNull(input.addressStreet),
    address_postal_code: emptyToNull(input.addressPostalCode),
    address_city: emptyToNull(input.addressCity),
    address_province: emptyToNull(input.addressProvince),
    tax_code: emptyToNull(input.taxCode),
    phone: emptyToNull(input.phone),
    email: emptyToNull(input.email),
    legacy_tutor_member_number: input.legacyTutorMemberNumber,
    legacy_tutor_full_name: emptyToNull(input.legacyTutorFullName),
    manual_tutor_first_name: emptyToNull(input.manualTutorFirstName),
    manual_tutor_last_name: emptyToNull(input.manualTutorLastName),
    manual_tutor_phone: emptyToNull(input.manualTutorPhone),
    manual_tutor_email: emptyToNull(input.manualTutorEmail),
    manual_tutor_tax_code: emptyToNull(input.manualTutorTaxCode),
    telegram_chat_id: emptyToNull(input.telegramChatId),
    gdpr_consent: input.gdprConsent,
    gdpr_consent_at: input.gdprConsent ? input.gdprConsentAt ?? new Date().toISOString() : null,
    is_active: input.isActive,
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function listMembers(
  client: MembersClient,
  search?: string,
): Promise<MemberSummary[]> {
  let query = client
    .from("members")
    .select(MEMBER_LIST_COLUMNS)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const term = search?.trim();
  if (term) {
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Impossibile caricare gli associati: ${error.message}`);
  }

  return ((data ?? []) as MemberRow[]).map(mapMemberSummary);
}

export async function getMemberById(
  client: MembersClient,
  id: string,
): Promise<MemberDetail | null> {
  const { data, error } = await client
    .from("members")
    .select(MEMBER_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare l'associato: ${error.message}`);
  }

  if (!data) return null;

  return mapMemberDetail(data as MemberRow);
}

export async function getNextMemberNumber(
  client: MembersClient,
): Promise<number> {
  const { data, error } = await client
    .from("members")
    .select("member_number")
    .not("member_number", "is", null)
    .order("member_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile calcolare il numero associato: ${error.message}`);
  }

  const max = (data as { member_number: number } | null)?.member_number ?? 0;
  return max + 1;
}

export interface MemberMutationResult {
  success: boolean;
  id?: string;
  errorMessage?: string;
}

export async function createMember(
  client: MembersClient,
  input: MemberInput,
): Promise<MemberMutationResult> {
  const { data, error } = await client
    .from("members")
    .insert(memberInputToRow(input) as never)
    .select("id")
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  return {
    success: true,
    id: (data as { id: string }).id,
  };
}

export async function updateMember(
  client: MembersClient,
  id: string,
  input: MemberInput,
): Promise<MemberMutationResult> {
  const { error } = await client
    .from("members")
    .update(memberInputToRow(input) as never)
    .eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  return { success: true, id };
}

export async function deleteMember(
  client: MembersClient,
  id: string,
): Promise<MemberMutationResult> {
  const { error } = await client.from("members").delete().eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  return { success: true };
}
