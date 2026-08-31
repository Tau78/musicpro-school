import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { CalendarLesson } from "@musicpro/database";

import { lessonColor } from "@/lib/lezioni-colors";
import {
  formatRelativeLesson,
  formatRomeDay,
  formatRomeTime,
} from "@/lib/lezioni-dates";
import { normalizeItPhoneForWa } from "@/lib/phone";

import { AttendancePanel } from "./attendance-panel";
import { LessonKindLegend } from "./lesson-kind-legend";

const NAVY = "#1e3a5f";

export type OggiListProps = {
  lessons: CalendarLesson[];
  arrears?: CalendarLesson[];
  actorMemberId: string;
  onSaved?: () => void;
  nowIso?: string;
  onOpenCalendar?: () => void;
  onNewTrial?: () => void;
};

/** Campi telefono opzionali (stesso ordine di `studentNames`; possono mancare sul tipo). */
type LessonWithPhones = CalendarLesson & { studentPhones?: string[] };

function isHoldLesson(lesson: CalendarLesson): boolean {
  return lesson.id.startsWith("hold:") || lesson.courseStatus === "in_attesa";
}

function dateInRome(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function lessonTitle(lesson: CalendarLesson): string {
  return lesson.courseName.trim() || lesson.studentNames[0] || "Lezione";
}

function roomLabel(lesson: CalendarLesson): string {
  return lesson.courseKind === "online" ? "Online" : (lesson.roomName ?? "—");
}

function isInProgress(
  lesson: CalendarLesson,
  nowMs: number,
): boolean {
  if (!lesson.startsAt || !lesson.endsAt) return false;
  const start = new Date(lesson.startsAt).getTime();
  const end = new Date(lesson.endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return nowMs >= start && nowMs < end;
}

/** Prossima: in corso → prima upcoming → altrimenti prima non-hold del giorno. */
function pickNextLesson(
  lessons: CalendarLesson[],
  nowMs: number,
): CalendarLesson | null {
  const active = lessons
    .filter((l) => !isHoldLesson(l) && l.startsAt)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime(),
    );
  if (active.length === 0) return null;

  const inProgress = active.find((l) => isInProgress(l, nowMs));
  if (inProgress) return inProgress;

  const upcoming = active.find((l) => {
    const start = new Date(l.startsAt!).getTime();
    return !Number.isNaN(start) && start >= nowMs;
  });
  if (upcoming) return upcoming;

  // Tutte finite: niente hero «Prossima».
  return null;
}

function firstUsablePhone(lesson: LessonWithPhones): string | null {
  const phones = lesson.studentPhones;
  if (!phones?.length) return null;
  for (const raw of phones) {
    const trimmed = raw?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function daySummaryText(
  lessons: CalendarLesson[],
  arrearsCount: number,
): string {
  const n = lessons.length;
  const toInsert = lessons.filter(
    (l) => !isHoldLesson(l) && !l.hasAttendance,
  ).length;
  const parts = [
    `${n} ${n === 1 ? "lezione" : "lezioni"}`,
  ];
  if (toInsert > 0) {
    parts.push(
      `${toInsert} da inserire`,
    );
  }
  if (arrearsCount > 0) {
    parts.push(
      `${arrearsCount} ${arrearsCount === 1 ? "arretrato" : "arretrati"}`,
    );
  }
  return parts.join(" · ");
}

export function OggiList({
  lessons,
  arrears = [],
  actorMemberId,
  onSaved,
  nowIso,
  onOpenCalendar,
  onNewTrial,
}: OggiListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const nowMs = (nowIso ? new Date(nowIso) : new Date()).getTime();
  const next = pickNextLesson(lessons, nowMs);
  const summary = daySummaryText(lessons, arrears.length);

  function toggleLesson(lesson: CalendarLesson) {
    if (isHoldLesson(lesson)) return;
    setExpandedId((current) => (current === lesson.id ? null : lesson.id));
  }

  if (lessons.length === 0) {
    return (
      <View>
        <EmptyOggi
          onOpenCalendar={onOpenCalendar}
          onNewTrial={onNewTrial}
        />
        {arrears.length > 0 ? (
          <View style={styles.arrearsBlock}>
            <Text style={styles.sectionTitle}>Arretrati</Text>
            {arrears.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                showDate
                expanded={expandedId === lesson.id && !isHoldLesson(lesson)}
                actorMemberId={actorMemberId}
                nowMs={nowMs}
                onPress={() => toggleLesson(lesson)}
                onSaved={onSaved}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      {next ? (
        <NextLessonHero lesson={next} nowIso={nowIso} />
      ) : null}

      <Text style={styles.summary}>{summary}</Text>
      <LessonKindLegend />

      {lessons.map((lesson) => (
        <LessonCard
          key={lesson.id}
          lesson={lesson}
          expanded={expandedId === lesson.id && !isHoldLesson(lesson)}
          actorMemberId={actorMemberId}
          nowMs={nowMs}
          onPress={() => toggleLesson(lesson)}
          onSaved={onSaved}
        />
      ))}

      {arrears.length > 0 ? (
        <View style={styles.arrearsBlock}>
          <Text style={styles.sectionTitle}>Arretrati</Text>
          {arrears.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              showDate
              expanded={expandedId === lesson.id && !isHoldLesson(lesson)}
              actorMemberId={actorMemberId}
              nowMs={nowMs}
              onPress={() => toggleLesson(lesson)}
              onSaved={onSaved}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function NextLessonHero({
  lesson,
  nowIso,
}: {
  lesson: CalendarLesson;
  nowIso?: string;
}) {
  const start = formatRomeTime(lesson.startsAt);
  const end = lesson.endsAt ? formatRomeTime(lesson.endsAt) : null;
  const students = lesson.studentNames.filter(Boolean).join(", ");
  const relative = formatRelativeLesson(
    lesson.startsAt,
    nowIso,
    lesson.endsAt,
  );

  return (
    <View style={styles.hero} accessibilityRole="summary">
      <Text style={styles.heroEyebrow}>Prossima</Text>
      <Text style={styles.heroTime}>
        {end ? `${start}–${end}` : start}
      </Text>
      <Text style={styles.heroRelative}>{relative}</Text>
      <Text style={styles.heroCourse} numberOfLines={2}>
        {lessonTitle(lesson)}
      </Text>
      <Text style={styles.heroMeta} numberOfLines={2}>
        {students || "—"}
        {" · "}
        {roomLabel(lesson)}
      </Text>
    </View>
  );
}

function EmptyOggi({
  onOpenCalendar,
  onNewTrial,
}: {
  onOpenCalendar?: () => void;
  onNewTrial?: () => void;
}) {
  const hasActions = Boolean(onOpenCalendar || onNewTrial);
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>Nessuna lezione oggi</Text>
      <Text style={styles.emptyHint}>
        Controlla il calendario o crea una prova.
      </Text>
      {hasActions ? (
        <View style={styles.emptyActions}>
          {onOpenCalendar ? (
            <Pressable
              onPress={onOpenCalendar}
              style={styles.emptyBtn}
              accessibilityRole="button"
            >
              <Text style={styles.emptyBtnText}>Apri calendario</Text>
            </Pressable>
          ) : null}
          {onNewTrial ? (
            <Pressable
              onPress={onNewTrial}
              style={[styles.emptyBtn, styles.emptyBtnSecondary]}
              accessibilityRole="button"
            >
              <Text style={[styles.emptyBtnText, styles.emptyBtnTextSecondary]}>
                Nuova prova
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LessonCard({
  lesson,
  showDate = false,
  expanded,
  actorMemberId,
  nowMs,
  onPress,
  onSaved,
}: {
  lesson: CalendarLesson;
  showDate?: boolean;
  expanded: boolean;
  actorMemberId: string;
  nowMs: number;
  onPress: () => void;
  onSaved?: () => void;
}) {
  const hold = isHoldLesson(lesson);
  const inProgress = !hold && isInProgress(lesson, nowMs);
  const color = lessonColor({
    courseKind: lesson.courseKind,
    isTrial: lesson.isTrial,
  });
  const start = formatRomeTime(lesson.startsAt);
  const end = lesson.endsAt ? formatRomeTime(lesson.endsAt) : null;
  const students = lesson.studentNames.filter(Boolean).join(", ");
  const room = roomLabel(lesson);
  const dayLabel =
    showDate && lesson.startsAt
      ? formatRomeDay(dateInRome(lesson.startsAt))
      : null;
  const phone = firstUsablePhone(lesson as LessonWithPhones);
  const waDigits = phone ? normalizeItPhoneForWa(phone) : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: color.bg,
          borderColor: inProgress ? NAVY : color.border,
          borderWidth: inProgress ? 2.5 : 1,
          borderStyle: hold ? "dashed" : "solid",
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={hold}
        accessibilityRole="button"
        accessibilityState={{ expanded: hold ? undefined : expanded }}
      >
        <View style={styles.cardRow}>
          <View
            style={[
              styles.kindDot,
              { backgroundColor: color.bg, borderColor: color.border },
            ]}
          />
          <View style={styles.cardBody}>
            <View style={styles.timeRow}>
              <Text style={[styles.time, { color: color.text }]}>
                {end ? `${start}–${end}` : start}
              </Text>
              {inProgress ? (
                <View style={styles.badgeOra}>
                  <Text style={styles.badgeOraText}>Ora</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.courseName} numberOfLines={2}>
              {dayLabel ? (
                <Text style={styles.dayLabel}>{dayLabel} </Text>
              ) : null}
              <Text style={styles.seq}>#{lesson.sequenceNumber} </Text>
              {lessonTitle(lesson)}
            </Text>
            <Text style={styles.meta} numberOfLines={2}>
              {students || "—"}
              {" · "}
              {room}
            </Text>
          </View>
          {hold ? null : lesson.hasAttendance ? (
            <View style={styles.badgeOk}>
              <Text style={styles.badgeOkText}>OK</Text>
            </View>
          ) : (
            <View style={styles.badgeTodo}>
              <Text style={styles.badgeTodoText}>Da inserire</Text>
            </View>
          )}
        </View>
      </Pressable>

      {phone && !hold ? (
        <View style={styles.quickActions}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              void Linking.openURL(`tel:${phone}`);
            }}
            style={styles.quickBtn}
            accessibilityRole="button"
            accessibilityLabel={`Chiama ${phone}`}
          >
            <Text style={styles.quickBtnText}>Chiama</Text>
          </Pressable>
          {waDigits ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                void Linking.openURL(`https://wa.me/${waDigits}`);
              }}
              style={styles.quickBtn}
              accessibilityRole="button"
              accessibilityLabel="Apri WhatsApp"
            >
              <Text style={styles.quickBtnText}>WhatsApp</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.panel}>
          <AttendancePanel
            lessonId={lesson.id}
            actorMemberId={actorMemberId}
            onSaved={onSaved}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 4,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: NAVY,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: NAVY,
  },
  heroTime: {
    marginTop: 4,
    fontSize: 32,
    fontWeight: "700",
    color: NAVY,
    fontVariant: ["tabular-nums"],
  },
  heroRelative: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "500",
    color: "#555",
  },
  heroCourse: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: "600",
    color: "#222",
  },
  heroMeta: {
    marginTop: 4,
    fontSize: 14,
    color: "#666",
  },
  summary: {
    fontSize: 13,
    color: "#555",
    marginBottom: 2,
  },
  emptyCard: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderStyle: "dashed",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: NAVY,
    textAlign: "center",
  },
  emptyHint: {
    marginTop: 6,
    fontSize: 13,
    color: "#888",
    textAlign: "center",
  },
  emptyActions: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  emptyBtn: {
    borderRadius: 10,
    backgroundColor: NAVY,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyBtnSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: NAVY,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  emptyBtnTextSecondary: {
    color: NAVY,
  },
  arrearsBlock: {
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: NAVY,
    marginBottom: 4,
  },
  card: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  kindDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  time: {
    fontSize: 13,
    fontWeight: "600",
  },
  courseName: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "500",
    color: "#222",
  },
  dayLabel: {
    fontWeight: "400",
    color: "#666",
  },
  seq: {
    fontWeight: "400",
    color: "#666",
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
    color: "#666",
  },
  badgeOra: {
    borderRadius: 999,
    backgroundColor: NAVY,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeOraText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  badgeOk: {
    borderRadius: 999,
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeOkText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#166534",
  },
  badgeTodo: {
    borderRadius: 999,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeTodoText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#92400e",
  },
  quickActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  quickBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: NAVY,
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: NAVY,
  },
  panel: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
});
