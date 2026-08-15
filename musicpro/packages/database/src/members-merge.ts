import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";
import type { MemberDetail } from "./members";

type MergeClient = SupabaseClient<Database>;

/** Untyped client for tables missing from generated Database types (e.g. tutor_links). */
type UntypedClient = SupabaseClient;

export interface DuplicateMemberSummary {
  id: string;
  memberNumber: number | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  taxCode: string | null;
  isActive: boolean;
  enrolledAt: string | null;
}

export interface DuplicateFieldConflict {
  field: string;
  label: string;
  canonicalValue: string;
  duplicateValue: string;
}

export interface DuplicateMergePlan {
  key: string;
  displayName: string;
  canonical: DuplicateMemberSummary;
  duplicates: DuplicateMemberSummary[];
  autoFills: { field: string; label: string; value: string }[];
  conflicts: DuplicateFieldConflict[];
}

export interface MergeMembersResult {
  success: boolean;
  errorMessage?: string;
  deletedIds?: string[];
}

const COMPARE_FIELDS: {
  field: keyof MemberDetail;
  label: string;
  column: string;
}[] = [
  { field: "enrolledAt", label: "Data iscrizione", column: "enrolled_at" },
  { field: "birthPlace", label: "Luogo nascita", column: "birth_place" },
  { field: "birthProvince", label: "Prov. nascita", column: "birth_province" },
  { field: "birthDate", label: "Data nascita", column: "birth_date" },
  { field: "addressStreet", label: "Indirizzo", column: "address_street" },
  {
    field: "addressPostalCode",
    label: "CAP",
    column: "address_postal_code",
  },
  { field: "addressCity", label: "Città", column: "address_city" },
  {
    field: "addressProvince",
    label: "Prov. residenza",
    column: "address_province",
  },
  { field: "taxCode", label: "Codice fiscale", column: "tax_code" },
  { field: "phone", label: "Telefono", column: "phone" },
  { field: "email", label: "Email", column: "email" },
  {
    field: "telegramChatId",
    label: "Telegram chat ID",
    column: "telegram_chat_id",
  },
];

function normalizeName(value: string | null | undefined): string {
  if (value == null) return "";
  const s = value.trim().toLowerCase();
  try {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    return s;
  }
}

