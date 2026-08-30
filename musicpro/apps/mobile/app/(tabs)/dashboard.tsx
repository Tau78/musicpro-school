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
  type BookingWithRoom,
  type CalendarLesson,
  adminUpdateBooking,
  bookingStatusLabel,
  cancelBooking,
  cancelLessonAsSchool,
  getRomeMinutesFromMidnight,
  getTeacherProfile,
  listBookingsInRange,
  listLessonsInRange,
  listMyBookings,
  minutesToTimeLabel,
  moveLesson,
  romeLocalInputToUtcIso,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import {
  TimeGridAddBar,
  TimeGridWeek,
  type TimeGridEvent,
} from "@/components/calendar/time-grid-week";
import { CreateLessonSheet } from "@/components/lezioni/create-lesson-sheet";
import { useAuth } from "@/contexts/AuthContext";
import { lessonColor } from "@/lib/lezioni-colors";
import {
  addRomeDays,
  formatRomeDay,
  startOfWeekMonday,
} from "@/lib/lezioni-dates";
import { createClient } from "@/lib/supabase";

const MONTHS_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
] as const;

function canManageSala(roles: string[]): boolean {
  return (
    roles.includes(MemberRole.Admin) || roles.includes(MemberRole.Segreteria)
  );
}

function weekLabel(weekStart: string): string {
  const weekEnd = addRomeDays(weekStart, 5);
  const startDay = Number(weekStart.slice(8, 10));
  const endDay = Number(weekEnd.slice(8, 10));
  const startMonth = MONTHS_IT[Number(weekStart.slice(5, 7)) - 1];
  const endMonth = MONTHS_IT[Number(weekEnd.slice(5, 7)) - 1];
  const year = weekEnd.slice(0, 4);
  if (startMonth === endMonth) {
    return `${startDay}–${endDay} ${startMonth} ${year}`;
  }
  return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${year}`;
}

function dateInRome(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function WeekNav({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.weekNav}>
      <Pressable onPress={onPrev} style={styles.weekNavBtn} accessibilityLabel="Precedente">
        <Text style={styles.weekNavBtnText}>‹</Text>
      </Pressable>
      <Text style={styles.weekNavLabel}>{label}</Text>
      <Pressable onPress={onNext} style={styles.weekNavBtn} accessibilityLabel="Successiva">
        <Text style={styles.weekNavBtnText}>›</Text>
      </Pressable>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { member, roles, isLoading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const isDocente = roles.includes(MemberRole.Docente);
  const manageSala = canManageSala(roles);
  const isStaff =
    manageSala || roles.includes(MemberRole.Admin);
  const today = todayInRome();

  const [salaWeekStart, setSalaWeekStart] = useState(() =>
    startOfWeekMonday(todayInRome()),
  );
  const [lezioniWeekStart, setLezioniWeekStart] = useState(() =>
    startOfWeekMonday(todayInRome()),
  );

  const [bookings, setBookings] = useState<BookingWithRoom[]>([]);
  const [lessons, setLessons] = useState<CalendarLesson[]>([]);
  const [canReschedule, setCanReschedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBooking, setSelectedBooking] =
    useState<BookingWithRoom | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<CalendarLesson | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | undefined>();
  const [createOra, setCreateOra] = useState<string | undefined>();

  function openCreateLesson(prefill?: { date?: string; ora?: string }) {
    setCreateDate(prefill?.date);
    setCreateOra(prefill?.ora);
    setCreateOpen(true);
  }

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!member?.id) {
        setBookings([]);
        setLessons([]);
        setLoading(false);
        return;
      }

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const salaTo = addRomeDays(salaWeekStart, 7);
        const lezioniTo = addRomeDays(lezioniWeekStart, 7);

        const [bookingRows, lessonRows, profile] = await Promise.all([
          manageSala
            ? listBookingsInRange(supabase, {
                from: salaWeekStart,
                to: salaTo,
              })
            : listMyBookings(supabase, member.id, "upcoming").then((rows) =>
                rows.filter((row) => {
                  const d = dateInRome(row.start_at);
                  return d >= salaWeekStart && d < salaTo;
                }),
              ),
          isDocente
            ? listLessonsInRange(supabase, {
                from: lezioniWeekStart,
                to: lezioniTo,
                teacherMemberId: member.id,
                includePendingHold: true,
              })
            : Promise.resolve([] as CalendarLesson[]),
          isDocente
            ? getTeacherProfile(supabase, member.id)
            : Promise.resolve(null),
        ]);

        setBookings(bookingRows);
        setLessons(lessonRows);
        setCanReschedule(Boolean(profile?.canReschedule) || isStaff);
        setSelectedBooking((current) =>
          current
            ? (bookingRows.find((row) => row.id === current.id) ?? null)
            : null,
        );
        setSelectedLesson((current) =>
          current
            ? (lessonRows.find((row) => row.id === current.id) ?? null)
            : null,
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Impossibile caricare la dashboard.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      isDocente,
      isStaff,
      lezioniWeekStart,
      manageSala,
      member?.id,
      salaWeekStart,
      supabase,
    ],
  );

  useEffect(() => {
    if (authLoading) return;
    void load("initial");
  }, [authLoading, load]);

  const bookingEvents: TimeGridEvent[] = useMemo(
    () =>
      bookings.map((booking) => {
        const startMinute = getRomeMinutesFromMidnight(booking.start_at);
        const endMinute = getRomeMinutesFromMidnight(booking.end_at);
        return {
          id: `booking:${booking.id}`,
          date: dateInRome(booking.start_at),
          startMinute,
          endMinute: endMinute > startMinute ? endMinute : startMinute + 60,
          title: booking.room?.name ?? "Sala",
          subtitle: booking.title || bookingStatusLabel(booking.status),
          color: {
            bg: "#e8eef6",
            border: "#9db4d0",
            text: "#1e3a5f",
          },
          canDrag: manageSala,
        };
      }),
    [bookings, manageSala],
  );

  const lessonEvents: TimeGridEvent[] = useMemo(
    () =>
      lessons
        .filter((lesson) => lesson.startsAt && !lesson.id.startsWith("hold:"))
        .map((lesson) => {
          const startMinute = getRomeMinutesFromMidnight(lesson.startsAt!);
          const endMinute = lesson.endsAt
            ? getRomeMinutesFromMidnight(lesson.endsAt)
            : startMinute + 60;
          const color = lessonColor({
            courseKind: lesson.courseKind,
            isTrial: lesson.isTrial,
          });
          return {
            id: `lesson:${lesson.id}`,
            date: dateInRome(lesson.startsAt!),
            startMinute,
            endMinute: endMinute > startMinute ? endMinute : startMinute + 60,
            title: lesson.courseName || "Lezione",
            subtitle: lesson.studentNames.join(", ") || lesson.roomName || undefined,
            color: {
              bg: color.bg,
              border: color.border,
              text: color.text,
            },
            canDrag: canReschedule && !lesson.hasAttendance,
          };
        }),
    [canReschedule, lessons],
  );

  async function handleCancelBooking(bookingId: string) {
    setBusyId(bookingId);
    setMessage(null);
    setError(null);
    try {
      const result = await cancelBooking(supabase, bookingId);
      if (!result.success) {
        setError(result.errorMessage ?? "Impossibile cancellare.");
        return;
      }
      setMessage("Prenotazione cancellata.");
      setSelectedBooking(null);
      await load("refresh");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossibile cancellare la prenotazione.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleMoveBooking(
    event: TimeGridEvent,
    next: { date: string; startMinute: number },
  ) {
    const bookingId = event.id.replace(/^booking:/, "");
    const booking = bookings.find((row) => row.id === bookingId);
    if (!booking || !manageSala) return;

    const duration = Math.max(
      15,
      Math.round(
        (new Date(booking.end_at).getTime() -
          new Date(booking.start_at).getTime()) /
          60_000,
      ),
    );
    const startLocal = `${next.date}T${minutesToTimeLabel(next.startMinute)}`;
    const endLocal = `${next.date}T${minutesToTimeLabel(next.startMinute + duration)}`;

    setBusyId(bookingId);
    setError(null);
    setMessage(null);
    try {
      const result = await adminUpdateBooking(supabase, bookingId, {
        roomId: booking.room_id,
        startAt: romeLocalInputToUtcIso(startLocal),
        endAt: romeLocalInputToUtcIso(endLocal),
      });
      if (!result.success) {
        setError(result.errorMessage ?? "Spostamento non riuscito.");
        return;
      }
      setMessage("Prenotazione spostata.");
      await load("refresh");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Spostamento non riuscito.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleMoveLesson(
    event: TimeGridEvent,
    next: { date: string; startMinute: number },
  ) {
    if (!member?.id) return;
    const lessonId = event.id.replace(/^lesson:/, "");
    const lesson = lessons.find((row) => row.id === lessonId);
    if (!lesson) return;

    const startLocal = `${next.date}T${minutesToTimeLabel(next.startMinute)}`;
    setBusyId(lessonId);
    setError(null);
    setMessage(null);
    try {
      const result = await moveLesson(supabase, lessonId, {
        startsAt: romeLocalInputToUtcIso(startLocal),
        roomId: lesson.roomId,
        scope: "this",
        actor: {
          memberId: member.id,
          isStaff,
          canReschedule,
        },
      });
      if (!result.success) {
        setError(result.errorMessage ?? "Spostamento non riuscito.");
        return;
      }
      setMessage("Lezione spostata.");
      await load("refresh");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Spostamento non riuscito.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancelLesson(lessonId: string) {
    if (!member?.id) return;
    setBusyId(lessonId);
    setError(null);
    setMessage(null);
    try {
      const result = await cancelLessonAsSchool(supabase, lessonId, {
        memberId: member.id,
        isStaff,
      });
      if (!result.success) {
        setError(result.errorMessage ?? "Impossibile cancellare la lezione.");
        return;
      }
      setMessage("Lezione cancellata.");
      setSelectedLesson(null);
      await load("refresh");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossibile cancellare la lezione.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load("refresh")}
          tintColor="#1e3a5f"
        />
      }
    >
      <Text style={styles.greeting}>
        Ciao{member ? `, ${member.firstName}` : ""}
      </Text>
      <Text style={styles.subtitle}>{formatRomeDay(today)}</Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#1e3a5f" />
      ) : null}
      {error ? (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error}</Text>
        </View>
      ) : null}
      {message ? (
        <View style={styles.alertOk}>
          <Text style={styles.alertOkText}>{message}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Sala prove</Text>
        </View>
        <Text style={styles.sectionHint}>
          Calendario orario: tocca un evento, tieni premuto e trascina per
          spostarlo.
        </Text>
        <WeekNav
          label={weekLabel(salaWeekStart)}
          onPrev={() => setSalaWeekStart((d) => addRomeDays(d, -7))}
          onNext={() => setSalaWeekStart((d) => addRomeDays(d, 7))}
        />
        {!loading ? (
          <TimeGridWeek
            weekStart={salaWeekStart}
            today={today}
            events={bookingEvents}
            selectedId={
              selectedBooking ? `booking:${selectedBooking.id}` : null
            }
            onSelect={(event) => {
              const id = event.id.replace(/^booking:/, "");
              setSelectedBooking(bookings.find((b) => b.id === id) ?? null);
              setSelectedLesson(null);
            }}
            onMove={manageSala ? handleMoveBooking : undefined}
          />
        ) : null}

        {selectedBooking ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>
              {selectedBooking.room?.name ?? "Sala"}
            </Text>
            <Text style={styles.detailMuted}>
              {bookingStatusLabel(selectedBooking.status)} ·{" "}
              {minutesToTimeLabel(
                getRomeMinutesFromMidnight(selectedBooking.start_at),
              )}
              –
              {minutesToTimeLabel(
                getRomeMinutesFromMidnight(selectedBooking.end_at),
              )}
            </Text>
            <View style={styles.cardActions}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => router.push("/mie-prenotazioni")}
              >
                <Text style={styles.secondaryBtnText}>Dettaglio</Text>
              </Pressable>
              <Pressable
                style={styles.dangerBtn}
                disabled={busyId === selectedBooking.id}
                onPress={() => void handleCancelBooking(selectedBooking.id)}
              >
                <Text style={styles.dangerBtnText}>
                  {busyId === selectedBooking.id ? "…" : "Elimina"}
                </Text>
              </Pressable>
              <Pressable
                style={styles.ghostBtn}
                onPress={() => setSelectedBooking(null)}
              >
                <Text style={styles.ghostBtnText}>Chiudi</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <TimeGridAddBar
          label="+ Aggiungi prenotazione"
          onPress={() => router.push("/(tabs)/prenotazioni")}
        />
      </View>

      {isStaff && !isDocente ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lezioni</Text>
          <Text style={styles.sectionHint}>
            Crea prova, corso o corso collettivo (stesso flusso della
            segreteria).
          </Text>
          <TimeGridAddBar
            label="+ Aggiungi lezione"
            onPress={() => openCreateLesson()}
          />
        </View>
      ) : null}

      {isDocente ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Lezioni</Text>
            <Pressable
              onPress={() => router.push("/calendario-lezioni")}
              hitSlop={8}
            >
              <Text style={styles.secondaryBtnText}>Calendario completo</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionHint}>
            Stesso calendario: trascina per spostare, tocca per modificare o
            eliminare. Tocca uno slot vuoto per aggiungere.
          </Text>
          <WeekNav
            label={weekLabel(lezioniWeekStart)}
            onPrev={() => setLezioniWeekStart((d) => addRomeDays(d, -7))}
            onNext={() => setLezioniWeekStart((d) => addRomeDays(d, 7))}
          />
          {!loading ? (
            <TimeGridWeek
              weekStart={lezioniWeekStart}
              today={today}
              events={lessonEvents}
              selectedId={
                selectedLesson ? `lesson:${selectedLesson.id}` : null
              }
              onSelect={(event) => {
                const id = event.id.replace(/^lesson:/, "");
                setSelectedLesson(lessons.find((l) => l.id === id) ?? null);
                setSelectedBooking(null);
              }}
              onMove={canReschedule ? handleMoveLesson : undefined}
              onEmptyPress={({ date, startMinute }) =>
                openCreateLesson({
                  date,
                  ora: minutesToTimeLabel(startMinute),
                })
              }
            />
          ) : null}

          {selectedLesson ? (
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>
                {selectedLesson.courseName || "Lezione"}
              </Text>
              <Text style={styles.detailMuted}>
                {selectedLesson.studentNames.join(", ") || "—"}
                {selectedLesson.roomName
                  ? ` · ${selectedLesson.roomName}`
                  : ""}
              </Text>
              <View style={styles.cardActions}>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => router.push("/calendario-lezioni")}
                >
                  <Text style={styles.secondaryBtnText}>Modifica</Text>
                </Pressable>
                <Pressable
                  style={styles.dangerBtn}
                  disabled={busyId === selectedLesson.id}
                  onPress={() => void handleCancelLesson(selectedLesson.id)}
                >
                  <Text style={styles.dangerBtnText}>
                    {busyId === selectedLesson.id ? "…" : "Elimina"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.ghostBtn}
                  onPress={() => setSelectedLesson(null)}
                >
                  <Text style={styles.ghostBtnText}>Chiudi</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <TimeGridAddBar
            label="+ Aggiungi lezione"
            onPress={() => openCreateLesson()}
          />
        </View>
      ) : null}
    </ScrollView>

    {member?.id ? (
      <CreateLessonSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void load("refresh");
        }}
        actorMemberId={member.id}
        roles={roles}
        initialDate={createDate}
        initialOra={createOra}
      />
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  content: { padding: 20, paddingBottom: 48 },
  greeting: { fontSize: 22, fontWeight: "600", color: "#1e3a5f" },
  subtitle: { marginTop: 4, fontSize: 14, color: "#666" },
  loader: { marginTop: 24 },
  section: { marginTop: 28 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: "600", color: "#1e3a5f" },
  sectionHint: {
    marginTop: 8,
    marginBottom: 12,
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  weekNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  weekNavBtnText: { fontSize: 22, color: "#1e3a5f", lineHeight: 24 },
  weekNavLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: "#1e3a5f",
    textTransform: "capitalize",
  },
  detailCard: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1e3a5f",
  },
  detailTitle: { fontSize: 15, fontWeight: "600", color: "#222" },
  detailMuted: { marginTop: 4, fontSize: 13, color: "#666" },
  cardActions: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  secondaryBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryBtnText: { color: "#1e3a5f", fontSize: 13, fontWeight: "600" },
  dangerBtn: {
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dangerBtnText: { color: "#991b1b", fontSize: 13, fontWeight: "600" },
  ghostBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostBtnText: { color: "#666", fontSize: 13, fontWeight: "500" },
  alertError: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  alertErrorText: { fontSize: 13, color: "#991b1b" },
  alertOk: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  alertOkText: { fontSize: 13, color: "#166534" },
});
