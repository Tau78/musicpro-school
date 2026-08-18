import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CalendarLesson } from "@musicpro/database";

import { lessonColor } from "@/lib/lezioni-colors";
import { formatRomeDay, formatRomeTime } from "@/lib/lezioni-dates";

import { AttendancePanel } from "./attendance-panel";

export type OggiListProps = {
  lessons: CalendarLesson[];
  arrears?: CalendarLesson[];
  actorMemberId: string;
  onSaved?: () => void;
};

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

export function OggiList({
  lessons,
  arrears = [],
  actorMemberId,
  onSaved,
}: OggiListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleLesson(lesson: CalendarLesson) {
    if (isHoldLesson(lesson)) return;
    setExpandedId((current) => (current === lesson.id ? null : lesson.id));
  }

  return (
    <View>
      {lessons.length === 0 ? (
        <Text style={styles.empty}>Nessuna lezione oggi.</Text>
      ) : (
        lessons.map((lesson) => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            expanded={expandedId === lesson.id && !isHoldLesson(lesson)}
            actorMemberId={actorMemberId}
            onPress={() => toggleLesson(lesson)}
            onSaved={onSaved}
          />
        ))
      )}

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
              onPress={() => toggleLesson(lesson)}
              onSaved={onSaved}
            />
          ))}
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
  onPress,
  onSaved,
}: {
  lesson: CalendarLesson;
  showDate?: boolean;
  expanded: boolean;
  actorMemberId: string;
  onPress: () => void;
  onSaved?: () => void;
}) {
  const hold = isHoldLesson(lesson);
  const color = lessonColor({
    courseKind: lesson.courseKind,
    isTrial: lesson.isTrial,
  });
  const start = formatRomeTime(lesson.startsAt);
  const end = lesson.endsAt ? formatRomeTime(lesson.endsAt) : null;
  const students = lesson.studentNames.filter(Boolean).join(", ");
  const room =
    lesson.courseKind === "online" ? "Online" : (lesson.roomName ?? "—");
  const dayLabel =
    showDate && lesson.startsAt
      ? formatRomeDay(dateInRome(lesson.startsAt))
      : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: color.bg,
          borderColor: color.border,
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
            <Text style={[styles.time, { color: color.text }]}>
              {end ? `${start}–${end}` : start}
            </Text>
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
  empty: {
    marginTop: 24,
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
  arrearsBlock: {
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1e3a5f",
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
  panel: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
});