function fieldStr(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function toSummary(row: {
  id: string;
  member_number: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  tax_code: string | null;
  is_active: boolean;
  enrolled_at: string | null;
}): DuplicateMemberSummary {
  return {
    id: row.id,
    memberNumber: row.member_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    taxCode: row.tax_code,
    isActive: row.is_active,
    enrolledAt: row.enrolled_at,
  };
}

function pickCanonical(
  members: DuplicateMemberSummary[],
): DuplicateMemberSummary {
  return [...members].sort((a, b) => {
    const aNum = a.memberNumber ?? Number.POSITIVE_INFINITY;
    const bNum = b.memberNumber ?? Number.POSITIVE_INFINITY;
    if (aNum !== bNum) return aNum - bNum;
    const aDate = a.enrolledAt ?? "";
    const bDate = b.enrolledAt ?? "";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.id.localeCompare(b.id);
  })[0]!;
}

function buildPlanForGroup(
  key: string,
  group: Array<{
    summary: DuplicateMemberSummary;
    detail: Record<string, unknown>;
  }>,
): DuplicateMergePlan {
  const summaries = group.map((g) => g.summary);
  const canonical = pickCanonical(summaries);
  const duplicates = summaries.filter((m) => m.id !== canonical.id);
  const canonicalDetail =
    group.find((g) => g.summary.id === canonical.id)?.detail ?? {};

  const autoFills: DuplicateMergePlan["autoFills"] = [];
  const conflicts: DuplicateFieldConflict[] = [];
  const seenAuto = new Set<string>();
  const seenConflict = new Set<string>();

  for (const dup of group.filter((g) => g.summary.id !== canonical.id)) {
    for (const meta of COMPARE_FIELDS) {
      const cVal = fieldStr(canonicalDetail[meta.field]);
      const dVal = fieldStr(dup.detail[meta.field]);
      if (!cVal && dVal) {
        if (!seenAuto.has(meta.field)) {
          seenAuto.add(meta.field);
          autoFills.push({
            field: meta.field,
            label: meta.label,
            value: dVal,
          });
        }
      } else if (
        cVal &&
        dVal &&
        cVal.toLowerCase() !== dVal.toLowerCase()
      ) {
        const conflictKey = `${meta.field}:${dVal}`;
        if (!seenConflict.has(conflictKey)) {
          seenConflict.add(conflictKey);
          conflicts.push({
            field: meta.field,
            label: meta.label,
            canonicalValue: cVal,
            duplicateValue: dVal,
          });
        }
      }
    }
  }

  return {
    key,
    displayName: `${canonical.lastName} ${canonical.firstName}`.trim(),
    canonical,
    duplicates,
    autoFills,
    conflicts,
  };
}

export async function findDuplicateMembers(
  client: MergeClient,
): Promise<DuplicateMergePlan[]> {
  const { data, error } = await client
    .from("members")
    .select(
      "id, member_number, first_name, last_name, email, phone, tax_code, is_active, enrolled_at, birth_place, birth_province, birth_date, address_street, address_postal_code, address_city, address_province, telegram_chat_id",
    )
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    throw new Error(`Impossibile analizzare i duplicati: ${error.message}`);
  }

  const groups = new Map<
    string,
    Array<{
      summary: DuplicateMemberSummary;
      detail: Record<string, unknown>;
    }>
  >();

  for (const row of data ?? []) {
    const first = normalizeName(row.first_name);
    const last = normalizeName(row.last_name);
    if (!first || !last) continue;

    const key = `${first}|${last}`;
    const summary = toSummary(row);
    const detail: Record<string, unknown> = {
      enrolledAt: row.enrolled_at,
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
      telegramChatId: row.telegram_chat_id,
    };

    const list = groups.get(key) ?? [];
    list.push({ summary, detail });
    groups.set(key, list);
  }

  const plans: DuplicateMergePlan[] = [];
  for (const [key, group] of groups.entries()) {
    if (group.length < 2) continue;
    plans.push(buildPlanForGroup(key, group));
  }

  return plans.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "it"),
  );
}

async function reassignOrDeleteUnique(
  client: MergeClient,
  table: "member_roles" | "member_annual_quotas" | "reimbursements",
  uniqueCols: string[],
  canonicalId: string,
  duplicateId: string,
): Promise<string | null> {
  const { data: dupRows, error: listError } = await client
    .from(table)
    .select("*")
    .eq("member_id", duplicateId);

  if (listError) {
    return listError.message;
  }

  for (const row of dupRows ?? []) {
    let existingQuery = client
      .from(table)
      .select("id")
      .eq("member_id", canonicalId);
    for (const col of uniqueCols) {
      if (col === "member_id") continue;
      existingQuery = existingQuery.eq(
        col,
        (row as Record<string, unknown>)[col] as string | number,
      );
    }

    const { data: existing, error: existError } =
      await existingQuery.maybeSingle();
    if (existError) {
      return existError.message;
    }

    if (existing) {
      const { error: delError } = await client
        .from(table)
        .delete()
        .eq("id", (row as { id: string }).id);
      if (delError) return delError.message;
    } else {
      const { error: updError } = await client
        .from(table)
        .update({ member_id: canonicalId } as never)
        .eq("id", (row as { id: string }).id);
      if (updError) return updError.message;
    }
  }

  return null;
}

async function reassignMemberId(
  client: MergeClient,
  table:
    | "reimbursements"
    | "bookings"
    | "credit_purchases"
    | "credit_transactions"
    | "enrollments",
  canonicalId: string,
  duplicateId: string,
): Promise<string | null> {
  const { error } = await client
    .from(table)
    .update({ member_id: canonicalId } as never)
    .eq("member_id", duplicateId);

  if (error) return error.message;
  return null;
}

async function reassignCreatedByOnReimbursements(
  client: MergeClient,
  canonicalId: string,
  duplicateId: string,
): Promise<string | null> {
  const { error } = await client
    .from("reimbursements")
    .update({ created_by_member_id: canonicalId })
    .eq("created_by_member_id", duplicateId);

  if (error) return error.message;
  return null;
}

