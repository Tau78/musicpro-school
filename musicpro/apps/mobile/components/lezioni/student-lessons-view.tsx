import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { CalendarLesson } from "@musicpro/database";

import { lessonColor } from "@/lib/lezioni-colors";
import {
  formatRelativeLesson,
  formatRomeDay,
  formatRomeTime,
} from "@/lib/lezioni-dates";

const NAVY = "#1e3a5f";
const PAST_LIMIT = 10;

export type StudentLessonsViewProps = {
  lessonsUpcoming: CalendarLesson[];
  lessonsPast: CalendarLesson[];
  loading?: boolean;
  error?: string | null;
  /** Instant ISO per relative labels (test / clock injection). */
  nowIso?: string;
};

function dateInRome(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function courseTitle(lesson: CalendarLesson): string {
  return lesson.courseName.trim() || "Lezione";
}

/** Docente come «Cognome Nome». */
function teacherLabel(lesson: CalendarLesson): string {
  const last = lesson.titularLastName?.trim() ?? "";
  const first = lesson.titularFirstName?.trim() ?? "";
  const name = [last, first].filter(Boolean).join(" ");
  return name || "—";
}

function roomLabel(lesson: CalendarLesson): string {
  if (lesson.courseKind === "online") return "Online";
  return lesson.roomName?.trim() || "—";
}

function kindLabel(lesson: CalendarLesson): string {
  if (lesson.isTrial) return "Prova";
  if (lesson.courseKind === "individuale") return "Individuale";
  if (lesson.courseKind === "gruppo") return "Gruppo";
  return "Online";
}

function timeRange(lesson: CalendarLesson): string {
  const start = formatRomeTime(lesson.startsAt);
  const end = lesson.endsAt ? formatRomeTime(lesson.endsAt) : null;
  return end ? `${start}–${end}` : start;
}

function a11yLessonSummary(lesson: CalendarLesson, relative?: string): string {
  const parts = [
    courseTitle(lesson),
    timeRange(lesson),
    teacherLabel(lesson),
    roomLabel(lesson),
    `#${lesson.sequenceNumber}`,
  ];
  if (relative) parts.unshift(relative);
  return parts.filter((p) => p && p !== "—").join(", ");
}

export function StudentLessonsView({
  lessonsUpcoming,
  lessonsPast,
  loading = false,
  error = null,
  nowIso,
}: StudentLessonsViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <View style={styles.centered} accessibilityLabel="Caricamento lezioni">
        <ActivityIndicator color={NAVY} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const next = lessonsUpcoming[0] ?? null;
  const upcomingRest = lessonsUpcoming.slice(1);
  const past = lessonsPast.slice(0, PAST_LIMIT);
  const hasAny = Boolean(next) || upcomingRest.length > 0 || past.length > 0;

  function toggle(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <View>
      <NextHero
        lesson={next}
        nowIso={nowIso}
        compactEmpty={hasAny && !next}
      />

      {upcomingRest.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prossime</Text>
          {upcomingRest.map((lesson) => (
            <UpcomingCard
              key={lesson.id}
              lesson={lesson}
              nowIso={nowIso}
              expanded={expandedId === lesson.id}
              onPress={() => toggle(lesson.id)}
            />
          ))}
        </View>
      ) : null}

      {past.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recenti</Text>
          {past.map((lesson) => (
            <PastCard
              key={lesson.id}
              lesson={lesson}
              expanded={expandedId === lesson.id}
              onPress={() => toggle(lesson.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function NextHero({
  lesson,
  nowIso,
  compactEmpty = false,
}: {
  lesson: CalendarLesson | null;
  nowIso?: string;
  /** True se ci sono recenti ma nessuna prossima: banner corto, non empty pieno. */
  compactEmpty?: boolean;
}) {
  if (!lesson) {
    if (compactEmpty) {
      return (
        <View
          style={styles.heroCompact}
          accessibilityLabel="Nessuna lezione in arrivo"
        >
          <Text style={styles.heroCompactText}>Nessuna lezione in arrivo</Text>
        </View>
      );
    }
    return (
      <View
        style={styles.heroEmpty}
        accessibilityLabel="Nessuna lezione in programma"
      >
        <Text style={styles.heroEmptyTitle}>Nessuna lezione in programma</Text>
        <Text style={styles.heroEmptyBody}>
          Non hai lezioni in arrivo. Controlla più tardi o chiedi in segreteria.
        </Text>
      </View>
    );
  }

  const color = lessonColor({
    courseKind: lesson.courseKind,
    isTrial: lesson.isTrial,
  });
  const relative = formatRelativeLesson(
    lesson.startsAt,
    nowIso,
    lesson.endsAt,
  );
  const subject = lesson.subjectName?.trim();

  return (
    <View
      style={[
        styles.hero,
        { backgroundColor: color.bg, borderColor: color.border },
      ]}
      accessibilityLabel={a11yLessonSummary(lesson, relative)}
    >
      <Text style={styles.heroEyebrow}>Prossima lezione</Text>
      <Text style={[styles.heroTime, { color: color.text }]}>
        {timeRange(lesson)}
      </Text>
      <Text style={styles.heroRelative}>{relative}</Text>
      <Text style={styles.heroCourse} numberOfLines={2}>
        {courseTitle(lesson)}
      </Text>
      <Text style={styles.heroMeta} numberOfLines={2}>
        {teacherLabel(lesson)}
        {" · "}
        {roomLabel(lesson)}
      </Text>
      {lesson.studentNames.filter(Boolean).length > 0 ? (
        <Text style={styles.heroMeta} numberOfLines={2}>
          {lesson.studentNames.filter(Boolean).join(", ")}
        </Text>
      ) : null}
      <Text style={styles.heroMetaSecondary} numberOfLines={1}>
        #{lesson.sequenceNumber}
        {subject ? ` · ${subject}` : ""}
        {" · "}
        {kindLabel(lesson)}
      </Text>
    </View>
  );
}

function LessonDetail({ lesson }: { lesson: CalendarLesson }) {
  const subject = lesson.subjectName?.trim();
  const students = lesson.studentNames.filter(Boolean).join(", ");
  return (
    <View style={styles.detail}>
      {students ? <DetailRow label="Allievo" value={students} /> : null}
      <DetailRow label="Docente" value={teacherLabel(lesson)} />
      <DetailRow label="Sala" value={roomLabel(lesson)} />
      <DetailRow label="Orario" value={timeRange(lesson)} />
      <DetailRow label="#" value={String(lesson.sequenceNumber)} />
      <DetailRow label="Tipo" value={kindLabel(lesson)} />
      {subject ? <DetailRow label="Materia" value={subject} /> : null}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function UpcomingCard({
  lesson,
  nowIso,
  expanded,
  onPress,
}: {
  lesson: CalendarLesson;
  nowIso?: string;
  expanded: boolean;
  onPress: () => void;
}) {
  const color = lessonColor({
    courseKind: lesson.courseKind,
    isTrial: lesson.isTrial,
  });
  const relative = formatRelativeLesson(
    lesson.startsAt,
    nowIso,
    lesson.endsAt,
  );
  const ymd = dateInRome(lesson.startsAt);
  const day = ymd ? formatRomeDay(ymd) : "—";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: color.bg, borderColor: color.border },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={a11yLessonSummary(lesson, relative)}
      >
        <View style={styles.cardRow}>
          <View
            style={[
              styles.kindDot,
              { backgroundColor: color.bg, borderColor: color.border },
            ]}
          />
          <View style={styles.cardBody}>
            <Text style={[styles.cardTime, { color: color.text }]}>
              {day} · {timeRange(lesson)}
            </Text>
            <Text style={styles.cardTitle} numberOfLines={2}>
              <Text style={styles.seq}>#{lesson.sequenceNumber} </Text>
              {courseTitle(lesson)}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {relative}
              {" · "}
              {roomLabel(lesson)}
            </Text>
          </View>
        </View>
      </Pressable>
      {expanded ? <LessonDetail lesson={lesson} /> : null}
    </View>
  );
}

function PastCard({
  lesson,
  expanded,
  onPress,
}: {
  lesson: CalendarLesson;
  expanded: boolean;
  onPress: () => void;
}) {
  const color = lessonColor({
    courseKind: lesson.courseKind,
    isTrial: lesson.isTrial,
  });
  const ymd = dateInRome(lesson.startsAt);
  const day = ymd ? formatRomeDay(ymd) : "—";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: "#fff", borderColor: color.border },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={a11yLessonSummary(lesson)}
      >
        <View style={styles.cardRow}>
          <View
            style={[
              styles.kindDot,
              { backgroundColor: color.bg, borderColor: color.border },
            ]}
          />
          <View style={styles.cardBody}>
            <Text style={[styles.cardTime, { color: color.text }]}>
              {day} · {timeRange(lesson)}
            </Text>
            <Text style={styles.cardTitle} numberOfLines={2}>
              <Text style={styles.seq}>#{lesson.sequenceNumber} </Text>
              {courseTitle(lesson)}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {teacherLabel(lesson)}
              {" · "}
              {roomLabel(lesson)}
            </Text>
          </View>
          {lesson.hasAttendance ? (
            <View style={styles.badgeOk}>
              <Text style={styles.badgeOkText}>OK</Text>
            </View>
          ) : (
            <View style={styles.badgeNone}>
              <Text style={styles.badgeNoneText}>—</Text>
            </View>
          )}
        </View>
      </Pressable>
      {expanded ? <LessonDetail lesson={lesson} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#b91c1c",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  hero: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 18,
  },
  heroEmpty: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    padding: 22,
  },
  heroCompact: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  heroCompactText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  heroEmptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: NAVY,
  },
  heroEmptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#666",
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: NAVY,
    opacity: 0.75,
  },
  heroTime: {
    marginTop: 8,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  heroRelative: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "500",
    color: "#555",
  },
  heroCourse: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "600",
    color: "#222",
  },
  heroMeta: {
    marginTop: 6,
    fontSize: 14,
    color: "#444",
  },
  heroMetaSecondary: {
    marginTop: 4,
    fontSize: 13,
    color: "#666",
  },
  section: {
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
  cardTime: {
    fontSize: 13,
    fontWeight: "600",
  },
  cardTitle: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "500",
    color: "#222",
  },
  seq: {
    fontWeight: "400",
    color: "#666",
  },
  cardMeta: {
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
  badgeNone: {
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 28,
    alignItems: "center",
  },
  badgeNoneText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
  },
  detail: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.55)",
    gap: 6,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  detailLabel: {
    fontSize: 13,
    color: "#666",
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#222",
    textAlign: "right",
  },
});
