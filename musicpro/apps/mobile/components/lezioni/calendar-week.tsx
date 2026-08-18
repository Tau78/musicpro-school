import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CalendarLesson } from "@musicpro/database";

import { lessonColor } from "@/lib/lezioni-colors";
import { addRomeDays, formatRomeDay, formatRomeTime } from "@/lib/lezioni-dates";

const WEEKDAY_COUNT = 6;

export function isHoldLesson(lesson: CalendarLesson): boolean {
  return lesson.id.startsWith("hold:") || lesson.courseStatus === "in_attesa";
}

export function lessonDateInRome(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function LessonChip({
  lesson,
  selected,
  onPress,
  onLongPress,
}: {
  lesson: CalendarLesson;
  selected?: boolean;
  onPress: (lesson: CalendarLesson) => void;
  onLongPress?: (lesson: CalendarLesson) => void;
}) {
  const color = lessonColor({
    courseKind: lesson.courseKind,
    isTrial: lesson.isTrial,
  });
  const hold = isHoldLesson(lesson);
  const students = lesson.studentNames.join(", ");

  return (
    <Pressable
      onPress={() => onPress(lesson)}
      onLongPress={onLongPress ? () => onLongPress(lesson) : undefined}
      delayLongPress={400}
      style={[
        styles.chip,
        {
          backgroundColor: color.bg,
          borderColor: selected ? "#1e3a5f" : color.border,
        },
        hold && styles.chipHold,
        selected && styles.chipSelected,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${formatRomeTime(lesson.startsAt)} ${lesson.courseName}`}
    >
      <Text style={[styles.chipTime, { color: color.text }]}>
        {formatRomeTime(lesson.startsAt)}
        {lesson.endsAt ? `–${formatRomeTime(lesson.endsAt)}` : ""}
      </Text>
      <Text style={[styles.chipTitle, { color: color.text }]} numberOfLines={2}>
        {lesson.courseName}
      </Text>
      {students ? (
        <Text style={[styles.chipStudents, { color: color.text }]} numberOfLines={2}>
          {students}
        </Text>
      ) : null}
      {hold ? <Text style={styles.holdBadge}>In attesa</Text> : null}
    </Pressable>
  );
}

export function CalendarWeek({
  weekStart,
  lessons,
  today,
  selectedLessonId,
  onSelectLesson,
  onLongPressLesson,
}: {
  weekStart: string;
  lessons: CalendarLesson[];
  today: string;
  selectedLessonId?: string | null;
  onSelectLesson: (lesson: CalendarLesson) => void;
  onLongPressLesson?: (lesson: CalendarLesson) => void;
}) {
  const days = Array.from({ length: WEEKDAY_COUNT }, (_, index) =>
    addRomeDays(weekStart, index),
  );

  const byDate = new Map<string, CalendarLesson[]>();
  for (const lesson of lessons) {
    const date = lessonDateInRome(lesson.startsAt);
    if (!date) continue;
    const list = byDate.get(date) ?? [];
    list.push(lesson);
    byDate.set(date, list);
  }

  return (
    <View style={styles.week}>
      {days.map((date) => {
        const dayLessons = byDate.get(date) ?? [];
        const isToday = date === today;
        return (
          <View key={date} style={[styles.dayBlock, isToday && styles.dayBlockToday]}>
            <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
              {formatRomeDay(date)}
              {isToday ? " · oggi" : ""}
            </Text>
            {dayLessons.length === 0 ? (
              <Text style={styles.emptyDay}>Nessuna lezione</Text>
            ) : (
              dayLessons.map((lesson) => (
                <LessonChip
                  key={lesson.id}
                  lesson={lesson}
                  selected={lesson.id === selectedLessonId}
                  onPress={onSelectLesson}
                  onLongPress={onLongPressLesson}
                />
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  week: {
    gap: 12,
  },
  dayBlock: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  dayBlockToday: {
    borderColor: "#1e3a5f",
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e3a5f",
    marginBottom: 8,
    textTransform: "capitalize",
  },
  dayLabelToday: {
    color: "#1e3a5f",
  },
  emptyDay: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
  },
  chip: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipHold: {
    borderStyle: "dashed",
  },
  chipSelected: {
    borderWidth: 2,
  },
  chipTime: {
    fontSize: 12,
    fontWeight: "700",
  },
  chipTitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "600",
  },
  chipStudents: {
    marginTop: 2,
    fontSize: 12,
  },
  holdBadge: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#92400e",
  },
});
