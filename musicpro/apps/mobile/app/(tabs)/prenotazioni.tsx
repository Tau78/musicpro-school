import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  type CreateBookingResult,
  type Room,
  type TimeSlot,
  createBooking,
  formatDateItalian,
  getCurrentMember,
  getRoomAvailability,
  listRooms,
  subscribeToBookings,
  todayInRome,
} from "@musicpro/database";

import { createClient } from "../../lib/supabase";

export default function PrenotazioniScreen() {
  const supabase = createClient();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [selectedDate] = useState(todayInRome());
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAvailability = useCallback(async () => {
    if (!selectedRoomId) return;

    try {
      const availability = await getRoomAvailability(
        supabase,
        selectedRoomId,
        selectedDate,
      );
      setSlots(availability.slots);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nel caricamento degli slot",
      );
    }
  }, [selectedDate, selectedRoomId, supabase]);

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
    void loadAvailability();
  }, [loadAvailability]);

  useEffect(() => {
    if (!selectedRoomId) return;

    const unsubscribe = subscribeToBookings(supabase, selectedRoomId, () => {
      void loadAvailability();
    });

    return unsubscribe;
  }, [loadAvailability, selectedRoomId, supabase]);

  async function handleBook(slot: TimeSlot) {
    if (!memberId) {
      setError("Accedi per prenotare una sala.");
      return;
    }

    setBookingSlot(slot.startAt);
    setMessage(null);
    setError(null);

    const result: CreateBookingResult = await createBooking(supabase, {
      roomId: selectedRoomId,
      memberId,
      startAt: slot.startAt,
      endAt: slot.endAt,
    });

    setBookingSlot(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Prenotazione non riuscita.");
      return;
    }

    setMessage(
      result.status === "pending"
        ? "Prenotazione in attesa (pagamento non ancora attivo)."
        : "Prenotazione confermata!",
    );
    await loadAvailability();
  }

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Prenota una sala</Text>
      <Text style={styles.description}>
        Slot aggiornati in tempo reale per {formatDateItalian(selectedDate)}.
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
            style={styles.roomPicker}
          >
            {rooms.map((room) => {
              const active = room.id === selectedRoomId;
              return (
                <Pressable
                  key={room.id}
                  onPress={() => setSelectedRoomId(room.id)}
                  style={[styles.roomChip, active && styles.roomChipActive]}
                >
                  <Text
                    style={[
                      styles.roomChipText,
                      active && styles.roomChipTextActive,
                    ]}
                  >
                    {room.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedRoom?.description && (
            <Text style={styles.roomDescription}>{selectedRoom.description}</Text>
          )}

          <Text style={styles.sectionLabel}>Slot disponibili</Text>
          {slots.map((slot) => {
            const isBooking = bookingSlot === slot.startAt;
            return (
              <Pressable
                key={slot.startAt}
                disabled={!slot.available || isBooking}
                onPress={() => void handleBook(slot)}
                style={[
                  styles.slotRow,
                  !slot.available && styles.slotRowDisabled,
                ]}
              >
                <View>
                  <Text
                    style={[
                      styles.slotLabel,
                      !slot.available && styles.slotLabelDisabled,
                    ]}
                  >
                    {slot.label}
                  </Text>
                  <Text style={styles.slotStatus}>
                    {slot.available
                      ? "Disponibile"
                      : slot.status === "pending"
                        ? "In attesa"
                        : "Occupato"}
                  </Text>
                </View>
                {isBooking && <ActivityIndicator color="#1e3a5f" />}
              </Pressable>
            );
          })}
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
  roomPicker: {
    flexGrow: 0,
  },
  roomChip: {
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    backgroundColor: "#fff",
  },
  roomChipActive: {
    borderColor: "#1e3a5f",
    backgroundColor: "#1e3a5f",
  },
  roomChipText: {
    fontSize: 14,
    color: "#444",
  },
  roomChipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  roomDescription: {
    marginTop: 8,
    fontSize: 13,
    color: "#666",
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
  slotRowDisabled: {
    backgroundColor: "#f5f5f5",
    borderColor: "#eee",
  },
  slotLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1e3a5f",
  },
  slotLabelDisabled: {
    color: "#999",
  },
  slotStatus: {
    marginTop: 2,
    fontSize: 12,
    color: "#888",
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
    marginTop: 24,
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
});