async function reassignBookingAdjustments(
  client: UntypedClient,
  canonicalId: string,
  duplicateId: string,
): Promise<string | null> {
  // booking_adjustments is not in generated Database types yet;
  // admin_member_id is ON DELETE RESTRICT and would block member delete.
  const { error } = await client
    .from("booking_adjustments")
    .update({ admin_member_id: canonicalId })
    .eq("admin_member_id", duplicateId);

  if (error) return error.message;
  return null;
}

async function reassignTutorLinks(
  client: UntypedClient,
  canonicalId: string,
  duplicateId: string,
): Promise<string | null> {
  // tutor_links is not in generated Database types yet.
  const { data: asTutor, error: e1 } = await client
    .from("tutor_links")
    .select("id, tutor_member_id, ward_member_id")
    .eq("tutor_member_id", duplicateId);

  if (e1) return e1.message;

  for (const link of asTutor ?? []) {
    if (link.ward_member_id === canonicalId) {
      const { error } = await client
        .from("tutor_links")
        .delete()
        .eq("id", link.id);
      if (error) return error.message;
      continue;
    }

    const { data: existing } = await client
      .from("tutor_links")
      .select("id")
      .eq("tutor_member_id", canonicalId)
      .eq("ward_member_id", link.ward_member_id)
      .maybeSingle();

    if (existing) {
      const { error } = await client
        .from("tutor_links")
        .delete()
        .eq("id", link.id);
      if (error) return error.message;
    } else {
      const { error } = await client
        .from("tutor_links")
        .update({ tutor_member_id: canonicalId })
        .eq("id", link.id);
      if (error) return error.message;
    }
  }

  const { data: asWard, error: e2 } = await client
    .from("tutor_links")
    .select("id, tutor_member_id, ward_member_id")
    .eq("ward_member_id", duplicateId);

  if (e2) return e2.message;

  for (const link of asWard ?? []) {
    if (link.tutor_member_id === canonicalId) {
      const { error } = await client
        .from("tutor_links")
        .delete()
        .eq("id", link.id);
      if (error) return error.message;
      continue;
    }

    const { data: existing } = await client
      .from("tutor_links")
      .select("id")
      .eq("tutor_member_id", link.tutor_member_id)
      .eq("ward_member_id", canonicalId)
      .maybeSingle();

    if (existing) {
      const { error } = await client
        .from("tutor_links")
        .delete()
        .eq("id", link.id);
      if (error) return error.message;
    } else {
      const { error } = await client
        .from("tutor_links")
        .update({ ward_member_id: canonicalId })
        .eq("id", link.id);
      if (error) return error.message;
    }
  }

  return null;
}

async function fillCanonicalFromDuplicate(
  client: MergeClient,
  canonicalId: string,
  duplicateId: string,
  preferredFields?: Record<string, "canonical" | "duplicate">,
): Promise<string | null> {
  const { data: rows, error } = await client
    .from("members")
    .select(
      "id, enrolled_at, birth_place, birth_province, birth_date, address_street, address_postal_code, address_city, address_province, tax_code, phone, email, telegram_chat_id, legacy_tutor_member_number, legacy_tutor_full_name, manual_tutor_first_name, manual_tutor_last_name, manual_tutor_phone, manual_tutor_email, manual_tutor_tax_code",
    )
    .in("id", [canonicalId, duplicateId]);

  if (error) return error.message;

  const canonical = rows?.find((r) => r.id === canonicalId);
  const duplicate = rows?.find((r) => r.id === duplicateId);
  if (!canonical || !duplicate) {
    return "Associati non trovati per la fusione.";
  }

  const patch: Record<string, unknown> = {};

  for (const meta of COMPARE_FIELDS) {
    const cVal = fieldStr(
      (canonical as Record<string, unknown>)[meta.column],
    );
    const dVal = fieldStr(
      (duplicate as Record<string, unknown>)[meta.column],
    );
    const preference = preferredFields?.[meta.field];

    if (preference === "duplicate" && dVal) {
      patch[meta.column] = (duplicate as Record<string, unknown>)[meta.column];
    } else if (!cVal && dVal) {
      patch[meta.column] = (duplicate as Record<string, unknown>)[meta.column];
    }
  }

  // Tutor fields: fill empty only
  const tutorCols = [
    "legacy_tutor_member_number",
    "legacy_tutor_full_name",
    "manual_tutor_first_name",
    "manual_tutor_last_name",
    "manual_tutor_phone",
    "manual_tutor_email",
    "manual_tutor_tax_code",
  ] as const;

  for (const col of tutorCols) {
    const cVal = (canonical as Record<string, unknown>)[col];
    const dVal = (duplicate as Record<string, unknown>)[col];
    if ((cVal == null || cVal === "") && dVal != null && dVal !== "") {
      patch[col] = dVal;
    }
  }

  if (Object.keys(patch).length === 0) return null;

  const { error: updError } = await client
    .from("members")
    .update(patch as never)
    .eq("id", canonicalId);

  return updError?.message ?? null;
}

