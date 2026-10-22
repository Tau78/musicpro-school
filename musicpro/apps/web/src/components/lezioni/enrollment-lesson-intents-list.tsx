import Link from "next/link";

import {
  enrollmentLessonIntentPaymentLabel,
  type EnrollmentLessonIntent,
} from "@musicpro/database";

import { EnrollmentLessonIntentReconcileButton } from "@/components/lezioni/enrollment-lesson-intent-reconcile-button";

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentBadgeClass(
  state: EnrollmentLessonIntent["paymentState"],
): string {
  switch (state) {
    case "converted":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "paid_unreconciled":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    default:
      return "bg-neutral-100 text-neutral-700 ring-neutral-200";
  }
}

export function EnrollmentLessonIntentsList({
  items,
  mode,
  actorMemberId,
}: {
  items: EnrollmentLessonIntent[];
  mode: "staff" | "teacher";
  actorMemberId?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-600">
        {mode === "staff"
          ? "Nessuna richiesta di iscrizione lezioni in coda."
          : "Nessuna richiesta collegata a te."}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {items.map((item) => {
        const calendarTeacherId =
          item.convertedTitularMemberId ??
          item.preferredTeacherMemberId ??
          null;
        const showStaffReconcile =
          mode === "staff" &&
          Boolean(actorMemberId) &&
          item.paymentState !== "converted";

        return (
          <li
            key={item.id}
            className="flex min-w-0 max-w-full flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium text-neutral-900">
                {item.memberLabel}
              </p>
              <p className="text-sm text-neutral-700">
                Corso richiesto:{" "}
                <span className="font-medium">{item.requestedCourseName}</span>
              </p>
              <p className="text-sm text-neutral-600">
                Docente preferito:{" "}
                {item.preferredTeacherLabel ?? (
                  <span className="text-neutral-400">—</span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${paymentBadgeClass(item.paymentState)}`}
                >
                  {enrollmentLessonIntentPaymentLabel(item.paymentState)}
                </span>
                <span className="text-xs text-neutral-500">
                  {item.membershipEnrollmentLabel}
                </span>
                <span className="text-xs text-neutral-400">
                  {formatCreatedAt(item.createdAt)}
                </span>
              </div>
            </div>

            <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:items-end">
              {showStaffReconcile ? (
                <EnrollmentLessonIntentReconcileButton
                  intentId={item.id}
                  actorMemberId={actorMemberId!}
                />
              ) : null}

              {item.convertedCourseId ? (
                <div className="flex flex-wrap gap-2">
                  {mode === "staff" ? (
                    <Link
                      href={`/admin/lezioni/corsi/${item.convertedCourseId}`}
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5"
                    >
                      Apri corso
                    </Link>
                  ) : null}
                  {calendarTeacherId ? (
                    <Link
                      href={
                        mode === "staff"
                          ? `/admin/lezioni/calendario?docente=${encodeURIComponent(calendarTeacherId)}`
                          : `/lezioni/calendario?docente=${encodeURIComponent(calendarTeacherId)}`
                      }
                      className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                    >
                      Apri calendario
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
