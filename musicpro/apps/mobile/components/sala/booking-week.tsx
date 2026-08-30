import { Pressable, StyleSheet, Text, View } from "react-native";

import type { BookingWithRoom } from "@musicpro/database";
import { bookingStatusLabel } from "@musicpro/database";

import {
  addRomeDays,
  formatRomeDay,
  formatRomeTime,
} from "@/lib/lezioni-dates";

const WEEKDAY_COUNT = 6;

function bookingDateInRome(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function BookingWeek({
  weekStart,
  bookings,
  today,
  selectedBookingId,
  onSelectBooking,
}: {
  weekStart: string;
  bookings: BookingWithRoom[];
  today: string;
  selectedBookingId?: string | null;
  onSelectBooking: (booking: BookingWithRoom) => void;
}) {
  const days = Array.from({ length: WEEKDAY_COUNT }, (_, index) =>
    addRomeDays(weekStart, index),
  );

  const byDate = new Map<string, BookingWithRoom[]>();
  for (const booking of bookings) {
    const date = bookingDateInRome(booking.start_at);
    const list = byDate.get(date) ?? [];
    list.push(booking);
    byDate.set(date, list);
  }

  return (
    <View style={styles.week}>
      {days.map((date) => {
        const dayBookings = (byDate.get(date) ?? []).sort((a, b) =>
          a.start_at.localeCompare(b.start_at),
        );
        const isToday = date === today;
        return (
          <View
            key={date}
            style={[styles.dayBlock, isToday && styles.dayBlockToday]}
          >
            <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
              {formatRomeDay(date)}
              {isToday ? " · oggi" : ""}
            </Text>
            {dayBookings.length === 0 ? (
              <Text style={styles.emptyDay}>Libera</Text>
            ) : (
              dayBookings.map((booking) => {
                const selected = booking.id === selectedBookingId;
                return (
                  <Pressable
                    key={booking.id}
                    onPress={() => onSelectBooking(booking)}
                    style={[
                      styles.chip,
                      selected && styles.chipSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${booking.room?.name ?? "Sala"} ${formatRomeTime(booking.start_at)}`}
                  >
                    <Text style={styles.chipTime}>
                      {formatRomeTime(booking.start_at)}–
                      {formatRomeTime(booking.end_at)}
                    </Text>
                    <Text style={styles.chipTitle} numberOfLines={1}>
                      {booking.room?.name ?? "Sala"}
                      {booking.title ? ` · ${booking.title}` : ""}
                    </Text>
                    <Text style={styles.chipMeta} numberOfLines={1}>
                      {bookingStatusLabel(booking.status)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  week: { gap: 12 },
  dayBlock: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  dayBlockToday: { borderColor: "#1e3a5f" },
  dayLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e3a5f",
    marginBottom: 8,
    textTransform: "capitalize",
  },
  dayLabelToday: { color: "#1e3a5f" },
  emptyDay: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
  },
  chip: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c5d4e8",
    backgroundColor: "#e8eef6",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipSelected: {
    borderWidth: 2,
    borderColor: "#1e3a5f",
  },
  chipTime: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e3a5f",
  },
  chipTitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  chipMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#4a5f7a",
  },
});
