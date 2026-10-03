import type { SupabaseClient } from "@supabase/supabase-js";

import { getRomeDayBoundsUtc, listRooms, todayInRome } from "./bookings";
import { listLessonsOnDate, type CalendarLesson } from "./lessons-calendar";
import type { Database, Json } from "./types/database";

type BoardClient = SupabaseClient<Database>;

export const BOARD_LAYOUTS = ["aeroporto", "giorno", "notte", "viola"] as const;
export const BOARD_KINDS = ["timetable", "occupancy"] as const;

export type BoardLayout = (typeof BOARD_LAYOUTS)[number];
export type BoardKind = (typeof BOARD_KINDS)[number];
export type BoardColumnKey =
  | "start_date"
  | "start_time"
  | "duration"
  | "room"
  | "who"
  | "instrument"
  | "microphones"
  | "solo"
  | "course"
  | "site"
  | "teacher"
  | "teacher_alias"
  | "subject"
  | "enrolled"
  | "note";

export type BoardColumn = {
  key: BoardColumnKey;
  boardLabel: string;
  listLabel: string;
};

export type BoardColumnCatalogItem = BoardColumn & { hint: string };

export const BOARD_COLUMN_CATALOG: readonly BoardColumnCatalogItem[] = [
  {
    key: "start_time",
    boardLabel: "Ora",
    listLabel: "Ora",
    hint: "Ora di inizio",
  },
  {
    key: "room",
    boardLabel: "Sala",
    listLabel: "Sala",
    hint: "Sala",
  },
  {
    key: "who",
    boardLabel: "Allievo / Band",
    listLabel: "Allievo / Band",
    hint: "Allievo, band o prenotante",
  },
  {
    key: "instrument",
    boardLabel: "Strumento",
    listLabel: "Strumento",
    hint: "Strumento della lezione",
  },
  {
    key: "microphones",
    boardLabel: "Microfoni",
    listLabel: "Microfoni",
    hint: "Microfoni della prenotazione",
  },
  {
    key: "solo",
    boardLabel: "Da solo",
    listLabel: "Da solo",
    hint: "Provi da solo: sì o no",
  },
  {
    key: "start_date",
    boardLabel: "Data",
    listLabel: "Data",
    hint: "Data",
  },
  {
    key: "duration",
    boardLabel: "Durata",
    listLabel: "Durata",
    hint: "Minuti",
  },
  {
    key: "course",
    boardLabel: "Corso",
    listLabel: "Corso",
    hint: "Nome del corso",
  },
  {
    key: "teacher",
    boardLabel: "Docente",
    listLabel: "Docente",
    hint: "Nome e cognome del docente",
  },
  {
    key: "teacher_alias",
    boardLabel: "Docente",
    listLabel: "Docente (cognome)",
    hint: "Solo cognome del docente",
  },
  {
    key: "subject",
    boardLabel: "Materia",
    listLabel: "Materia",
    hint: "Materia",
  },
  {
    key: "site",
    boardLabel: "Sede",
    listLabel: "Sede",
    hint: "Nome della sede",
  },
  {
    key: "enrolled",
    boardLabel: "Iscritti",
    listLabel: "Iscritti",
    hint: "Numero iscritti",
  },
  {
    key: "note",
    boardLabel: "Nota",
    listLabel: "Nota",
    hint: "Prova o recupero",
  },
];

const COLUMN_KEYS = new Set<string>(BOARD_COLUMN_CATALOG.map((item) => item.key));

export type PublicDisplaySettings = {
  enabled: boolean;
  siteLabel: string;
};

export type PublicBoard = {
  id: string;
  kind: BoardKind;
  name: string;
  layout: BoardLayout;
  roomId: string | null;
  showIndividuals: boolean;
  rowCount: number;
  rowHeightPx: number;
  hideBrand: boolean;
  columns: BoardColumn[];
  sortOrder: number;
};

export type BoardStudent = { first: string; last: string };

