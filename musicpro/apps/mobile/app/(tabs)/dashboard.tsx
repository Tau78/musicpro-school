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
  listLessonsOnDate,
  listMyBookings,
  todayInRome,
  type CalendarLesson,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { OggiList } from "@/components/lezioni/oggi-list";
import { useAuth } from "@/contexts/AuthContext";
import { addRomeDays, formatRomeDay } from "@/lib/lezioni-dates";
import { createClient } from "@/lib/supabase";

function canManageSala(roles: string[]): boolean {
  return (
    roles.includes(MemberRole.Admin) || roles.includes(MemberRole.Segreteria)
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { member, roles, isLoading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const isDocente = roles.includes(MemberRole.Docente);
  const manageSala = canManageSala(roles);
  const today = todayInRome();

  const [bookings, setBookings] = useState<BookingWithRoom[]>([]);
  const [lessons, setLessons] = useState<CalendarLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
        const weekTo = addRomeDays(today, 7);
        const [bookingRows, lessonRows] = await Promise.all([
          manageSala
            ? listBookingsInRange(supabase, {
                from: today,
                to: weekTo,
              })
            : listMyBookings(supabase, member.id, "upcoming"),
          isDocente
            ? listLessonsOnDate(supabase, today, {
                teacherMemberId: member.id,
                includePendingHold: true,
              })
            : Promise.resolve([] as CalendarLesson[]),
        ]);

        setBookings(bookingRows.slice(0, 12));
        setLessons(lessonRows);
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
    [isDocente, manageSala, member?.id, supabase, today],
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
            <Text style={styles.primaryBtnText}>Aggiungi</Text>
          </Pressable>
        </View>
        <Text style={styles.sectionHint}>
          {manageSala
            ? "Prossime prenotazioni della settimana. Aggiungi al volo o cancella da qui."
            : "Le tue prenotazioni. Aggiungi al volo o cancella da qui."}
        </Text>

        {!loading && bookings.length === 0 ? (
          <Text style={styles.empty}>Nessuna prenotazione in arrivo.</Text>
        ) : null}

        {bookings.map((booking) => (
          <View key={booking.id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {booking.room?.name ?? "Sala"} ·{" "}
              {formatBookingDateTime(booking.start_at, booking.end_at)}
            </Text>
            <Text style={styles.cardMuted}>
              {bookingStatusLabel(booking.status)}
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
                disabled={cancellingId === booking.id}
                onPress={() => void handleCancel(booking.id)}
              >
                <Text style={styles.dangerBtnText}>
                  {cancellingId === booking.id ? "…" : "Cancella"}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      {isDocente ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Lezioni</Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.push("/calendario-lezioni")}
            >
              <Text style={styles.primaryBtnText}>Calendario</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionHint}>
            Calendario cliccabile con modifiche e cancellazioni. Oggi qui sotto.
          </Text>
          {!loading && member?.id ? (
            <OggiList
              lessons={lessons}
              arrears={[]}
              actorMemberId={member.id}
              onSaved={() => void load("refresh")}
            />
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  content: { padding: 24, paddingBottom: 40 },
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
  sectionHint: { marginTop: 8, fontSize: 13, color: "#666", lineHeight: 18 },
  empty: { marginTop: 12, fontSize: 14, color: "#888" },
  card: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#222" },
  cardMuted: { marginTop: 4, fontSize: 13, color: "#666" },
  cardActions: {
    marginTop: 12,
    flexDirection: "row",
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
