import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

type LessonsClient = SupabaseClient<Database>;

export type CourseKind = "individuale" | "gruppo" | "online";
export type PayRateUnit = "hourly" | "per_head_per_lesson";
export type PaymentVisibility = "status" | "amounts" | "hidden";

/** ISO weekday used by teacher_availability: 1=Monday … 7=Sunday */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface LessonSchoolSettings {
  id: boolean;
  gridOpenMinute: number;
  gridCloseMinute: number;
  sundayVisible: boolean;
  slotGranularityMinutes: number;
  defaultGroupCapacity: number;
  attendanceEditDays: number;
  holdHours: number;
  reminderWeekHours: number;
  reminderDayHours: number;
  reminderSoonHours: number;
  packRemindHours1: number;
  packRemindHours2: number;
  notulaJobDay: number;
  notulaJobHour: number;
  notulaSignDeadlineDays: number;
  createdAt: string;
  updatedAt: string;
}

export type LessonSchoolSettingsPatch = Partial<
  Omit<LessonSchoolSettings, "id" | "createdAt" | "updatedAt">
>;

export interface LessonSubject {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolCourseTerm {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SchoolCourseTermInput = {
  id?: string;
  label: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
};

export interface SchoolClosure {
  id: string;
  startsOn: string;
  endsOn: string;
  title: string;
  repeatsYearly: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoursePackPrice {
  id: string;
  courseKind: CourseKind;
  durationMinutes: number;
  amountEur: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayRateType {
  id: string;
  slug: string;
  label: string;
  unit: PayRateUnit;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherProfile {
  memberId: string;
  canCreateCourses: boolean;
  canReschedule: boolean;
  canCloseCourses: boolean;
  paymentVisibility: PaymentVisibility;
  createdAt: string;
  updatedAt: string;
}

export type TeacherProfilePatch = Partial<
  Omit<TeacherProfile, "memberId" | "createdAt" | "updatedAt">
>;

export interface TeacherPayRate {
  id: string;
  memberId: string;
  payRateTypeId: string;
  amountEur: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherSubject {
  memberId: string;
  subjectId: string;
}

export interface LessonSettingsMutationResult {
  success: boolean;
  id?: string;
  errorMessage?: string;
}

type SettingsRow = Database["public"]["Tables"]["school_lesson_settings"]["Row"];
type CourseTermRow = Database["public"]["Tables"]["school_course_terms"]["Row"];
type SubjectRow = Database["public"]["Tables"]["lesson_subjects"]["Row"];
type ClosureRow = Database["public"]["Tables"]["school_closures"]["Row"];
type PackPriceRow = Database["public"]["Tables"]["course_pack_prices"]["Row"];
type PayRateTypeRow = Database["public"]["Tables"]["pay_rate_types"]["Row"];
type TeacherProfileRow = Database["public"]["Tables"]["teacher_profiles"]["Row"];
type TeacherPayRateRow = Database["public"]["Tables"]["teacher_pay_rates"]["Row"];
type TeacherSubjectRow = Database["public"]["Tables"]["teacher_subjects"]["Row"];

const SETTINGS_COLUMNS =
  "id, grid_open_minute, grid_close_minute, sunday_visible, slot_granularity_minutes, default_group_capacity, attendance_edit_days, hold_hours, reminder_week_hours, reminder_day_hours, reminder_soon_hours, pack_remind_hours_1, pack_remind_hours_2, notula_job_day, notula_job_hour, notula_sign_deadline_days, created_at, updated_at";

const COURSE_TERM_COLUMNS =
  "id, label, starts_on, ends_on, is_current, created_at, updated_at";

const SUBJECT_COLUMNS =
  "id, name, slug, sort_order, is_active, created_at, updated_at";

const CLOSURE_COLUMNS =
  "id, starts_on, ends_on, title, repeats_yearly, created_at, updated_at";

const PACK_PRICE_COLUMNS =
  "id, course_kind, duration_minutes, amount_eur, created_at, updated_at";

const PAY_RATE_TYPE_COLUMNS =
  "id, slug, label, unit, is_system, is_active, sort_order, created_at, updated_at";

const TEACHER_PROFILE_COLUMNS =
  "member_id, can_create_courses, can_reschedule, can_close_courses, payment_visibility, created_at, updated_at";

const TEACHER_PAY_RATE_COLUMNS =
  "id, member_id, pay_rate_type_id, amount_eur, created_at, updated_at";

const TEACHER_SUBJECT_COLUMNS = "member_id, subject_id";

function mapSettings(row: SettingsRow): LessonSchoolSettings {
  return {
    id: row.id,
    gridOpenMinute: row.grid_open_minute,
    gridCloseMinute: row.grid_close_minute,
    sundayVisible: row.sunday_visible,
    slotGranularityMinutes: row.slot_granularity_minutes,
    defaultGroupCapacity: row.default_group_capacity,
    attendanceEditDays: row.attendance_edit_days,
    holdHours: row.hold_hours,
    reminderWeekHours: row.reminder_week_hours,
    reminderDayHours: row.reminder_day_hours,
    reminderSoonHours: row.reminder_soon_hours,
    packRemindHours1: row.pack_remind_hours_1,
    packRemindHours2: row.pack_remind_hours_2,
    notulaJobDay: row.notula_job_day,
    notulaJobHour: row.notula_job_hour,
    notulaSignDeadlineDays: row.notula_sign_deadline_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSettingsPatch(
  patch: LessonSchoolSettingsPatch,
): Database["public"]["Tables"]["school_lesson_settings"]["Update"] {
  const row: Database["public"]["Tables"]["school_lesson_settings"]["Update"] =
    {};
  if (patch.gridOpenMinute !== undefined) {
    row.grid_open_minute = patch.gridOpenMinute;
  }
  if (patch.gridCloseMinute !== undefined) {
    row.grid_close_minute = patch.gridCloseMinute;
  }
  if (patch.sundayVisible !== undefined) row.sunday_visible = patch.sundayVisible;
  if (patch.slotGranularityMinutes !== undefined) {
    row.slot_granularity_minutes = patch.slotGranularityMinutes;
  }
  if (patch.defaultGroupCapacity !== undefined) {
    row.default_group_capacity = patch.defaultGroupCapacity;
  }
  if (patch.attendanceEditDays !== undefined) {
    row.attendance_edit_days = patch.attendanceEditDays;
  }
  if (patch.holdHours !== undefined) row.hold_hours = patch.holdHours;
  if (patch.reminderWeekHours !== undefined) {
    row.reminder_week_hours = patch.reminderWeekHours;
  }
  if (patch.reminderDayHours !== undefined) {
    row.reminder_day_hours = patch.reminderDayHours;
  }
  if (patch.reminderSoonHours !== undefined) {
    row.reminder_soon_hours = patch.reminderSoonHours;
  }
  if (patch.packRemindHours1 !== undefined) {
    row.pack_remind_hours_1 = patch.packRemindHours1;
  }
  if (patch.packRemindHours2 !== undefined) {
    row.pack_remind_hours_2 = patch.packRemindHours2;
  }
  if (patch.notulaJobDay !== undefined) row.notula_job_day = patch.notulaJobDay;
  if (patch.notulaJobHour !== undefined) row.notula_job_hour = patch.notulaJobHour;
  if (patch.notulaSignDeadlineDays !== undefined) {
    row.notula_sign_deadline_days = patch.notulaSignDeadlineDays;
  }
  return row;
}

function mapSubject(row: SubjectRow): LessonSubject {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapClosure(row: ClosureRow): SchoolClosure {
  return {
    id: row.id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    title: row.title,
    repeatsYearly: row.repeats_yearly,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPackPrice(row: PackPriceRow): CoursePackPrice {
  return {
    id: row.id,
    courseKind: row.course_kind,
    durationMinutes: row.duration_minutes,
    amountEur: row.amount_eur == null ? null : Number(row.amount_eur),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPayRateType(row: PayRateTypeRow): PayRateType {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    unit: row.unit,
    isSystem: row.is_system,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTeacherProfile(row: TeacherProfileRow): TeacherProfile {
  return {
    memberId: row.member_id,
    canCreateCourses: row.can_create_courses,
    canReschedule: row.can_reschedule,
    canCloseCourses: row.can_close_courses,
    paymentVisibility: row.payment_visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTeacherProfilePatch(
  patch: TeacherProfilePatch,
): Database["public"]["Tables"]["teacher_profiles"]["Update"] {
  const row: Database["public"]["Tables"]["teacher_profiles"]["Update"] = {};
  if (patch.canCreateCourses !== undefined) {
    row.can_create_courses = patch.canCreateCourses;
  }
  if (patch.canReschedule !== undefined) {
    row.can_reschedule = patch.canReschedule;
  }
  if (patch.canCloseCourses !== undefined) {
    row.can_close_courses = patch.canCloseCourses;
  }
  if (patch.paymentVisibility !== undefined) {
    row.payment_visibility = patch.paymentVisibility;
  }
  return row;
}

function mapTeacherPayRate(row: TeacherPayRateRow): TeacherPayRate {
  return {
    id: row.id,
    memberId: row.member_id,
    payRateTypeId: row.pay_rate_type_id,
    amountEur: Number(row.amount_eur),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTeacherSubject(row: TeacherSubjectRow): TeacherSubject {
  return {
    memberId: row.member_id,
    subjectId: row.subject_id,
  };
}

export async function getLessonSchoolSettings(
  client: LessonsClient,
): Promise<LessonSchoolSettings | null> {
  const { data, error } = await client
    .from("school_lesson_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossibile caricare le impostazioni lezioni: ${error.message}`,
    );
  }

  if (!data) return null;
  return mapSettings(data);
}

function isPositiveInt(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 1);
}

function validateSettingsPatch(
  patch: LessonSchoolSettingsPatch,
): string | null {
  if (patch.gridOpenMinute !== undefined) {
    if (
      !Number.isInteger(patch.gridOpenMinute) ||
      patch.gridOpenMinute < 0 ||
      patch.gridOpenMinute >= 1440
    ) {
      return "L'orario di apertura griglia non è valido.";
    }
  }
  if (patch.gridCloseMinute !== undefined) {
    if (
      !Number.isInteger(patch.gridCloseMinute) ||
      patch.gridCloseMinute <= 0 ||
      patch.gridCloseMinute > 1440
    ) {
      return "L'orario di chiusura griglia non è valido.";
    }
  }
  if (
    patch.gridOpenMinute !== undefined &&
    patch.gridCloseMinute !== undefined &&
    patch.gridCloseMinute <= patch.gridOpenMinute
  ) {
    return "La chiusura griglia deve essere dopo l'apertura.";
  }
  if (
    patch.slotGranularityMinutes !== undefined &&
    ![5, 15, 30].includes(patch.slotGranularityMinutes)
  ) {
    return "Il passo slot deve essere 5, 15 o 30 minuti.";
  }
  if (
    patch.defaultGroupCapacity !== undefined &&
    (!Number.isInteger(patch.defaultGroupCapacity) ||
      patch.defaultGroupCapacity < 1)
  ) {
    return "La capienza di gruppo deve essere almeno 1.";
  }
  if (!isPositiveInt(patch.attendanceEditDays)) {
    return "La finestra presenze deve essere almeno 1 giorno.";
  }
  if (!isPositiveInt(patch.holdHours)) {
    return "Le ore di hold devono essere almeno 1.";
  }
  if (!isPositiveInt(patch.reminderWeekHours)) {
    return "Il reminder lungo deve essere almeno 1 ora.";
  }
  if (!isPositiveInt(patch.reminderDayHours)) {
    return "Il reminder 24h deve essere almeno 1 ora.";
  }
  if (!isPositiveInt(patch.reminderSoonHours)) {
    return "Il reminder breve deve essere almeno 1 ora.";
  }
  if (!isPositiveInt(patch.packRemindHours1)) {
    return "Il sollecito pacchetto (1) deve essere almeno 1 ora.";
  }
  if (!isPositiveInt(patch.packRemindHours2)) {
    return "Il sollecito pacchetto (2) deve essere almeno 1 ora.";
  }
  if (
    patch.notulaJobDay !== undefined &&
    (!Number.isInteger(patch.notulaJobDay) ||
      patch.notulaJobDay < 1 ||
      patch.notulaJobDay > 28)
  ) {
    return "Il giorno del job notule deve essere tra 1 e 28.";
  }
  if (
    patch.notulaJobHour !== undefined &&
    (!Number.isInteger(patch.notulaJobHour) ||
      patch.notulaJobHour < 0 ||
      patch.notulaJobHour > 23)
  ) {
    return "L'ora del job notule deve essere tra 0 e 23.";
  }
  if (!isPositiveInt(patch.notulaSignDeadlineDays)) {
    return "La scadenza firma notula deve essere almeno 1 giorno.";
  }
  return null;
}

export async function updateLessonSchoolSettings(
  client: LessonsClient,
  patch: LessonSchoolSettingsPatch,
): Promise<LessonSettingsMutationResult> {
  const validationError = validateSettingsPatch(patch);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const row = mapSettingsPatch(patch);
  if (Object.keys(row).length === 0) {
    return {
      success: false,
      errorMessage: "Nessuna modifica da salvare.",
    };
  }

  const { error } = await client
    .from("school_lesson_settings")
    .update(row)
    .eq("id", true);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile salvare le impostazioni.",
    };
  }

  return { success: true };
}

function mapCourseTerm(row: CourseTermRow): SchoolCourseTerm {
  return {
    id: row.id,
    label: row.label,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isCurrent: row.is_current,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSchoolCourseTerms(
  client: LessonsClient,
): Promise<SchoolCourseTerm[]> {
  const { data, error } = await client
    .from("school_course_terms")
    .select(COURSE_TERM_COLUMNS)
    .order("starts_on", { ascending: false });

  if (error) {
    throw new Error(`Impossibile caricare gli anni corsi: ${error.message}`);
  }

  return (data ?? []).map(mapCourseTerm);
}

export async function getCurrentSchoolCourseTerm(
  client: LessonsClient,
): Promise<SchoolCourseTerm | null> {
  const { data, error } = await client
    .from("school_course_terms")
    .select(COURSE_TERM_COLUMNS)
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare l'anno corsi corrente: ${error.message}`);
  }

  return data ? mapCourseTerm(data) : null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function unsetCurrentCourseTerms(
  client: LessonsClient,
): Promise<string | null> {
  const { error } = await client
    .from("school_course_terms")
    .update({ is_current: false })
    .eq("is_current", true);

  if (error) {
    return error.message || "Impossibile aggiornare l'anno corsi corrente.";
  }
  return null;
}

function validateCourseTermInput(
  input: SchoolCourseTermInput,
): string | null {
  const label = input.label.trim();
  if (!label) {
    return "Il nome dell'anno corsi è obbligatorio.";
  }
  if (!ISO_DATE_RE.test(input.startsOn) || !ISO_DATE_RE.test(input.endsOn)) {
    return "Le date dell'anno corsi non sono valide.";
  }
  if (input.endsOn < input.startsOn) {
    return "La fine dell'anno corsi deve essere successiva o uguale all'inizio.";
  }
  return null;
}

export async function upsertSchoolCourseTerm(
  client: LessonsClient,
  input: SchoolCourseTermInput,
): Promise<LessonSettingsMutationResult> {
  const validationError = validateCourseTermInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  if (input.isCurrent) {
    const unsetError = await unsetCurrentCourseTerms(client);
    if (unsetError) {
      return { success: false, errorMessage: unsetError };
    }
  }

  const payload = {
    label: input.label.trim(),
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    is_current: input.isCurrent,
  };

  if (input.id) {
    const { error } = await client
      .from("school_course_terms")
      .update(payload)
      .eq("id", input.id);

    if (error) {
      return {
        success: false,
        errorMessage: error.message || "Impossibile salvare l'anno corsi.",
      };
    }

    return { success: true, id: input.id };
  }

  const { data, error } = await client
    .from("school_course_terms")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile salvare l'anno corsi.",
    };
  }

  return { success: true, id: data.id };
}

export async function setCurrentSchoolCourseTerm(
  client: LessonsClient,
  termId: string,
): Promise<LessonSettingsMutationResult> {
  if (!termId.trim()) {
    return { success: false, errorMessage: "Anno corsi non valido." };
  }

  const unsetError = await unsetCurrentCourseTerms(client);
  if (unsetError) {
    return { success: false, errorMessage: unsetError };
  }

  const { data, error } = await client
    .from("school_course_terms")
    .update({ is_current: true })
    .eq("id", termId)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      success: false,
      errorMessage:
        error.message || "Impossibile impostare l'anno corsi corrente.",
    };
  }

  if (!data) {
    return { success: false, errorMessage: "Anno corsi non trovato." };
  }

  return { success: true, id: data.id };
}

export async function listLessonSubjects(
  client: LessonsClient,
  options: { includeInactive?: boolean } = {},
): Promise<LessonSubject[]> {
  let query = client
    .from("lesson_subjects")
    .select(SUBJECT_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Impossibile caricare le materie: ${error.message}`);
  }

  return (data ?? []).map(mapSubject);
}

function slugifySubjectName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "materia";
}

function uniqueSubjectSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
}

export async function createLessonSubject(
  client: LessonsClient,
  name: string,
): Promise<LessonSettingsMutationResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, errorMessage: "Il nome della materia è obbligatorio." };
  }

  const { data: existing, error: listError } = await client
    .from("lesson_subjects")
    .select("slug, sort_order");
  if (listError) {
    return {
      success: false,
      errorMessage: listError.message || "Impossibile creare la materia.",
    };
  }

  const slugs = new Set((existing ?? []).map((row) => row.slug));
  const maxSort = (existing ?? []).reduce(
    (max, row) => (row.sort_order > max ? row.sort_order : max),
    0,
  );

  const { data, error } = await client
    .from("lesson_subjects")
    .insert({
      name: trimmed,
      slug: uniqueSubjectSlug(slugifySubjectName(trimmed), slugs),
      sort_order: maxSort + 10,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, errorMessage: "Esiste già una materia con questo nome." };
    }
    return {
      success: false,
      errorMessage: error.message || "Impossibile creare la materia.",
    };
  }

  return { success: true, id: data.id };
}

export async function renameLessonSubject(
  client: LessonsClient,
  id: string,
  name: string,
): Promise<LessonSettingsMutationResult> {
  const trimmed = name.trim();
  if (!id.trim()) {
    return { success: false, errorMessage: "Materia non valida." };
  }
  if (!trimmed) {
    return { success: false, errorMessage: "Il nome della materia è obbligatorio." };
  }

  const { data, error } = await client
    .from("lesson_subjects")
    .update({ name: trimmed })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { success: false, errorMessage: "Esiste già una materia con questo nome." };
    }
    return {
      success: false,
      errorMessage: error.message || "Impossibile rinominare la materia.",
    };
  }
  if (!data) {
    return { success: false, errorMessage: "Materia non trovata." };
  }
  return { success: true, id: data.id };
}

export async function setLessonSubjectActive(
  client: LessonsClient,
  id: string,
  isActive: boolean,
): Promise<LessonSettingsMutationResult> {
  if (!id.trim()) {
    return { success: false, errorMessage: "Materia non valida." };
  }

  const { data, error } = await client
    .from("lesson_subjects")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      success: false,
      errorMessage:
        error.message || "Impossibile aggiornare lo stato della materia.",
    };
  }
  if (!data) {
    return { success: false, errorMessage: "Materia non trovata." };
  }
  return { success: true, id: data.id };
}

export async function listSchoolClosures(
  client: LessonsClient,
): Promise<SchoolClosure[]> {
  const { data, error } = await client
    .from("school_closures")
    .select(CLOSURE_COLUMNS)
    .order("starts_on", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    throw new Error(`Impossibile caricare le chiusure: ${error.message}`);
  }

  return (data ?? []).map(mapClosure);
}

export type CreateSchoolClosureInput = {
  title: string;
  startsOn: string;
  endsOn: string;
  repeatsYearly: boolean;
};

export async function createSchoolClosure(
  client: LessonsClient,
  input: CreateSchoolClosureInput,
): Promise<LessonSettingsMutationResult> {
  const title = input.title.trim();
  if (!title) {
    return { success: false, errorMessage: "Il titolo è obbligatorio." };
  }
  if (!ISO_DATE_RE.test(input.startsOn) || !ISO_DATE_RE.test(input.endsOn)) {
    return { success: false, errorMessage: "Le date non sono valide." };
  }
  if (input.endsOn < input.startsOn) {
    return {
      success: false,
      errorMessage: "La fine deve essere successiva o uguale all'inizio.",
    };
  }

  const { data, error } = await client
    .from("school_closures")
    .insert({
      title,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      repeats_yearly: input.repeatsYearly,
    })
    .select("id")
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile salvare la festività.",
    };
  }

  return { success: true, id: data.id };
}

export async function deleteSchoolClosure(
  client: LessonsClient,
  id: string,
): Promise<LessonSettingsMutationResult> {
  if (!id.trim()) {
    return { success: false, errorMessage: "Festività non valida." };
  }

  const { error } = await client.from("school_closures").delete().eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile eliminare la festività.",
    };
  }

  return { success: true, id };
}

export async function listCoursePackPrices(
  client: LessonsClient,
): Promise<CoursePackPrice[]> {
  const { data, error } = await client
    .from("course_pack_prices")
    .select(PACK_PRICE_COLUMNS)
    .order("course_kind", { ascending: true })
    .order("duration_minutes", { ascending: true });

  if (error) {
    throw new Error(`Impossibile caricare il listino pacchetti: ${error.message}`);
  }

  return (data ?? []).map(mapPackPrice);
}

export async function updateCoursePackPrice(
  client: LessonsClient,
  id: string,
  amountEur: number | null,
): Promise<LessonSettingsMutationResult> {
  if (amountEur != null && (!Number.isFinite(amountEur) || amountEur < 0)) {
    return { success: false, errorMessage: "Importo non valido." };
  }

  const { error } = await client
    .from("course_pack_prices")
    .update({ amount_eur: amountEur })
    .eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile aggiornare il listino.",
    };
  }

  return { success: true, id };
}

export async function listPayRateTypes(
  client: LessonsClient,
  options: { includeInactive?: boolean } = {},
): Promise<PayRateType[]> {
  let query = client
    .from("pay_rate_types")
    .select(PAY_RATE_TYPE_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (!options.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Impossibile caricare le voci di retribuzione: ${error.message}`,
    );
  }

  return (data ?? []).map(mapPayRateType);
}

export type CreatePayRateTypeInput = {
  label: string;
  unit: PayRateUnit;
};

function slugifyPayRateLabel(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "voce";
}

function uniquePayRateSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
}

export async function createPayRateType(
  client: LessonsClient,
  input: CreatePayRateTypeInput,
): Promise<LessonSettingsMutationResult> {
  const label = input.label.trim();
  if (!label) {
    return { success: false, errorMessage: "Il nome della voce è obbligatorio." };
  }
  if (input.unit !== "hourly" && input.unit !== "per_head_per_lesson") {
    return { success: false, errorMessage: "Unità non valida." };
  }

  const { data: existing, error: listError } = await client
    .from("pay_rate_types")
    .select("slug, sort_order");

  if (listError) {
    return {
      success: false,
      errorMessage:
        listError.message || "Impossibile creare la voce di retribuzione.",
    };
  }

  const slugs = new Set((existing ?? []).map((row) => row.slug));
  const maxSort = (existing ?? []).reduce(
    (max, row) => (row.sort_order > max ? row.sort_order : max),
    0,
  );

  const { data, error } = await client
    .from("pay_rate_types")
    .insert({
      slug: uniquePayRateSlug(slugifyPayRateLabel(label), slugs),
      label,
      unit: input.unit,
      is_system: false,
      is_active: true,
      sort_order: maxSort + 10,
    })
    .select("id")
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile creare la voce di retribuzione.",
    };
  }

  return { success: true, id: data.id };
}

export async function getTeacherProfile(
  client: LessonsClient,
  memberId: string,
): Promise<TeacherProfile | null> {
  const { data, error } = await client
    .from("teacher_profiles")
    .select(TEACHER_PROFILE_COLUMNS)
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossibile caricare il profilo docente: ${error.message}`,
    );
  }

  if (!data) return null;
  return mapTeacherProfile(data);
}

export async function listTeacherPayRates(
  client: LessonsClient,
  memberId: string,
): Promise<TeacherPayRate[]> {
  const { data, error } = await client
    .from("teacher_pay_rates")
    .select(TEACHER_PAY_RATE_COLUMNS)
    .eq("member_id", memberId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Impossibile caricare le tariffe docente: ${error.message}`,
    );
  }

  return (data ?? []).map(mapTeacherPayRate);
}

export async function listTeacherSubjects(
  client: LessonsClient,
  memberId: string,
): Promise<TeacherSubject[]> {
  const { data, error } = await client
    .from("teacher_subjects")
    .select(TEACHER_SUBJECT_COLUMNS)
    .eq("member_id", memberId)
    .order("subject_id", { ascending: true });

  if (error) {
    throw new Error(
      `Impossibile caricare le materie del docente: ${error.message}`,
    );
  }

  return (data ?? []).map(mapTeacherSubject);
}

export async function upsertTeacherProfile(
  client: LessonsClient,
  memberId: string,
  patch: TeacherProfilePatch = {},
): Promise<LessonSettingsMutationResult> {
  const { error } = await client.from("teacher_profiles").upsert(
    {
      member_id: memberId,
      ...mapTeacherProfilePatch(patch),
    },
    { onConflict: "member_id" },
  );

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile salvare il profilo docente.",
    };
  }

  return { success: true, id: memberId };
}

export async function setTeacherPayRate(
  client: LessonsClient,
  memberId: string,
  payRateTypeId: string,
  amountEur: number,
): Promise<LessonSettingsMutationResult> {
  if (!Number.isFinite(amountEur) || amountEur < 0) {
    return { success: false, errorMessage: "Importo non valido." };
  }

  const { data, error } = await client
    .from("teacher_pay_rates")
    .upsert(
      {
        member_id: memberId,
        pay_rate_type_id: payRateTypeId,
        amount_eur: amountEur,
      },
      { onConflict: "member_id,pay_rate_type_id" },
    )
    .select("id")
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile salvare la tariffa.",
    };
  }

  return { success: true, id: data.id };
}

export async function setTeacherSubjects(
  client: LessonsClient,
  memberId: string,
  subjectIds: string[],
): Promise<LessonSettingsMutationResult> {
  const uniqueIds = [...new Set(subjectIds.filter((id) => id.trim()))];

  const { error: deleteError } = await client
    .from("teacher_subjects")
    .delete()
    .eq("member_id", memberId);

  if (deleteError) {
    return {
      success: false,
      errorMessage:
        deleteError.message || "Impossibile aggiornare le materie del docente.",
    };
  }

  if (uniqueIds.length === 0) {
    return { success: true, id: memberId };
  }

  const { error: insertError } = await client.from("teacher_subjects").insert(
    uniqueIds.map((subjectId) => ({
      member_id: memberId,
      subject_id: subjectId,
    })),
  );

  if (insertError) {
    return {
      success: false,
      errorMessage:
        insertError.message || "Impossibile aggiornare le materie del docente.",
    };
  }

  return { success: true, id: memberId };
}
