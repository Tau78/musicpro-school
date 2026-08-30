import { useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { minutesToTimeLabel } from "@musicpro/database";

import { addRomeDays, formatRomeDay } from "@/lib/lezioni-dates";

export type TimeGridEvent = {
  id: string;
  /** YYYY-MM-DD Europe/Rome */
  date: string;
  startMinute: number;
  endMinute: number;
  title: string;
  subtitle?: string;
  color: { bg: string; border: string; text: string };
  canDrag: boolean;
};

export type TimeGridWeekProps = {
  weekStart: string;
  today: string;
  events: TimeGridEvent[];
  selectedId?: string | null;
  onSelect: (event: TimeGridEvent) => void;
  onMove?: (
    event: TimeGridEvent,
    next: { date: string; startMinute: number },
  ) => void;
  /** Tap su area vuota della colonna giorno → slot (date + minuto). */
  onEmptyPress?: (slot: { date: string; startMinute: number }) => void;
  openMinute?: number;
  closeMinute?: number;
  dayCount?: number;
};

const PX_PER_HOUR = 52;
const DAY_COL_WIDTH = 88;
const GUTTER = 40;
const SLOT = 15;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function snapMinute(minute: number, open: number, close: number, duration: number) {
  const snapped = Math.round(minute / SLOT) * SLOT;
  return clamp(snapped, open, close - duration);
}

function EventBlock({
  event,
  openMinute,
  closeMinute,
  dayIndex,
  selected,
  onSelect,
  onMove,
}: {
  event: TimeGridEvent;
  openMinute: number;
  closeMinute: number;
  dayIndex: number;
  selected: boolean;
  onSelect: (event: TimeGridEvent) => void;
  onMove?: TimeGridWeekProps["onMove"];
}) {
  const duration = Math.max(SLOT, event.endMinute - event.startMinute);
  const top0 = ((event.startMinute - openMinute) / 60) * PX_PER_HOUR;
  const height = Math.max(28, (duration / 60) * PX_PER_HOUR - 2);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(0);
  const [liveLabel, setLiveLabel] = useState<string | null>(null);

  const commitMove = (dx: number, dy: number) => {
    if (!onMove || !event.canDrag) return;
    const dayDelta = Math.round(dx / DAY_COL_WIDTH);
    const minuteDelta = Math.round((dy / PX_PER_HOUR) * 60);
    const nextDate = addRomeDays(event.date, dayDelta);
    const nextStart = snapMinute(
      event.startMinute + minuteDelta,
      openMinute,
      closeMinute,
      duration,
    );
    if (nextDate === event.date && nextStart === event.startMinute) return;
    onMove(event, { date: nextDate, startMinute: nextStart });
  };

  const updateLive = (dx: number, dy: number) => {
    const dayDelta = Math.round(dx / DAY_COL_WIDTH);
    const minuteDelta = Math.round((dy / PX_PER_HOUR) * 60);
    const nextStart = snapMinute(
      event.startMinute + minuteDelta,
      openMinute,
      closeMinute,
      duration,
    );
    const dayHint =
      dayDelta === 0 ? "" : dayDelta > 0 ? ` +${dayDelta}g` : ` ${dayDelta}g`;
    setLiveLabel(`${minutesToTimeLabel(nextStart)}${dayHint}`);
  };

  const clearLive = () => setLiveLabel(null);

  const pan = Gesture.Pan()
    .enabled(Boolean(onMove) && event.canDrag)
    .activateAfterLongPress(280)
    .onStart(() => {
      dragging.value = 1;
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      runOnJS(updateLive)(e.translationX, e.translationY);
    })
    .onEnd((e) => {
      runOnJS(commitMove)(e.translationX, e.translationY);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      dragging.value = 0;
      runOnJS(clearLive)();
    })
    .onFinalize(() => {
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      dragging.value = 0;
      runOnJS(clearLive)();
    });

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onSelect)(event);
  });

  const gesture = Gesture.Exclusive(pan, tap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: dragging.value ? 1.04 : 1 },
    ],
    zIndex: dragging.value ? 20 : 2,
    opacity: dragging.value ? 0.95 : 1,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.event,
          {
            top: top0,
            height,
            left: 2,
            right: 2,
            backgroundColor: event.color.bg,
            borderColor: selected ? "#1e3a5f" : event.color.border,
            borderWidth: selected ? 2 : 1,
          },
          animStyle,
        ]}
      >
        <Text style={[styles.eventTime, { color: event.color.text }]} numberOfLines={1}>
          {liveLabel ?? minutesToTimeLabel(event.startMinute)}
        </Text>
        <Text style={[styles.eventTitle, { color: event.color.text }]} numberOfLines={2}>
          {event.title}
        </Text>
        {event.subtitle ? (
          <Text style={[styles.eventSub, { color: event.color.text }]} numberOfLines={1}>
            {event.subtitle}
          </Text>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

export function TimeGridWeek({
  weekStart,
  today,
  events,
  selectedId,
  onSelect,
  onMove,
  onEmptyPress,
  openMinute = 8 * 60,
  closeMinute = 22 * 60,
  dayCount = 6,
}: TimeGridWeekProps) {
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addRomeDays(weekStart, i)),
    [dayCount, weekStart],
  );

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let m = openMinute; m < closeMinute; m += 60) list.push(m);
    return list;
  }, [closeMinute, openMinute]);

  const gridHeight = ((closeMinute - openMinute) / 60) * PX_PER_HOUR;
  const [headerWidth, setHeaderWidth] = useState(DAY_COL_WIDTH * dayCount);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, TimeGridEvent[]>();
    for (const day of days) map.set(day, []);
    for (const event of events) {
      const list = map.get(event.date);
      if (!list) continue;
      if (event.endMinute <= openMinute || event.startMinute >= closeMinute) continue;
      list.push({
        ...event,
        startMinute: clamp(event.startMinute, openMinute, closeMinute - SLOT),
        endMinute: clamp(event.endMinute, openMinute + SLOT, closeMinute),
      });
    }
    return map;
  }, [closeMinute, days, events, openMinute]);

  const onHeaderLayout = (e: LayoutChangeEvent) => {
    setHeaderWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        style={styles.hScroll}
      >
        <View>
          <View style={styles.headerRow} onLayout={onHeaderLayout}>
            <View style={styles.gutter} />
            {days.map((date) => {
              const isToday = date === today;
              return (
                <View
                  key={date}
                  style={[styles.dayHeader, isToday && styles.dayHeaderToday]}
                >
                  <Text
                    style={[styles.dayHeaderText, isToday && styles.dayHeaderTextToday]}
                    numberOfLines={1}
                  >
                    {formatRomeDay(date)}
                  </Text>
                </View>
              );
            })}
          </View>

          <ScrollView
            nestedScrollEnabled
            style={{ maxHeight: 360 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.body, { height: gridHeight, width: headerWidth }]}>
              <View style={styles.gutterCol}>
                {hours.map((m) => (
                  <Text
                    key={m}
                    style={[
                      styles.hourLabel,
                      { top: ((m - openMinute) / 60) * PX_PER_HOUR - 7 },
                    ]}
                  >
                    {minutesToTimeLabel(m)}
                  </Text>
                ))}
              </View>

              {days.map((date, dayIndex) => (
                <View key={date} style={styles.dayCol}>
                  {hours.map((m) => (
                    <View
                      key={m}
                      style={[
                        styles.hourLine,
                        { top: ((m - openMinute) / 60) * PX_PER_HOUR },
                      ]}
                    />
                  ))}
                  {onEmptyPress ? (
                    <Pressable
                      style={StyleSheet.absoluteFill}
                      accessibilityLabel={`Aggiungi lezione il ${date}`}
                      onPress={(e) => {
                        const y = e.nativeEvent.locationY;
                        const raw =
                          openMinute + Math.round((y / PX_PER_HOUR) * 60);
                        const startMinute = snapMinute(
                          raw,
                          openMinute,
                          closeMinute,
                          SLOT,
                        );
                        onEmptyPress({ date, startMinute });
                      }}
                    />
                  ) : null}
                  {(eventsByDay.get(date) ?? []).map((event) => (
                    <EventBlock
                      key={event.id}
                      event={event}
                      openMinute={openMinute}
                      closeMinute={closeMinute}
                      dayIndex={dayIndex}
                      selected={event.id === selectedId}
                      onSelect={onSelect}
                      onMove={onMove}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
      <Text style={styles.hint}>
        Tieni premuto e trascina per spostare · tocca per modificare o eliminare
      </Text>
    </View>
  );
}

/** Empty-slot press helper for “aggiungi”. */
export function TimeGridAddBar({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.addBar} onPress={onPress}>
      <Text style={styles.addBarText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  hScroll: { flexGrow: 0 },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e5e5" },
  gutter: { width: GUTTER },
  gutterCol: { width: GUTTER, position: "relative" },
  dayHeader: {
    width: DAY_COL_WIDTH,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  dayHeaderToday: { backgroundColor: "#e8eef6" },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666",
    textTransform: "capitalize",
  },
  dayHeaderTextToday: { color: "#1e3a5f" },
  body: { flexDirection: "row", position: "relative" },
  dayCol: {
    width: DAY_COL_WIDTH,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "#e5e5e5",
    position: "relative",
  },
  hourLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#ececec",
  },
  hourLabel: {
    position: "absolute",
    left: 0,
    width: GUTTER - 4,
    fontSize: 10,
    color: "#888",
    textAlign: "right",
  },
  event: {
    position: "absolute",
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 3,
    overflow: "hidden",
  },
  eventTime: { fontSize: 10, fontWeight: "700" },
  eventTitle: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  eventSub: { fontSize: 10, marginTop: 1, opacity: 0.85 },
  hint: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 11,
    color: "#888",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e5e5",
  },
  addBar: {
    marginTop: 12,
    alignItems: "center",
    backgroundColor: "#1e3a5f",
    borderRadius: 10,
    paddingVertical: 14,
  },
  addBarText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
