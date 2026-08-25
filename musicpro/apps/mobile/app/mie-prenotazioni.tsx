import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import {
  type BookingWithRoom,
  type CancelBookingResult,
  bookingNeedsPayment,
  bookingStatusLabel,
  cancelBooking,
  canCancelBooking,
  formatBookingDateTime,
  formatCreditsCount,
  formatEuro,
  getBookingSettings,
  getCurrentMember,
  listMyBookings,
  requestRoomBookingPaymentUrl,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase";

function buildCancelSuccessMessage(result: CancelBookingResult): string {
  const parts = ["Prenotazione annullata."];

  if (result.creditsPenalty != null && result.creditsPenalty > 0) {
    let penaltyMsg = `Penale applicata: ${formatCreditsCount(result.creditsPenalty)}`;
    if (result.penaltyPercent != null) {
      penaltyMsg += ` (${result.penaltyPercent}%)`;
    }
    parts.push(`${penaltyMsg}.`);
  }

  if (result.creditsRefunded != null && result.creditsRefunded > 0) {
    parts.push(
      `${formatCreditsCount(result.creditsRefunded)} rimborsati sul saldo.`,
    );
  }

  return parts.join(" ");
}

export default function MiePrenotazioniScreen() {
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [bookings, setBookings] = useState<BookingWithRoom[]>([]);
  const [cancelSettings, setCancelSettings] = useState({
    cancelMinHours: 24,
    autoConfirmMinHours: 12,
    approvalMinHours: 6,
    modifyMinHours: 6,
    bandRequired: false,
    locked: false,
    lockedMessage: "",
  });
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    if (!memberId) return;

    try {
      const list = await listMyBookings(supabase, memberId, tab);
      setBookings(list);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossibile caricare le prenotazioni",
      );
    }
  }, [memberId, supabase, tab]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      try {
        const [member, settings] = await Promise.all([
          getCurrentMember(supabase),
          getBookingSettings(supabase),
        ]);

        if (cancelled) return;

        setMemberId(member?.id ?? null);
        setCancelSettings(settings);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Errore di caricamento",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    void loadBookings().finally(() => setLoading(false));
  }, [loadBookings, memberId]);

  async function handlePay(bookingId: string) {
    const apiBaseUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim();
    if (!apiBaseUrl) {
      setError("EXPO_PUBLIC_WEB_URL non configurato per il pagamento.");
      return;
    }

    setPayingId(bookingId);
    setMessage(null);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const result = await requestRoomBookingPaymentUrl(bookingId, {
      apiBaseUrl,
      accessToken: session?.access_token,
    });

    setPayingId(null);

    if (!result.success || !result.url) {
      setError(result.message ?? "Impossibile avviare il pagamento.");
      return;
    }

    await Linking.openURL(result.url);
    setMessage("Pagamento aperto nel browser. Torna qui dopo aver completato.");
  }

  async function handleCancel(bookingId: string) {
    setCancellingId(bookingId);
    setMessage(null);
    setError(null);

    const result = await cancelBooking(supabase, bookingId);

    setCancellingId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Annullamento non riuscito.");
      return;
    }

    setMessage(buildCancelSuccessMessage(result));
    await loadBookings();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.description}>
        Le tue prenotazioni future e lo storico. Per modificare un orario, annulla
        (se consentito) e riprenota.
      </Text>

      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setTab("upcoming")}
          style={[styles.tab, tab === "upcoming" && styles.tabActive]}
        >
          <Text
            style={[styles.tabText, tab === "upcoming" && styles.tabTextActive]}
          >
            Future
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("past")}
          style={[styles.tab, tab === "past" && styles.tabActive]}
        >
          <Text
            style={[styles.tabText, tab === "past" && styles.tabTextActive]}
          >
            Storico
          </Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator style={styles.loader} color="#1e3a5f" />}

      {error && (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error}</Text>
        </View>
      )}

      {message && (
        <View style={styles.alertSuccess}>
          <Text style={styles.alertSuccessText}>{message}</Text>
        </View>
      )}

      {!loading && !memberId && (
        <Text style={styles.emptyHint}>
          Accedi per vedere le tue prenotazioni.
        </Text>
      )}

      {!loading && memberId && bookings.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyHint}>
            {tab === "upcoming"
              ? "Non hai prenotazioni future."
              : "Nessuna prenotazione passata."}
          </Text>
          {tab === "upcoming" && (
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push("/(tabs)/prenotazioni")}
            >
              <Text style={styles.primaryButtonText}>Prenota ora</Text>
            </Pressable>
          )}
        </View>
      )}

      {bookings.map((booking) => {
        const cancellable = canCancelBooking(booking.start_at, cancelSettings);

        return (
          <View key={booking.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardMain}>
                <Text style={styles.roomName}>
                  {booking.room?.name ?? "Sala"}
                </Text>
                <Text style={styles.dateTime}>
                  {formatBookingDateTime(booking.start_at, booking.end_at)}
                </Text>
                {booking.total_price_eur != null && (
                  <Text style={styles.price}>
                    {formatEuro(booking.total_price_eur)}
                  </Text>
                )}
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>
                  {bookingStatusLabel(booking.status, booking.payment_status)}
                </Text>
              </View>
            </View>

            {tab === "upcoming" &&
              booking.status !== "cancelled" &&
              bookingNeedsPayment(booking) && (
                <Pressable
                  disabled={payingId === booking.id}
                  onPress={() => void handlePay(booking.id)}
                  style={[
                    styles.primaryButton,
                    payingId === booking.id && styles.buttonDisabled,
                  ]}
                >
                  {payingId === booking.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Paga ora</Text>
                  )}
                </Pressable>
              )}

            {tab === "upcoming" && booking.status !== "cancelled" && (
              <View style={styles.cancelRow}>
                {cancellable ? (
                  <Pressable
                    disabled={cancellingId === booking.id}
                    onPress={() => void handleCancel(booking.id)}
                  >
                    <Text style={styles.cancelLink}>
                      {cancellingId === booking.id
                        ? "Annullamento…"
                        : "Annulla prenotazione"}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.cancelHint}>
                    Annullamento non disponibile online (meno di{" "}
                    {cancelSettings.cancelMinHours} ore). Contatta la segreteria.
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
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
  description: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#eee",
  },
  tabActive: {
    backgroundColor: "#1e3a5f",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  tabTextActive: {
    color: "#fff",
  },
  loader: {
    marginTop: 24,
  },
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  cardMain: {
    flex: 1,
  },
  roomName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  dateTime: {
    marginTop: 4,
    fontSize: 14,
    color: "#444",
  },
  price: {
    marginTop: 4,
    fontSize: 13,
    color: "#666",
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#444",
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#1e3a5f",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  cancelRow: {
    marginTop: 4,
  },
  cancelLink: {
    fontSize: 14,
    fontWeight: "500",
    color: "#b91c1c",
  },
  cancelHint: {
    fontSize: 12,
    color: "#888",
    lineHeight: 18,
  },
  emptyCard: {
    marginTop: 24,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderStyle: "dashed",
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 16,
  },
  emptyHint: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
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
  alertSuccess: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  alertSuccessText: {
    fontSize: 13,
    color: "#166534",
  },
});