/**
 * Merges duplicate member into canonical: reassigns FKs, fills empty fields, deletes duplicate.
 */
export async function mergeDuplicateMembers(
  client: MergeClient,
  canonicalId: string,
  duplicateId: string,
  preferredFields?: Record<string, "canonical" | "duplicate">,
): Promise<MergeMembersResult> {
  if (canonicalId === duplicateId) {
    return {
      success: false,
      errorMessage: "Canonical e duplicato devono essere diversi.",
    };
  }

  const fillError = await fillCanonicalFromDuplicate(
    client,
    canonicalId,
    duplicateId,
    preferredFields,
  );
  if (fillError) {
    return { success: false, errorMessage: fillError };
  }

  const steps: Array<string | null> = [];

  steps.push(
    await reassignOrDeleteUnique(
      client,
      "member_roles",
      ["member_id", "role"],
      canonicalId,
      duplicateId,
    ),
  );
  steps.push(
    await reassignOrDeleteUnique(
      client,
      "member_annual_quotas",
      ["member_id", "fiscal_year"],
      canonicalId,
      duplicateId,
    ),
  );
  steps.push(
    await reassignOrDeleteUnique(
      client,
      "reimbursements",
      ["member_id", "fiscal_year", "progressive"],
      canonicalId,
      duplicateId,
    ),
  );
  steps.push(
    await reassignCreatedByOnReimbursements(
      client,
      canonicalId,
      duplicateId,
    ),
  );
  steps.push(
    await reassignMemberId(client, "bookings", canonicalId, duplicateId),
  );
  steps.push(
    await reassignMemberId(
      client,
      "credit_purchases",
      canonicalId,
      duplicateId,
    ),
  );
  steps.push(
    await reassignMemberId(
      client,
      "credit_transactions",
      canonicalId,
      duplicateId,
    ),
  );
  steps.push(
    await reassignMemberId(client, "enrollments", canonicalId, duplicateId),
  );
  steps.push(
    await reassignBookingAdjustments(
      client as UntypedClient,
      canonicalId,
      duplicateId,
    ),
  );
  steps.push(
    await reassignTutorLinks(client as UntypedClient, canonicalId, duplicateId),
  );

  // Null out optional FKs that might block delete
  await client
    .from("app_settings")
    .update({ updated_by: null })
    .eq("updated_by", duplicateId);
  await client
    .from("bookings")
    .update({ cancelled_by: null } as never)
    .eq("cancelled_by", duplicateId);
  await client
    .from("credit_transactions")
    .update({ created_by: null } as never)
    .eq("created_by", duplicateId);
  await client
    .from("member_roles")
    .update({ granted_by: null } as never)
    .eq("granted_by", duplicateId);

  const firstError = steps.find((s) => s != null);
  if (firstError) {
    return { success: false, errorMessage: firstError };
  }

  const { error: delError } = await client
    .from("members")
    .delete()
    .eq("id", duplicateId);

  if (delError) {
    return {
      success: false,
      errorMessage:
        delError.message ||
        "Impossibile eliminare il duplicato (verificare vincoli FK).",
    };
  }

  return { success: true, deletedIds: [duplicateId] };
}