export type BoardLessonSource = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  courseName: string;
  courseKind: "individuale" | "gruppo" | "online";
  subjectName: string;
  teacherFirst: string;
  teacherLast: string;
  roomName: string | null;
  students: BoardStudent[];
  enrolledCount: number;
  note: string;
  siteLabel: string;
  /** Allievo, band o prenotante. Vuoto: si ricava dal corso. */
  who: string;
  /** Strumento della lezione. Vuoto sulle prenotazioni sala. */
  instrument: string;
  /** Microfoni della prenotazione. Vuoto sulle lezioni. */
  microphones: string;
  /** «Sì» o «No» sulle prenotazioni. Vuoto sulle lezioni. */
  solo: string;
};

export type PublicBoardRow = {
  id: string;
  cells: string[];
  startsAt: string;
  endsAt: string;
};

export type PublicTimetableView = {
  boardId: string;
  name: string;
  layout: BoardLayout;
  hideBrand: boolean;
  siteLabel: string;
  rowCount: number;
  rowHeightPx: number;
  columns: { key: BoardColumnKey; boardLabel: string }[];
  rows: PublicBoardRow[];
};

export type OccupancyEvent = {
  roomId: string;
  startsAt: string;
  endsAt: string;
  label: string;
};

export type OccupancyCard = {
  roomId: string;
  roomName: string;
  state: "occupata" | "libera";
  nowLabel: string;
  nowTime: string;
  nextLabel: string;
  nextTime: string;
};

export type PublicOccupancyView = {
  boardId: string;
  name: string;
  layout: BoardLayout;
  hideBrand: boolean;
  siteLabel: string;
  rooms: OccupancyCard[];
};

export type BoardMutationResult = {
  success: boolean;
  errorMessage?: string;
  id?: string;
};

type BoardRow = Database["public"]["Tables"]["public_boards"]["Row"];
type SettingsRow = Database["public"]["Tables"]["public_display_settings"]["Row"];

const DEFAULT_COLUMN_KEYS: readonly BoardColumnKey[] = [
  "start_time",
  "room",
  "who",
  "instrument",
  "microphones",
  "solo",
];

export function defaultTimetableColumns(): BoardColumn[] {
  return BOARD_COLUMN_CATALOG.filter((item) =>
    DEFAULT_COLUMN_KEYS.includes(item.key),
  ).map(({ key, boardLabel, listLabel }) => ({ key, boardLabel, listLabel }));
}

export function layoutLabel(layout: BoardLayout): string {
  switch (layout) {
    case "aeroporto":
      return "Aeroporto";
    case "giorno":
      return "Giorno";
    case "notte":
      return "Notte";
    case "viola":
      return "Viola";
  }
}

export function studentPublicLabel(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  const initial = last
    ? `${last.charAt(0).toLocaleUpperCase("it-IT")}.`
    : "";
  return [first, initial].filter(Boolean).join(" ");
}

export function boardBookingWho(
  bandName: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const band = (bandName ?? "").trim();
  if (band) return band;
  return studentPublicLabel(firstName, lastName) || "Prenotazione";
}

export function soloLabel(proviDaSolo: boolean): string {
  return proviDaSolo ? "Sì" : "No";
}

export function bookingPublicLabel(
  title: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const person = studentPublicLabel(firstName, lastName);
  const cleaned = (title ?? "").trim();
  const last = (lastName ?? "").trim().toLocaleLowerCase("it-IT");
  if (!cleaned) return person || "Prenotazione";
  if (last && cleaned.toLocaleLowerCase("it-IT").includes(last)) {
    return person || "Prenotazione";
  }
  return cleaned;
}

export function formatRomeTime(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatRomeDayMonth(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));
}

export function formatRomeDayTitle(date: Date): string {
  const label = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return label.toLocaleUpperCase("it-IT");
}

function courseDisplayName(lesson: BoardLessonSource): string {
  if (lesson.courseKind !== "individuale") return lesson.courseName;
  const labels = lesson.students
    .map((student) => studentPublicLabel(student.first, student.last))
    .filter(Boolean);
  if (labels.length === 0) return lesson.courseName;
  if (labels.length === 1) return labels[0] ?? lesson.courseName;
  return `${labels[0]} +${labels.length - 1}`;
}

