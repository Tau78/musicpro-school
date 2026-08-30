import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";

import {
  type CreateBookingResult,
  type Room,
  type TimeSlot,
  calculateBookingPrice,
  createBooking,
  durationOptionsForRoom,
  fetchRoomAvailability,
  formatDateItalian,
  formatDurationLabel,
  formatEuro,
  getCurrentMember,
  listRooms,
  requestRoomBookingPaymentUrl,
  subscribeToBookings,
  todayInRome,
} from "@musicpro/database";

import { addRomeDays } from "@/lib/lezioni-dates";
import { createClient } from "../../lib/supabase";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export default function PrenotazioniScreen() {
  // Stable client: a new client every render recreates loadAvailability and
  // retriggers the slots effect → infinite spinner flicker on TestFlight.
  const supabase = useMemo(() => createClient(), []);
  const loadRequestId = useRef(0);
  const params = useLocalSearchParams<{ date?: string; ora?: string }>();
  const prefDate =
    typeof params.date === "string" && DATE_RE.test(params.date)
      ? params.date
      : null;
  const prefOra =
    typeof params.ora === "string" && TIME_RE.test(params.ora)
      ? params.ora
      : null;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [selectedDate, setSelectedDate] = useState(
    () => prefDate ?? todayInRome(),
  );
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const durationOptions = useMemo(
    () => (selectedRoom ? durationOptionsForRoom(selectedRoom) : []),
    [selectedRoom],
  );

  const bookableSlots = useMemo(
    () => slots.filter((slot) => slot.available),
    [slots],
  );

  const previewPrice = useMemo(() => {
    if (!selectedRoom) return null;
    return (
      selectedSlot?.priceEur ??
      calculateBookingPrice(selectedRoom, durationMinutes)
    );
  }, [durationMinutes, selectedRoom, selectedSlot]);

  const loadAvailability = useCallback(async () => {
    if (!selectedRoomId) return;

    const apiBaseUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim();
    if (!apiBaseUrl) {
      setError("EXPO_PUBLIC_WEB_URL non configurato per la disponibilità sale.");
      return;
    }

    const requestId = ++loadRequestId.current;
    setLoadingSlots(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const availability = await fetchRoomAvailability(
        selectedRoomId,
        selectedDate,
        durationMinutes,
        {
          apiBaseUrl,
          accessToken: session?.access_token,
        },
      );
      if (requestId !== loadRequestId.current) return;
      setSlots(availability.slots);
      setError(null);
    } catch (err) {
      if (requestId !== loadRequestId.current) return;
      setError(
        err instanceof Error ? err.message : "Errore nel caricamento degli slot",
      );
    } finally {
      if (requestId === loadRequestId.current) {
        setLoadingSlots(false);
      }
    }
  }, [durationMinutes, selectedDate, selectedRoomId, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      try {
        const [roomList, member] = await Promise.all([
          listRooms(supabase),
          getCurrentMember(supabase),
        ]);

        if (cancelled) return;

        setRooms(roomList);
        if (roomList.length > 0) {
          setSelectedRoomId(roomList[0].id);
          setDurationMinutes(roomList[0].default_duration_minutes);
        }
        setMemberId(member?.id ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Impossibile caricare le sale prova",
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
    if (prefDate) setSelectedDate(prefDate);
  }, [prefDate]);

  useEffect(() => {
    setSelectedSlot(null);
    void loadAvailability();
  }, [loadAvailability]);

  useEffect(() => {
    if (!prefOra || slots.length === 0) return;
    const match = slots.find((slot) => {
      if (!slot.available) return false;
      const label = new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(slot.startAt));
      return label === prefOra;
    });
    if (match) setSelectedSlot(match);
  }, [prefOra, slots]);

  useEffect(() => {
    if (!selectedRoomId) return;

    const unsubscribe = subscribeToBookings(supabase, selectedRoomId, () => {
      void loadAvailability();
    });

    return unsubscribe;
  }, [loadAvailability, selectedRoomId, supabase]);

  function shiftDate(days: number) {
    const next = addRomeDays(selectedDate, days);
    const min = todayInRome();
    if (next < min) return;
    setSelectedDate(next);
    setSelectedSlot(null);
  }

  async function handleConfirm() {
    if (!memberId || !selectedSlot) {
      setError("Seleziona uno slot disponibile.");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);

    const result: CreateBookingResult = await createBooking(supabase, {
      roomId: selectedRoomId,
      memberId,
      startAt: selectedSlot.startAt,
      endAt: selectedSlot.endAt,
    });

    if (!result.success) {
      setSubmitting(false);
      setError(result.errorMessage ?? "Prenotazione non riuscita.");
      return;
    }

    if (
      result.status === "pending" &&
      result.requiresPayment &&
      result.bookingId
    ) {
      const apiBaseUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const payment = await requestRoomBookingPaymentUrl(result.bookingId, {
        apiBaseUrl,
        accessToken: session?.access_token,
      });

      setSubmitting(false);

      if (payment.success && payment.url) {
        await Linking.openURL(payment.url);
        setMessage(
          "Prenotazione registrata. Completa il pagamento nel browser.",
        );
        setSelectedSlot(null);
        await loadAvailability();
        return;
      }

      setError(
        payment.message ??
          "Prenotazione registrata ma il pagamento non è partito. Puoi pagare da «Le mie prenotazioni».",
      );
      setSelectedSlot(null);
      await loadAvailability();
      return;
    }

    setSubmitting(false);

    setMessage(
      result.status === "pending_approval"
        ? "Richiesta inviata: in attesa di approvazione."
        : result.status === "pending"
          ? "Prenotazione registrata (pagamento in arrivo)."
          : "Prenotazione confermata!",
    );
    setSelectedSlot(null);
    await loadAvailability();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Prenota una sala</Text>
      <Text style={styles.description}>
        Scegli sala, durata e data, poi seleziona uno slot.
      </Text>

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

      {!loading && rooms.length === 0 && (
        <Text style={styles.emptyHint}>
          Nessuna sala disponibile. Verifica permessi o quota associativa.
        </Text>
      )}

      {rooms.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Sala</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipPicker}
          >
            {rooms.map((room) => {
              const active = room.id === selectedRoomId;
              return (
                <Pressable
                  key={room.id}
                  onPress={() => {
                    setSelectedRoomId(room.id);
                    setDurationMinutes(room.default_duration_minutes);
                    setSelectedSlot(null);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {room.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedRoom?.description && (
            <Text style={styles.hint}>{selectedRoom.description}</Text>
          )}

          <Text style={styles.sectionLabel}>Durata</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipPicker}
          >
            {durationOptions.map((minutes) => {
              const active = minutes === durationMinutes;
              return (
                <Pressable
                  key={minutes}
                  onPress={() => {
                    setDurationMinutes(minutes);
                    setSelectedSlot(null);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {formatDurationLabel(minutes)}
                    {selectedRoom
                      ? ` · ${formatEuro(calculateBookingPrice(selectedRoom, minutes))}`
                      : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.sectionLabel}>Data</Text>
          <View style={styles.dateRow}>
            <Pressable
              onPress={() => shiftDate(-1)}
              disabled={selectedDate <= todayInRome()}
              style={[
                styles.dateNavButton,
                selectedDate <= todayInRome() && styles.dateNavButtonDisabled,
              ]}
            >
              <Text style={styles.dateNavButtonText}>‹</Text>
            </Pressable>
            <View style={styles.dateCenter}>
              <Text style={styles.dateLabel}>{formatDateItalian(selectedDate)}</Text>
            </View>
            <Pressable onPress={() => shiftDate(1)} style={styles.dateNavButton}>
              <Text style={styles.dateNavButtonText}>›</Text>
            </Pressable>
          </View>

          {selectedSlot ? (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Conferma prenotazione</Text>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmKey}>Sala</Text>
                <Text style={styles.confirmValue}>{selectedRoom?.name}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmKey}>Quando</Text>
                <Text style={styles.confirmValue}>{selectedSlot.label}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmKey}>Durata</Text>
                <Text style={styles.confirmValue}>
                  {formatDurationLabel(durationMinutes)}
                </Text>
              </View>
              <View style={[styles.confirmRow, styles.confirmTotalRow]}>
                <Text style={styles.confirmKey}>Totale</Text>
                <Text style={styles.confirmTotal}>
                  {previewPrice != null ? formatEuro(previewPrice) : "—"}
                </Text>
              </View>
              {selectedSlot.leadTimeCategory === "approval" && (
                <Text style={styles.approvalHint}>
                  Questa fascia richiede approvazione admin.
                </Text>
              )}
              <View style={styles.confirmActions}>
                <Pressable
                  disabled={submitting}
                  onPress={() => void handleConfirm()}
                  style={[styles.primaryButton, submitting && styles.buttonDisabled]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Conferma prenotazione</Text>
                  )}
                </Pressable>
                <Pressable
                  disabled={submitting}
                  onPress={() => setSelectedSlot(null)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Indietro</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>
                Slot disponibili ({formatDurationLabel(durationMinutes)})
              </Text>
              {loadingSlots && (
                <ActivityIndicator style={styles.loader} color="#1e3a5f" />
              )}
              {!loadingSlots && bookableSlots.length === 0 && (
                <Text style={styles.emptyHint}>
                  Nessuno slot prenotabile per questa data e durata.
                </Text>
              )}
              {!loadingSlots &&
                bookableSlots.map((slot) => (
                  <Pressable
                    key={slot.startAt}
                    onPress={() => setSelectedSlot(slot)}
                    style={styles.slotRow}
                  >
                    <View>
                      <Text style={styles.slotLabel}>{slot.label}</Text>
                      <Text style={styles.slotStatus}>
                        {slot.leadTimeCategory === "approval"
                          ? "Richiede approvazione"
                          : slot.priceEur != null
                            ? formatEuro(slot.priceEur)
                            : "Disponibile"}
                      </Text>
                    </View>
                    <Text style={styles.slotChevron}>›</Text>
                  </Pressable>
                ))}
            </>
          )}
        </>
      )}
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
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  description: {
    marginTop: 8,
    fontSize: 15,
    color: "#444",
    lineHeight: 22,
  },
  loader: {
    marginTop: 24,
  },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  chipPicker: {
    flexGrow: 0,
  },
  chip: {
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    backgroundColor: "#fff",
  },
  chipActive: {
    borderColor: "#1e3a5f",
    backgroundColor: "#1e3a5f",
  },
  chipText: {
    fontSize: 14,
    color: "#444",
  },
  chipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  hint: {
    marginTop: 8,
    fontSize: 13,
    color: "#666",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateNavButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  dateNavButtonDisabled: {
    opacity: 0.4,
  },
  dateNavButtonText: {
    fontSize: 24,
    lineHeight: 28,
    color: "#1e3a5f",
  },
  dateCenter: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1e3a5f",
    textAlign: "center",
    textTransform: "capitalize",
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
  },
  slotLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1e3a5f",
  },
  slotStatus: {
    marginTop: 2,
    fontSize: 12,
    color: "#888",
  },
  slotChevron: {
    fontSize: 22,
    color: "#999",
  },
  confirmCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  confirmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  confirmKey: {
    fontSize: 14,
    color: "#666",
  },
  confirmValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#1e3a5f",
    textAlign: "right",
  },
  confirmTotalRow: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  confirmTotal: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  approvalHint: {
    marginTop: 12,
    fontSize: 13,
    color: "#92400e",
  },
  confirmActions: {
    marginTop: 20,
    gap: 10,
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: "#1e3a5f",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: "#666",
  },
  buttonDisabled: {
    opacity: 0.7,
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
  emptyHint: {
    marginTop: 16,
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
});
