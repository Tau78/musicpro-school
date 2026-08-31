import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import {
  listLessonsInRange,
  listLessonsOnDate,
  todayInRome,
  type CalendarLesson,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { OggiList } from "@/components/lezioni/oggi-list";
import { StudentLessonsView } from "@/components/lezioni/student-lessons-view";
import { useAuth } from "@/contexts/AuthContext";
import { addRomeDays, formatRomeDay } from "@/lib/lezioni-dates";
import { createClient } from "@/lib/supabase";

function isStillUpcoming(lesson: CalendarLesson, nowIso: string): boolean {
  if (!lesson.startsAt) return false;
  // In corso (endsAt futuro) resta in “Prossima”, non in Recenti.
  if (lesson.endsAt && lesson.endsAt > nowIso) return true;
  return lesson.startsAt >= nowIso;
}

function splitStudentLessons(rows: CalendarLesson[], nowIso: string) {
  const dated = rows.filter(
    (lesson): lesson is CalendarLesson & { startsAt: string } =>
      Boolean(lesson.startsAt),
  );
  const upcoming = dated
    .filter((lesson) => isStillUpcoming(lesson, nowIso))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = dated
    .filter((lesson) => !isStillUpcoming(lesson, nowIso))
    .sort((a, b) => b.startsAt!.localeCompare(a.startsAt!))
    .slice(0, 12);
  return { upcoming, past };
}

export default function LezioniScreen() {
  const router = useRouter();
  const { member, roles, isLoading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  // Docente+associato/tutore → preferisci sempre la vista docente.
  const isDocente = roles.includes(MemberRole.Docente);
  const isStudentOrTutor =
    !isDocente &&
    (roles.includes(MemberRole.Associato) ||
      roles.includes(MemberRole.Tutore));
  const [today, setToday] = useState(todayInRome);

  const [lessons, setLessons] = useState<CalendarLesson[]>([]);
  const [arrears, setArrears] = useState<CalendarLesson[]>([]);
  const [lessonsUpcoming, setLessonsUpcoming] = useState<CalendarLesson[]>([]);
  const [lessonsPast, setLessonsPast] = useState<CalendarLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const next = todayInRome();
      setToday((prev) => (prev === next ? prev : next));
    };
    sync();
    const id = setInterval(sync, 60_000);
    return () => clearInterval(id);
  }, []);

  const loadDocente = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!member?.id) {
        setLessons([]);
        setArrears([]);
        setLoading(false);
        return;
      }

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);

      const day = todayInRome();
      setToday(day);

      try {
        const [todayLessons, arrearsRange] = await Promise.all([
          listLessonsOnDate(supabase, day, {
            teacherMemberId: member.id,
            includePendingHold: true,
          }),
          listLessonsInRange(supabase, {
            from: addRomeDays(day, -14),
            to: day,
            teacherMemberId: member.id,
          }),
        ]);

        setLessons(todayLessons);
        setArrears(
          arrearsRange.filter(
            (lesson) =>
              !lesson.hasAttendance &&
              !lesson.id.startsWith("hold:") &&
              lesson.courseStatus !== "in_attesa",
          ),
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Impossibile caricare le lezioni.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [member?.id, supabase],
  );

  const loadStudent = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!member?.id) {
        setLessonsUpcoming([]);
        setLessonsPast([]);
        setLoading(false);
        return;
      }

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);

      const day = todayInRome();
      setToday(day);

      try {
        // Una fetch today-21 … today+28 (to esclusivo → +29). Niente hold.
        // Niente studentMemberId: RLS (enrollment proprio + ward del tutore).
        // Con studentMemberId=me il tutore puro vedrebbe sempre lista vuota.
        const rows = await listLessonsInRange(supabase, {
          from: addRomeDays(day, -21),
          to: addRomeDays(day, 29),
        });

        const { upcoming, past } = splitStudentLessons(
          rows,
          new Date().toISOString(),
        );
        setLessonsUpcoming(upcoming);
        setLessonsPast(past);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Impossibile caricare le lezioni.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [member?.id, supabase],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!isDocente && !isStudentOrTutor) {
      router.replace("/(tabs)/dashboard");
    }
  }, [authLoading, isDocente, isStudentOrTutor, router]);

  useEffect(() => {
    if (authLoading) return;
    if (isDocente) {
      void loadDocente("initial");
      return;
    }
    if (isStudentOrTutor) {
      void loadStudent("initial");
    }
  }, [
    authLoading,
    isDocente,
    isStudentOrTutor,
    loadDocente,
    loadStudent,
    today,
  ]);

  if (isStudentOrTutor) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadStudent("refresh")}
            tintColor="#1e3a5f"
          />
        }
      >
        <StudentLessonsView
          lessonsUpcoming={lessonsUpcoming}
          lessonsPast={lessonsPast}
          loading={loading}
          error={error}
        />
      </ScrollView>
    );
  }

  if (!isDocente) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={styles.loader} color="#1e3a5f" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadDocente("refresh")}
          tintColor="#1e3a5f"
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Oggi</Text>
          <Text style={styles.subtitle}>{formatRomeDay(today)}</Text>
        </View>
        <Pressable
          style={styles.calendarButton}
          onPress={() => router.push("/calendario-lezioni")}
        >
          <Text style={styles.calendarButtonText}>Calendario</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#1e3a5f" />
      ) : null}

      {error ? (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error}</Text>
        </View>
      ) : null}

      {!member?.id && !loading ? (
        <Text style={styles.emptyHint}>Accedi per vedere le lezioni.</Text>
      ) : null}

      {!loading && member?.id ? (
        <OggiList
          lessons={lessons}
          arrears={arrears}
          actorMemberId={member.id}
          onSaved={() => void loadDocente("refresh")}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fafafa",
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#666",
  },
  calendarButton: {
    backgroundColor: "#1e3a5f",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  calendarButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  loader: {
    marginTop: 24,
  },
  alertError: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  alertErrorText: {
    fontSize: 13,
    color: "#991b1b",
  },
  emptyHint: {
    marginTop: 24,
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
});