export function columnValue(key: BoardColumnKey, lesson: BoardLessonSource): string {
  switch (key) {
    case "start_date":
      return formatRomeDayMonth(lesson.startsAt);
    case "start_time":
      return formatRomeTime(lesson.startsAt);
    case "duration":
      return String(lesson.durationMinutes);
    case "course":
      return courseDisplayName(lesson);
    case "who":
      return lesson.who.trim() || courseDisplayName(lesson);
    case "instrument":
      return lesson.instrument.trim() || lesson.subjectName;
    case "microphones":
      return lesson.microphones;
    case "solo":
      return lesson.solo;
    case "site":
      return lesson.siteLabel;
    case "room":
      return lesson.roomName ?? (lesson.courseKind === "online" ? "Online" : "");
    case "teacher":
      return `${lesson.teacherFirst} ${lesson.teacherLast}`.trim();
    case "teacher_alias":
      return lesson.teacherLast.trim();
    case "subject":
      return lesson.subjectName;
    case "enrolled":
      return String(lesson.enrolledCount);
    case "note":
      return lesson.note;
  }
}

export function columnTrack(key: BoardColumnKey): string {
  if (key === "start_date" || key === "start_time") return "0.7fr";
  if (
    key === "duration" ||
    key === "enrolled" ||
    key === "note" ||
    key === "microphones" ||
    key === "solo"
  ) {
    return "0.55fr";
  }
  if (
    key === "course" ||
    key === "who" ||
    key === "teacher" ||
    key === "teacher_alias" ||
    key === "instrument"
  ) {
    return "1.35fr";
  }
  return "1fr";
}

export function parseBoardColumns(value: unknown): BoardColumn[] {
  if (!Array.isArray(value)) return defaultTimetableColumns();
  const parsed: BoardColumn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || !COLUMN_KEYS.has(row.key)) continue;
    const key = row.key as BoardColumnKey;
    const catalog = BOARD_COLUMN_CATALOG.find((entry) => entry.key === key);
    const boardLabel = String(row.boardLabel ?? "")
      .trim()
      .slice(0, 40);
    const listLabel = String(row.listLabel ?? "")
      .trim()
      .slice(0, 40);
    if (!boardLabel) continue;
    parsed.push({
      key,
      boardLabel,
      listLabel: listLabel || catalog?.listLabel || boardLabel,
    });
  }
  return parsed.length > 0 ? parsed.slice(0, 12) : defaultTimetableColumns();
}

export function sampleBoardCells(
  columns: BoardColumn[],
  siteLabel: string,
  showIndividuals: boolean,
): string[] {
  const lesson: BoardLessonSource = {
    startsAt: "2026-01-02T17:00:00.000Z",
    endsAt: "2026-01-02T18:00:00.000Z",
    durationMinutes: 60,
    courseName: "Analisi",
    courseKind: showIndividuals ? "individuale" : "gruppo",
    subjectName: "Archeologia",
    teacherFirst: "Luca",
    teacherLast: "Verdi",
    roomName: "Sala 1",
    students: [{ first: "Mario", last: "Rossi" }],
    enrolledCount: showIndividuals ? 1 : 8,
    note: "",
    siteLabel,
    who: "",
    instrument: "",
    microphones: "",
    solo: "",
  };
  return columns.map((column) => columnValue(column.key, lesson));
}

export function buildBoardRows(
  lessons: Array<BoardLessonSource & { id: string }>,
  columns: BoardColumn[],
): PublicBoardRow[] {
  return [...lessons]
    .filter((lesson) => lesson.startsAt && lesson.endsAt)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))
    .map((lesson) => ({
      id: lesson.id,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      cells: columns.map((column) => columnValue(column.key, lesson)),
    }));
}

export function rowsForScreen<T extends { endsAt: string }>(
  rows: T[],
  nowMs: number,
  rowCount: number,
): T[] {
  const live = rows.filter((row) => Date.parse(row.endsAt) > nowMs);
  if (live.length > 0) return live;
  const size = Math.max(1, rowCount);
  return rows.slice(-size);
}

