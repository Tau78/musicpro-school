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
  formatDateItalian,
  formatDurationLabel,
  formatEuro,
  getCurrentMember,
  getRoomAvailability,
  listRooms,
  peekRoomAvailabilityCache,
  requestBookingConfirmationEmail,
  requestRoomBookingPaymentUrl,
  subscribeToBookings,
  invalidateRoomAvailabilityCache,
  todayInRome,
} from "@musicpro/database";

import { AssociateGradientBg } from "@/components/associate-gradient-bg";
import { addRomeDays } from "@/lib/lezioni-dates";
import {
  roomCapacityLabel,
  roomVisualFromName,
  theme,
} from "@/lib/theme";
import { createClient } from "../../lib/supabase";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

type BookingStep = "room" | "duration" | "slot" | "confirm";

const WIZARD_STEPS: { key: BookingStep; label: string }[] = [
  { key: "room", label: "Sala" },
  { key: "duration", label: "Durata" },
  { key: "slot", label: "Data e orario" },
  { key: "confirm", label: "Conferma" },
];

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
  const [stepIndex, setStepIndex] = useState(0);

  const currentStep = WIZARD_STEPS[stepIndex]?.key ?? "room";
  const confirmStepIndex = WIZARD_STEPS.findIndex((step) => step.key === "confirm");

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

    const requestId = ++loadRequestId.current;
    const cached = peekRoomAvailabilityCache(
      selectedRoomId,
      selectedDate,
      durationMinutes,
    );
    if (cached) {
      setSlots(cached.slots);
      setLoadingSlots(false);
    } else {
      setLoadingSlots(true);
    }

    try {
      const availability = await getRoomAvailability(
        supabase,
        selectedRoomId,
        selectedDate,
        durationMinutes,
      );
      if (requestId !== loadRequestId.current) return;
      setSlots(availability.slots);
      setError(null);
    } catch (err) {
      if (requestId !== loadRequestId.current) return;
      if (cached) return;
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
    if (currentStep !== "slot" && currentStep !== "confirm") return;
    void loadAvailability();
  }, [currentStep, loadAvailability]);

  useEffect(() => {
    if (currentStep !== "slot") return;
    setSelectedSlot(null);
  }, [currentStep, selectedDate, durationMinutes, selectedRoomId]);

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
    if (match) {
      setSelectedSlot(match);
      if (confirmStepIndex >= 0) setStepIndex(confirmStepIndex);
    }
  }, [confirmStepIndex, prefOra, slots]);

  useEffect(() => {
    if (!selectedRoomId) return;

    const unsubscribe = subscribeToBookings(supabase, selectedRoomId, () => {
      invalidateRoomAvailabilityCache(selectedRoomId);
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
    if (submitting) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const result: CreateBookingResult = await createBooking(supabase, {
        roomId: selectedRoomId,
        memberId,
        startAt: selectedSlot.startAt,
        endAt: selectedSlot.endAt,
      });

      if (!result.success) {
        setError(result.errorMessage ?? "Prenotazione non riuscita.");
        return;
      }

      if (
        result.bookingId &&
        (result.status === "confirmed" || result.status === "pending_approval")
      ) {
        const emailBaseUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim();
        if (emailBaseUrl) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.access_token) {
            void requestBookingConfirmationEmail(result.bookingId, {
              apiBaseUrl: emailBaseUrl,
              accessToken: session.access_token,
              template: "confirm",
            });
          }
        }
      }

      const needsCardPayment =
        result.requiresPayment &&
        result.bookingId &&
        (result.status === "pending" || result.status === "pending_approval");

      if (needsCardPayment) {
        const apiBaseUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const payment = await requestRoomBookingPaymentUrl(result.bookingId!, {
          apiBaseUrl,
          accessToken: session?.access_token,
        });

        if (payment.success && payment.url) {
          await Linking.openURL(payment.url);
          return;
        }

        setError(
          payment.message ??
            "Impossibile avviare il pagamento. Riprova o contatta la segreteria.",
        );
        setSelectedSlot(null);
        await loadAvailability();
        return;
      }

      if (result.requiresPayment) {
        setError("Completa il pagamento per confermare la prenotazione.");
        setSelectedSlot(null);
        await loadAvailability();
        return;
      }

      setMessage(
        result.status === "pending_approval"
          ? "Richiesta inviata: in attesa di approvazione."
          : "Prenotazione confermata!",
      );
      setSelectedSlot(null);
      setStepIndex(0);
      await loadAvailability();
    } finally {
      setSubmitting(false);
    }
  }

  function goToStep(nextIndex: number) {
    setStepIndex(Math.max(0, Math.min(nextIndex, WIZARD_STEPS.length - 1)));
  }

  function handleTabPress(index: number) {
    if (index > stepIndex) return;
    if (WIZARD_STEPS[index]?.key !== "confirm") {
      setSelectedSlot(null);
    }
    goToStep(index);
  }

  return (
    <AssociateGradientBg>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>PRENOTA SALA</Text>
      <Text style={styles.title}>Prenota una sala</Text>

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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabBar}
            contentContainerStyle={styles.tabBarContent}
          >
            {WIZARD_STEPS.map(({ key, label }, index) => {
              const active = stepIndex === index;
              const enabled = index <= stepIndex;
              return (
                <Pressable
                  key={key}
                  disabled={!enabled}
                  onPress={() => handleTabPress(index)}
                  style={[
                    styles.tabPill,
                    active && styles.tabPillActive,
                    !enabled && styles.tabPillDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabPillText,
                      active && styles.tabPillTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {currentStep === "room" && (
            <View style={styles.stepBody}>
              <View style={styles.roomGrid}>
                {rooms.map((room) => {
                  const active = room.id === selectedRoomId;
                  const visual = roomVisualFromName(room.name);
                  const capacity = roomCapacityLabel(room.name, room.capacity);
                  return (
                    <Pressable
                      key={room.id}
                      onPress={() => {
                        setSelectedRoomId(room.id);
                        setDurationMinutes(room.default_duration_minutes);
                        setSelectedSlot(null);
                      }}
                      style={[
                        styles.roomCard,
                        active && { borderColor: visual.color, borderWidth: 2 },
                      ]}
                    >
                      <View
                        style={[styles.roomIcon, { backgroundColor: visual.color }]}
                      >
                        <Text style={styles.roomEmoji}>{visual.emoji}</Text>
                      </View>
                      <Text style={styles.roomName}>
                        {room.name.replace(/^Sala\s+/i, "")}
                      </Text>
                      {capacity ? (
                        <Text style={styles.roomTag}>{capacity}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {selectedRoom?.description ? (
                <Text style={styles.hint}>{selectedRoom.description}</Text>
              ) : null}
              <Pressable
                onPress={() => goToStep(stepIndex + 1)}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Continua</Text>
              </Pressable>
            </View>
          )}

          {currentStep === "duration" && (
            <View style={styles.stepBody}>
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
              <View style={styles.stepActions}>
                <Pressable
                  onPress={() => goToStep(stepIndex + 1)}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>Continua</Text>
                </Pressable>
                <Pressable onPress={() => goToStep(stepIndex - 1)}>
                  <Text style={styles.linkButton}>Indietro</Text>
                </Pressable>
              </View>
            </View>
          )}

          {currentStep === "slot" && (
            <View style={styles.stepBody}>
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
                  <Text style={styles.dateLabel}>
                    {formatDateItalian(selectedDate)}
                  </Text>
                </View>
                <Pressable onPress={() => shiftDate(1)} style={styles.dateNavButton}>
                  <Text style={styles.dateNavButtonText}>›</Text>
                </Pressable>
              </View>

              {loadingSlots && (
                <ActivityIndicator style={styles.loaderInline} color="#1e3a5f" />
              )}
              {!loadingSlots && bookableSlots.length === 0 && (
                <Text style={styles.emptyHint}>
                  Nessuno slot per questa data e durata.
                </Text>
              )}
              {!loadingSlots &&
                bookableSlots.map((slot) => (
                  <Pressable
                    key={slot.startAt}
                    onPress={() => {
                      setSelectedSlot(slot);
                      goToStep(confirmStepIndex);
                    }}
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

              <Pressable onPress={() => goToStep(stepIndex - 1)}>
                <Text style={styles.linkButton}>Indietro</Text>
              </Pressable>
            </View>
          )}

          {currentStep === "confirm" && selectedSlot && (
            <View style={styles.stepBody}>
              <View style={styles.confirmCard}>
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
                      <Text style={styles.primaryButtonText}>Conferma</Text>
                    )}
                  </Pressable>
                  <Pressable
                    disabled={submitting}
                    onPress={() => {
                      setSelectedSlot(null);
                      goToStep(stepIndex - 1);
                    }}
                  >
                    <Text style={styles.linkButton}>Indietro</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
    </AssociateGradientBg>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: theme.accent,
  },
  title: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: "600",
    color: theme.brand,
  },
  loader: {
    marginTop: 16,
  },
  loaderInline: {
    marginVertical: 8,
  },
  tabBar: {
    marginTop: 12,
    flexGrow: 0,
  },
  tabBarContent: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 4,
  },
  tabPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#eee",
  },
  tabPillActive: {
    backgroundColor: theme.brand,
  },
  tabPillDisabled: {
    opacity: 0.55,
  },
  tabPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  tabPillTextActive: {
    color: "#fff",
  },
  stepBody: {
    marginTop: 12,
    gap: 10,
  },
  stepActions: {
    gap: 8,
  },
  linkButton: {
    fontSize: 14,
    color: "#666",
    textDecorationLine: "underline",
    paddingVertical: 4,
  },
  roomGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  roomCard: {
    width: "31%",
    minWidth: 96,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.glassBorder,
    backgroundColor: theme.glass,
  },
  roomIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  roomEmoji: {
    fontSize: 18,
  },
  roomName: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.brand,
    textAlign: "center",
  },
  roomTag: {
    marginTop: 4,
    fontSize: 9,
    color: "#666",
    textAlign: "center",
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
    borderColor: theme.glassBorder,
    backgroundColor: theme.glass,
  },
  chipActive: {
    borderColor: theme.brand,
    backgroundColor: theme.brand,
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
    borderColor: theme.glassBorder,
    backgroundColor: theme.glass,
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
    borderColor: theme.glassBorder,
    backgroundColor: theme.glass,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.glassBorder,
    backgroundColor: theme.glass,
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
    borderRadius: 12,
    backgroundColor: theme.brand,
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
