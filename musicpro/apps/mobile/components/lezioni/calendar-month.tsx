import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CalendarLesson } from "@musicpro/database";

import { lessonColor } from "@/lib/lezioni-colors";
import { addRomeDays, formatRomeDay, startOfWeekMonday } from "@/lib/lezioni-dates";

import { LessonChip, lessonDateInRome } from "./calendar-week";

const DOW = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

function lastDayOfMonth(monthStart: string): string {
  const [year, month] = monthStart.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthStart.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

function monthGridDates(monthStart: string): string[] {
  const first = startOfWeekMonday(monthStart);
  const monthEnd = lastDayOfMonth(monthStart);
  const gridEnd = addRomeDays(startOfWeekMonday(monthEnd), 6);
  const dates: string[] = [];
  let cursor = first;
  while (cursor <= gridEnd) {
    dates.push(cursor);
    cursor = addRomeDays(cursor, 1);
  }
  return dates;
}

export function CalendarMonth({
  monthStart,
  lessons,
  today,
  selectedDate,
  selectedLessonId,
  onSelectDate,
  onSelectLesson,
  onLongPressLesson,
}: {
  monthStart: string;
  lessons: CalendarLesson[];
  today: string;
  selectedDate: string | null;
  selectedLessonId?: string | null;
  onSelectDate: (date: string) => void;
  onSelectLesson: (lesson: CalendarLesson) => void;
  onLongPressLesson?: (lesson: CalendarLesson) => void;
}) {
  const monthPrefix = monthStart.slice(0, 7);
  const dates = monthGridDates(monthStart);
  const countByDate = new Map<string, number>();
  const colorByDate = new Map<string, string[]>();

  for (const lesson of lessons) {
    const date = lessonDateInRome(lesson.startsAt);
    if (!date) continue;
    countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
    const color = lessonColor({
      courseKind: lesson.courseKind,
      isTrial: lesson.isTrial,
    });
    const dots = colorByDate.get(date) ?? [];
    if (dots.length < 3 && !dots.includes(color.border)) {
      dots.push(color.border);
    }
    colorByDate.set(date, dots);
  }

  const dayLessons = selectedDate
    ? lessons.filter((lesson) => lessonDateInRome(lesson.startsAt) === selectedDate)
    : [];

  return (
    <View>
      <View style={styles.dowRow}>
        {DOW.map((label) => (
          <Text key={label} style={styles.dow}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {dates.map((date) => {
          const inMonth = date.startsWith(monthPrefix);
          const count = countByDate.get(date) ?? 0;
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const dots = colorByDate.get(date) ?? [];
          return (
            <Pressable
              key={date}
              onPress={() => onSelectDate(date)}
              style={[
                styles.cell,
                isToday && styles.cellToday,
                isSelected && styles.cellSelected,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${date}${count ? `, ${count} lezioni` : ""}`}
            >
              <Text
                style={[
                  styles.cellDay,
                  !inMonth && styles.cellDayMuted,
                  isToday && styles.cellDayToday,
                ]}
              >
                {Number(date.slice(8, 10))}
              </Text>
              <View style={styles.dots}>
                {dots.map((dot) => (
                  <View key={dot} style={[styles.dot, { backgroundColor: dot }]} />
                ))}
                {count > 3 ? (
                  <Text style={styles.count}>+{count - 3}</Text>
                ) : count > 0 && dots.length === 0 ? (
                  <Text style={styles.count}>{count}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selectedDate ? (
        <View style={styles.dayCard}>
          <Text style={styles.dayTitle}>{formatRomeDay(selectedDate)}</Text>
          {dayLessons.length === 0 ? (
            <Text style={styles.emptyDay}>Nessuna lezione in questo giorno</Text>
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
      ) : (
        <Text style={styles.hint}>Tocca un giorno per vedere le lezioni</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dowRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  dow: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "14.2857%",
    minHeight: 52,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 8,
  },
  cellToday: {
    backgroundColor: "#e8eef5",
  },
  cellSelected: {
    borderWidth: 1.5,
    borderColor: "#1e3a5f",
  },
  cellDay: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  cellDayMuted: {
    color: "#bbb",
    fontWeight: "400",
  },
  cellDayToday: {
    color: "#1e3a5f",
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    minHeight: 8,
    gap: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  count: {
    fontSize: 9,
    color: "#1e3a5f",
    fontWeight: "700",
  },
  dayCard: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  dayTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e3a5f",
    textTransform: "capitalize",
    marginBottom: 4,
  },
  emptyDay: {
    marginTop: 8,
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
  },
  hint: {
    marginTop: 16,
    fontSize: 13,
    color: "#888",
    textAlign: "center",
  },
});