export function sliceBoardPages<T>(items: T[], rowCount: number): T[][] {
  const size = Math.max(1, rowCount);
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

export function occupancyForRooms(
  rooms: { id: string; name: string }[],
  events: OccupancyEvent[],
  nowMs: number,
): OccupancyCard[] {
  return rooms.map((room) => {
    const mine = events
      .filter((event) => event.roomId === room.id)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const current = mine.find(
      (event) => Date.parse(event.startsAt) <= nowMs && Date.parse(event.endsAt) > nowMs,
    );
    const upcoming = mine.find((event) => Date.parse(event.startsAt) > nowMs);
    return {
      roomId: room.id,
      roomName: room.name,
      state: current ? "occupata" : "libera",
      nowLabel: current?.label ?? "Libera",
      nowTime: current ? timeRange(current.startsAt, current.endsAt) : "",
      nextLabel: upcoming?.label ?? "",
      nextTime: upcoming ? timeRange(upcoming.startsAt, upcoming.endsAt) : "",
    };
  });
}

function timeRange(startsAt: string, endsAt: string): string {
  return `${formatRomeTime(startsAt)}–${formatRomeTime(endsAt)}`;
}

function mapSettings(row: SettingsRow): PublicDisplaySettings {
  return {
    enabled: row.enabled,
    siteLabel: row.site_label,
  };
}

function mapBoard(row: BoardRow): PublicBoard {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    layout: row.layout,
    roomId: row.room_id,
    showIndividuals: row.show_individuals,
    rowCount: row.row_count,
    rowHeightPx: row.row_height_px,
    hideBrand: row.hide_brand,
    columns: parseBoardColumns(row.columns),
    sortOrder: row.sort_order,
  };
}

function fail(errorMessage: string): BoardMutationResult {
  return { success: false, errorMessage };
}

export async function getPublicDisplaySettings(
  client: BoardClient,
): Promise<PublicDisplaySettings | null> {
  const { data, error } = await client
    .from("public_display_settings")
    .select("id, enabled, site_label, updated_at")
    .eq("id", true)
    .maybeSingle();
  if (error) {
    throw new Error(`Impossibile leggere i tabelloni: ${error.message}`);
  }
  return data ? mapSettings(data) : null;
}

