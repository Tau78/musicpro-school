import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cancelHoldBooking,
  createLessonBooking,
  type CourseMutationResult,
} from "./courses";
import { moveLesson } from "./lessons-calendar";
import type { Database } from "./types/database";

type RequestsClient = SupabaseClient<Database>;

type RequestRow = Pick<
  Database["public"]["Tables"]["lesson_change_requests"]["Row"],
  | "id"
  | "lesson_id"
  | "course_id"
  | "requested_starts_at"
  | "requested_room_id"
  | "scope"
  | "note"
  | "status"
  | "hold_booking_id"
  | "created_by"
  | "created_at"
>;

export type LessonChangeRequest = {
  id: string;
  lessonId: string;
  courseId: string;
  requestedStartsAt: string;
  requestedRoomId: string | null;
  originalStartsAt: string | null;
  originalRoomId: string | null;
  scope: "this" | "future";
  note: string | null;
  status: "pending" | "approved" | "rejected";
  holdBookingId: string | null;
  createdBy: string | null;
  createdAt: string;
};

const REQUEST_COLUMNS =
  "id, lesson_id, course_id, requested_starts_at, requested_room_id, scope, note, status, hold_booking_id, created_by, created_at";

function fail(
  errorMessage: string,
  extras: Partial<CourseMutationResult> = {},
): CourseMutationResult {
  return { success: false, errorMessage, ...extras };
}

function ok(id?: string, warnings?: string[]): CourseMutationResult {
  const result: CourseMutationResult = { success: true };
  if (id) result.id = id;
  if (warnings && warnings.length > 0) result.warnings = warnings;
  return result;
}

function mapRequest(
  row: RequestRow,
  original?: { startsAt: string | null; roomId: string | null },
): LessonChangeRequest {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    courseId: row.course_id,
    requestedStartsAt: row.requested_starts_at,
    requestedRoomId: row.requested_room_id,
    originalStartsAt: original?.startsAt ?? null,
    originalRoomId: original?.roomId ?? null,
    scope: row.scope,
    note: row.note,
    status: row.status,
    holdBookingId: row.hold_booking_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

async function restoreRequestHold(
  client: RequestsClient,
  request: LessonChangeRequest,
): Promise<void> {
  if (!request.requestedRoomId || !request.requestedStartsAt) return;
  const { data: course } = await client
    .from("courses")
    .select("titular_member_id, name, duration_minutes")
    .eq("id", request.courseId)
    .maybeSingle();
  if (!course) return;
  const booked = await createLessonBooking(client, {
    roomId: request.requestedRoomId,
    memberId: course.titular_member_id,
    startAt: request.requestedStartsAt,
    endAt: addMinutesIso(request.requestedStartsAt, course.duration_minutes),
    title: `Richiesta spostamento: ${course.name}`,
  });
  if (!booked.bookingId) return;
  await client
    .from("lesson_change_requests")
    .update({ hold_booking_id: booked.bookingId })
    .eq("id", request.id)
    .eq("status", "pending");
}

async function releaseHold(
  client: RequestsClient,
  requestId: string,
  holdBookingId: string | null,
): Promise<string | null> {
  if (!holdBookingId) return null;
  const cancelError = await cancelHoldBooking(client, holdBookingId);
  if (cancelError) return cancelError;
  const { error } = await client
    .from("lesson_change_requests")
    .update({ hold_booking_id: null })
    .eq("id", requestId)
    .eq("status", "pending");
  if (error) return error.message || "Impossibile rilasciare l'hold.";
  return null;
}

export async function listPendingLessonChangeRequests(
  client: RequestsClient,
): Promise<LessonChangeRequest[]> {
  const { data, error } = await client
    .from("lesson_change_requests")
    .select(REQUEST_COLUMNS)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Impossibile caricare le richieste di spostamento: ${error.message}`,
    );
  }
  const rows = data ?? [];
  const lessonIds = [...new Set(rows.map((row) => row.lesson_id))];
  const originals = new Map<
    string,
    { startsAt: string | null; roomId: string | null }
  >();
  if (lessonIds.length > 0) {
    const { data: lessons, error: lessonError } = await client
      .from("lessons")
      .select("id, starts_at, room_id")
      .in("id", lessonIds);
    if (lessonError) {
      throw new Error(
        `Impossibile caricare gli orari originali: ${lessonError.message}`,
      );
    }
    for (const lesson of lessons ?? []) {
      originals.set(lesson.id, {
        startsAt: lesson.starts_at,
        roomId: lesson.room_id,
      });
    }
  }
  return rows.map((row) => mapRequest(row, originals.get(row.lesson_id)));
}

export async function reviewLessonChangeRequest(
  client: RequestsClient,
  requestId: string,
  input: { approve: boolean; actorMemberId: string },
): Promise<CourseMutationResult> {
  if (!input.actorMemberId.trim()) {
    return fail("Autore della revisione mancante.");
  }

  const { data, error } = await client
    .from("lesson_change_requests")
    .select(REQUEST_COLUMNS)
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    return fail(error.message || "Impossibile caricare la richiesta.");
  }
  if (!data) {
    return fail("Richiesta non trovata o già gestita.");
  }

  const request = mapRequest(data);

  // Rilascia l'hold prima di moveLesson: altrimenti lo slot resta occupato (SLOT_TAKEN).
  const holdError = await releaseHold(client, request.id, request.holdBookingId);
  if (holdError) return fail(holdError);

  if (input.approve) {
    const { data: original } = await client
      .from("lessons")
      .select("starts_at, room_id")
      .eq("id", request.lessonId)
      .maybeSingle();

    const moved = await moveLesson(client, request.lessonId, {
      startsAt: request.requestedStartsAt,
      roomId: request.requestedRoomId,
      scope: request.scope,
      actor: {
        memberId: input.actorMemberId,
        isStaff: true,
        canReschedule: true,
      },
    });
    if (!moved.success) {
      await restoreRequestHold(client, request);
      return moved;
    }

    const { error: updateError } = await client
      .from("lesson_change_requests")
      .update({ status: "approved" })
      .eq("id", request.id)
      .eq("status", "pending");
    if (updateError) {
      if (original?.starts_at) {
        await moveLesson(client, request.lessonId, {
          startsAt: original.starts_at,
          roomId: original.room_id,
          scope: "this",
          actor: {
            memberId: input.actorMemberId,
            isStaff: true,
            canReschedule: true,
          },
        });
      }
      await restoreRequestHold(client, request);
      return fail(
        updateError.message || "Impossibile approvare la richiesta.",
        { warnings: moved.warnings },
      );
    }
    return ok(request.id, moved.warnings);
  }

  const { error: rejectError } = await client
    .from("lesson_change_requests")
    .update({ status: "rejected" })
    .eq("id", request.id)
    .eq("status", "pending");
  if (rejectError) {
    return fail(rejectError.message || "Impossibile rifiutare la richiesta.");
  }
  return ok(request.id);
}
