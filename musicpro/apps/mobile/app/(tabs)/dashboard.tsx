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
  bookingStatusLabel,
  cancelBooking,
  formatBookingDateTime,
  listBookingsInRange,
  listLessonsInRange,
  listMyBookings,
  todayInRome,
  type CalendarLesson,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CalendarWeek } from "@/components/lezioni/calendar-week";
import { BookingWeek } from "@/components/sala/booking-week";
import { useAuth } from "@/contexts/AuthContext";
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
      <Pressable
        onPress={onPrev}
        style={styles.weekNavBtn}
        accessibilityLabel="Settimana precedente"
      >
        <Text style={styles.weekNavBtnText}>‹</Text>
      </Pressable>
      <Text style={styles.weekNavLabel}>{label}</Text>
      <Pressable
        onPress={onNext}
        style={styles.weekNavBtn}
        accessibilityLabel="Settimana successiva"
      >
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
  const today = todayInRome();

  const [salaWeekStart, setSalaWeekStart] = useState(() =>
    startOfWeekMonday(todayInRome()),
  );
  const [lezioniWeekStart, setLezioniWeekStart] = useState(() =>
    startOfWeekMonday(todayInRome()),
  );

  const [bookings, setBookings] = useState<BookingWithRoom[]>([]);
  const [lessons, setLessons] = useState<CalendarLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBooking, setSelectedBooking] =
    useState<BookingWithRoom | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<CalendarLesson | null>(
    null,
  );
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

        const [bookingRows, lessonRows] = await Promise.all([
          manageSala
            ? listBookingsInRange(supabase, {
                from: salaWeekStart,
                to: salaTo,
              })
            : listMyBookings(supabase, member.id, "upcoming").then((rows) =>
                rows.filter((row) => {
                  const d = new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Europe/Rome",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).format(new Date(row.start_at));
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
        ]);

        setBookings(bookingRows);
        setLessons(lessonRows);
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

  async function handleCancel(bookingId: string) {
    setCancellingId(bookingId);
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
      setCancellingId(null);
    }
  }

  return (
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
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push("/(tabs)/prenotazioni")}
          >
            <Text style={styles.primaryBtnText}>+ Aggiungi</Text>
          </Pressable>
        </View>
        <Text style={styles.sectionHint}>
          Calendario settimanale: tocca una prenotazione per modificarla o
          cancellarla.
        </Text>
        <WeekNav
          label={weekLabel(salaWeekStart)}
          onPrev={() => setSalaWeekStart((d) => addRomeDays(d, -7))}
          onNext={() => setSalaWeekStart((d) => addRomeDays(d, 7))}
        />
        {!loading ? (
          <BookingWeek
            weekStart={salaWeekStart}
            bookings={bookings}
            today={today}
            selectedBookingId={selectedBooking?.id}
            onSelectBooking={setSelectedBooking}
          />
        ) : null}

        {selectedBooking ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>
              {selectedBooking.room?.name ?? "Sala"} ·{" "}
              {formatBookingDateTime(
                selectedBooking.start_at,
                selectedBooking.end_at,
              )}
            </Text>
            <Text style={styles.detailMuted}>
              {bookingStatusLabel(selectedBooking.status)}
            </Text>
            <View style={styles.cardActions}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => router.push("/mie-prenotazioni")}
              >
                <Text style={styles.secondaryBtnText}>Elenco</Text>
              </Pressable>
              <Pressable
                style={styles.dangerBtn}
                disabled={cancellingId === selectedBooking.id}
                onPress={() => void handleCancel(selectedBooking.id)}
              >
                <Text style={styles.dangerBtnText}>
                  {cancellingId === selectedBooking.id ? "…" : "Cancella"}
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
      </View>

      {isDocente ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Lezioni</Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.push("/calendario-lezioni")}
            >
              <Text style={styles.primaryBtnText}>Apri completo</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionHint}>
            Calendario settimanale: tocca una lezione per aprirla e
            modificarla.
          </Text>
          <WeekNav
            label={weekLabel(lezioniWeekStart)}
            onPrev={() => setLezioniWeekStart((d) => addRomeDays(d, -7))}
            onNext={() => setLezioniWeekStart((d) => addRomeDays(d, 7))}
          />
          {!loading ? (
            <CalendarWeek
              weekStart={lezioniWeekStart}
              lessons={lessons}
              today={today}
              selectedLessonId={selectedLesson?.id}
              onSelectLesson={(lesson) => {
                setSelectedLesson(lesson);
                router.push("/calendario-lezioni");
              }}
            />
          ) : null}
          <Pressable
            style={styles.addLessonBtn}
            onPress={() => router.push("/calendario-lezioni")}
          >
            <Text style={styles.addLessonBtnText}>+ Aggiungi lezione</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  content: { padding: 24, paddingBottom: 48 },
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
  sectionHint: { marginTop: 8, marginBottom: 12, fontSize: 13, color: "#666", lineHeight: 18 },
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
  primaryBtn: {
    backgroundColor: "#1e3a5f",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
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
  addLessonBtn: {
    marginTop: 16,
    alignItems: "center",
    backgroundColor: "#1e3a5f",
    borderRadius: 10,
    paddingVertical: 14,
  },
  addLessonBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
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