export async function savePublicDisplaySettings(
  client: BoardClient,
  input: { enabled: boolean; siteLabel: string },
): Promise<BoardMutationResult> {
  const siteLabel = input.siteLabel.trim().slice(0, 40);
  if (!siteLabel) return fail("Il nome della sede è obbligatorio.");
  const { error } = await client
    .from("public_display_settings")
    .update({
      enabled: input.enabled,
      site_label: siteLabel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return fail(error.message);
  return { success: true };
}

export async function listPublicBoards(client: BoardClient): Promise<PublicBoard[]> {
  const { data, error } = await client
    .from("public_boards")
    .select(
      "id, kind, name, layout, room_id, show_individuals, row_count, row_height_px, hide_brand, columns, sort_order, created_at, updated_at",
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Impossibile leggere i tabelloni: ${error.message}`);
  return (data ?? []).map(mapBoard);
}

export async function getPublicBoard(
  client: BoardClient,
  id: string,
): Promise<PublicBoard | null> {
  const { data, error } = await client
    .from("public_boards")
    .select(
      "id, kind, name, layout, room_id, show_individuals, row_count, row_height_px, hide_brand, columns, sort_order, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Impossibile leggere il tabellone: ${error.message}`);
  return data ? mapBoard(data) : null;
}

export type PublicBoardInput = {
  name: string;
  layout: BoardLayout;
  roomId: string | null;
  showIndividuals: boolean;
  rowCount: number;
  rowHeightPx: number;
  hideBrand: boolean;
  columns: BoardColumn[];
};

function strictColumns(columns: BoardColumn[]): BoardColumn[] | null {
  if (!Array.isArray(columns) || columns.length === 0 || columns.length > 12) return null;
  const parsed: BoardColumn[] = [];
  for (const column of columns) {
    if (!column || !COLUMN_KEYS.has(column.key)) return null;
    const boardLabel = column.boardLabel.trim().slice(0, 40);
    const listLabel = column.listLabel.trim().slice(0, 40);
    if (!boardLabel) return null;
    parsed.push({
      key: column.key,
      boardLabel,
      listLabel: listLabel || boardLabel,
    });
  }
  return parsed;
}

function sanitizeBoardInput(input: PublicBoardInput): PublicBoardInput | string {
  const name = input.name.trim().slice(0, 80);
  if (!name) return "Il nome è obbligatorio.";
  if (!BOARD_LAYOUTS.includes(input.layout)) return "Layout non valido.";
  if (!Number.isInteger(input.rowCount) || input.rowCount < 3 || input.rowCount > 24) {
    return "Il numero di righe va da 3 a 24.";
  }
  if (
    !Number.isInteger(input.rowHeightPx) ||
    input.rowHeightPx < 36 ||
    input.rowHeightPx > 160
  ) {
    return "L'altezza riga va da 36 a 160 px.";
  }
  const columns = strictColumns(input.columns);
  if (!columns) return "Serve almeno una colonna valida.";
  return {
    name,
    layout: input.layout,
    roomId: input.roomId,
    showIndividuals: input.showIndividuals,
    rowCount: input.rowCount,
    rowHeightPx: input.rowHeightPx,
    hideBrand: input.hideBrand,
    columns,
  };
}

function columnsJson(columns: BoardColumn[]): Json {
  return columns.map((column) => ({
    key: column.key,
    boardLabel: column.boardLabel,
    listLabel: column.listLabel,
  }));
}

export async function createPublicBoard(
  client: BoardClient,
  input: { kind: BoardKind; name?: string },
): Promise<BoardMutationResult> {
  if (!BOARD_KINDS.includes(input.kind)) return fail("Tipo di tabellone non valido.");
  const existing = await listPublicBoards(client);
  const name =
    input.name?.trim() || (input.kind === "occupancy" ? "Aule" : "Orari");
  const { data, error } = await client
    .from("public_boards")
    .insert({
      kind: input.kind,
      name: name.slice(0, 80),
      layout: input.kind === "occupancy" ? "giorno" : "aeroporto",
      show_individuals: true,
      row_count: 7,
      row_height_px: 70,
      columns: columnsJson(defaultTimetableColumns()),
      sort_order: existing.length,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);
  return { success: true, id: data.id };
}

export async function updatePublicBoard(
  client: BoardClient,
  id: string,
  input: PublicBoardInput,
): Promise<BoardMutationResult> {
  const sanitized = sanitizeBoardInput(input);
  if (typeof sanitized === "string") return fail(sanitized);
  const { error } = await client
    .from("public_boards")
    .update({
      name: sanitized.name,
      layout: sanitized.layout,
      room_id: sanitized.roomId,
      show_individuals: sanitized.showIndividuals,
      row_count: sanitized.rowCount,
      row_height_px: sanitized.rowHeightPx,
      hide_brand: sanitized.hideBrand,
      columns: columnsJson(sanitized.columns),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return fail(error.message);
  return { success: true, id };
}

export async function deletePublicBoard(
  client: BoardClient,
  id: string,
): Promise<BoardMutationResult> {
  const { error } = await client.from("public_boards").delete().eq("id", id);
  if (error) return fail(error.message);
  return { success: true, id };
}

const VISIBLE_COURSE_STATUS = new Set(["attivo", "in_attesa"]);

function lessonNote(kind: CalendarLesson["kind"]): string {
  if (kind === "prova") return "Prova";
  if (kind === "recupero") return "Recupero";
  return "";
}

async function studentsByCourse(
  client: BoardClient,
  courseIds: string[],
): Promise<Map<string, BoardStudent[]>> {
  const grouped = new Map<string, BoardStudent[]>();
  if (courseIds.length === 0) return grouped;
  const { data: enrollments, error } = await client
    .from("course_enrollments")
    .select("course_id, member_id")
    .in("course_id", courseIds)
    .is("left_at", null);
  if (error) throw new Error(error.message);
  const memberIds = [...new Set((enrollments ?? []).map((row) => row.member_id))];
  if (memberIds.length === 0) return grouped;
  const { data: members, error: memberError } = await client
    .from("members")
    .select("id, first_name, last_name")
    .in("id", memberIds);
  if (memberError) throw new Error(memberError.message);
  const byId = new Map((members ?? []).map((member) => [member.id, member]));
  for (const enrollment of enrollments ?? []) {
    const member = byId.get(enrollment.member_id);
    if (!member) continue;
    const list = grouped.get(enrollment.course_id) ?? [];
    list.push({ first: member.first_name, last: member.last_name });
    grouped.set(enrollment.course_id, list);
  }
  return grouped;
}

function visibleLessons(
  lessons: CalendarLesson[],
  board: PublicBoard,
  dropIndividuals: boolean,
): CalendarLesson[] {
  return lessons.filter((lesson) => {
    if (!lesson.startsAt || !lesson.endsAt || lesson.cancelledAt) return false;
    if (lesson.placement !== "scheduled") return false;
    if (!VISIBLE_COURSE_STATUS.has(lesson.courseStatus)) return false;
    if (board.roomId && lesson.roomId !== board.roomId) return false;
    if (dropIndividuals && lesson.courseKind === "individuale") return false;
    return true;
  });
}

type BoardBookingSlot = {
  id: string;
  roomId: string;
  roomName: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  who: string;
  microphones: string;
  solo: string;
};

async function listBoardBookings(
  client: BoardClient,
  board: PublicBoard,
  date: string,
  skipIds: Set<string>,
): Promise<BoardBookingSlot[]> {
  const { startUtc, endUtc } = getRomeDayBoundsUtc(date);
  const { data: bookings, error } = await client
    .from("bookings")
    .select(
      "id, room_id, member_id, band_id, start_at, end_at, status, cancelled_at, microphone_count, provi_da_solo, source",
    )
    .gte("start_at", startUtc)
    .lt("start_at", endUtc)
    .in("status", ["confirmed", "pending_approval"]);
  if (error) throw new Error(error.message);

  const visible = (bookings ?? []).filter(
    (booking) =>
      !booking.cancelled_at &&
      booking.source !== "lesson" &&
      !skipIds.has(booking.id) &&
      (!board.roomId || booking.room_id === board.roomId),
  );
  if (visible.length === 0) return [];

  const memberIds = [...new Set(visible.map((booking) => booking.member_id))];
  const bandIds = [
    ...new Set(
      visible
        .map((booking) => booking.band_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const roomIds = [...new Set(visible.map((booking) => booking.room_id))];
  const [membersRes, bandsRes, roomsRes] = await Promise.all([
    client.from("members").select("id, first_name, last_name").in("id", memberIds),
    bandIds.length > 0
      ? client.from("bands").select("id, name").in("id", bandIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    client.from("rooms").select("id, name").in("id", roomIds),
  ]);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (bandsRes.error) throw new Error(bandsRes.error.message);
  if (roomsRes.error) throw new Error(roomsRes.error.message);

  const memberById = new Map((membersRes.data ?? []).map((member) => [member.id, member]));
  const bandById = new Map((bandsRes.data ?? []).map((band) => [band.id, band.name]));
  const roomById = new Map((roomsRes.data ?? []).map((room) => [room.id, room.name]));

  return visible.map((booking) => {
    const member = memberById.get(booking.member_id);
    return {
      id: booking.id,
      roomId: booking.room_id,
      roomName: roomById.get(booking.room_id) ?? null,
      startsAt: booking.start_at,
      endsAt: booking.end_at,
      durationMinutes: Math.max(
        0,
        Math.round((Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 60_000),
      ),
      who: boardBookingWho(
        booking.band_id ? bandById.get(booking.band_id) : null,
        member?.first_name,
        member?.last_name,
      ),
      microphones: String(booking.microphone_count ?? 0),
      solo: soloLabel(booking.provi_da_solo),
    };
  });
}

export async function loadPublicTimetable(
  client: BoardClient,
  board: PublicBoard,
  settings: PublicDisplaySettings,
  date: string = todayInRome(),
): Promise<PublicTimetableView> {
  const lessons = visibleLessons(
    await listLessonsOnDate(client, date, { includePendingHold: true }),
    board,
    !board.showIndividuals,
  );
  const students = await studentsByCourse(
    client,
    [...new Set(lessons.map((lesson) => lesson.courseId))],
  );
  const sources = lessons.map((lesson) => {
    const enrolled = students.get(lesson.courseId) ?? [];
    const duration =
      lesson.startsAt && lesson.endsAt
        ? Math.max(
            0,
            Math.round(
              (Date.parse(lesson.endsAt) - Date.parse(lesson.startsAt)) / 60_000,
            ),
          )
        : 0;
    return {
      id: lesson.id,
      startsAt: lesson.startsAt ?? "",
      endsAt: lesson.endsAt ?? "",
      durationMinutes: duration,
      courseName: lesson.courseName,
      courseKind: lesson.courseKind,
      subjectName: lesson.subjectName,
      teacherFirst: lesson.titularFirstName,
      teacherLast: lesson.titularLastName,
      roomName: lesson.roomName,
      students: enrolled,
      enrolledCount: enrolled.length,
      note: lessonNote(lesson.kind),
      siteLabel: settings.siteLabel,
      who: "",
      instrument: lesson.subjectName,
      microphones: "",
      solo: "",
    };
  });
  const bookings = await listBoardBookings(
    client,
    board,
    date,
    new Set(lessons.map((lesson) => lesson.bookingId).filter((id): id is string => Boolean(id))),
  );
  sources.push(
    ...bookings.map((booking) => ({
      id: `booking:${booking.id}`,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      durationMinutes: booking.durationMinutes,
      courseName: "",
      courseKind: "gruppo" as const,
      subjectName: "",
      teacherFirst: "",
      teacherLast: "",
      roomName: booking.roomName,
      students: [],
      enrolledCount: 0,
      note: "",
      siteLabel: settings.siteLabel,
      who: booking.who,
      instrument: "",
      microphones: booking.microphones,
      solo: booking.solo,
    })),
  );
  return {
    boardId: board.id,
    name: board.name,
    layout: board.layout,
    hideBrand: board.hideBrand,
    siteLabel: settings.siteLabel,
    rowCount: board.rowCount,
    rowHeightPx: board.rowHeightPx,
    columns: board.columns.map((column) => ({
      key: column.key,
      boardLabel: column.boardLabel,
    })),
    rows: buildBoardRows(sources, board.columns),
  };
}

export async function loadPublicOccupancy(
  client: BoardClient,
  board: PublicBoard,
  settings: PublicDisplaySettings,
  date: string = todayInRome(),
  nowMs: number = Date.now(),
): Promise<PublicOccupancyView> {
  const [lessonRows, rooms] = await Promise.all([
    listLessonsOnDate(client, date, { includePendingHold: true }),
    listRooms(client),
  ]);
  const lessons = visibleLessons(lessonRows, board, false);
  const students = await studentsByCourse(
    client,
    [...new Set(lessons.map((lesson) => lesson.courseId))],
  );
  const lessonBookingIds = new Set(
    lessonRows
      .map((lesson) => lesson.bookingId)
      .filter((id): id is string => Boolean(id)),
  );
  const events: OccupancyEvent[] = [];
  for (const lesson of lessons) {
    if (!lesson.roomId || !lesson.startsAt || !lesson.endsAt) continue;
    const enrolled = students.get(lesson.courseId) ?? [];
    const source: BoardLessonSource = {
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      durationMinutes: 0,
      courseName: lesson.courseName,
      courseKind: lesson.courseKind,
      subjectName: lesson.subjectName,
      teacherFirst: lesson.titularFirstName,
      teacherLast: lesson.titularLastName,
      roomName: lesson.roomName,
      students: enrolled,
      enrolledCount: enrolled.length,
      note: "",
      siteLabel: settings.siteLabel,
      who: "",
      instrument: lesson.subjectName,
      microphones: "",
      solo: "",
    };
    events.push({
      roomId: lesson.roomId,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      label:
        !board.showIndividuals && lesson.courseKind === "individuale"
          ? "Lezione"
          : columnValue("course", source),
    });
  }

  const bookings = await listBoardBookings(client, board, date, lessonBookingIds);
  for (const booking of bookings) {
    events.push({
      roomId: booking.roomId,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      label: booking.who,
    });
  }

  const visibleRooms = rooms
    .filter((room) => !board.roomId || room.id === board.roomId)
    .map((room) => ({ id: room.id, name: room.name }));

  return {
    boardId: board.id,
    name: board.name,
    layout: board.layout,
    hideBrand: board.hideBrand,
    siteLabel: settings.siteLabel,
    rooms: occupancyForRooms(visibleRooms, events, nowMs),
  };
}
