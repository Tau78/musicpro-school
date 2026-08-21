import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import {
  type CalendarLesson,
  getTeacherProfile,
  listLessonsInRange,
  listLessonsOnDate,
  listRooms,
  minutesToTimeLabel,
  moveLesson,
  romeLocalInputToUtcIso,
  todayInRome,
  type Room,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CalendarMonth } from "@/components/lezioni/calendar-month";
import {
  CalendarWeek,
  isHoldLesson,
  lessonDateInRome,
} from "@/components/lezioni/calendar-week";
import { useAuth } from "@/contexts/AuthContext";
import { addRomeDays, formatRomeTime, startOfWeekMonday } from "@/lib/lezioni-dates";
import { createClient } from "@/lib/supabase";

type CalendarMode = "settimana" | "mese";

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

const TIME_SLOTS = Array.from({ length: 29 }, (_, index) =>
  minutesToTimeLabel(8 * 60 + index * 30),
);

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function addMonths(date: string, months: number): string {
  const [year, month] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + months, 1));
  return next.toISOString().slice(0, 10);
}

function monthLabel(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return `${MONTHS_IT[month - 1]} ${year}`;
}

function weekLabel(weekStart: string): string {
  const weekEnd = addRomeDays(weekStart, 5);
  const startDay = weekStart.slice(8, 10);
  const endDay = weekEnd.slice(8, 10);
  const startMonth = MONTHS_IT[Number(weekStart.slice(5, 7)) - 1];
  const endMonth = MONTHS_IT[Number(weekEnd.slice(5, 7)) - 1];
  const year = weekEnd.slice(0, 4);
  if (startMonth === endMonth) {
    return `${Number(startDay)}–${Number(endDay)} ${startMonth} ${year}`;
  }
  return `${Number(startDay)} ${startMonth} – ${Number(endDay)} ${endMonth} ${year}`;
}

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function isValidTime(value: string): boolean {
  const match = TIME_RE.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function kindLabel(lesson: CalendarLesson): string {
  if (lesson.isTrial || lesson.kind === "prova") return "Prova";
  if (lesson.kind === "recupero") return "Recupero";
  if (lesson.courseKind === "gruppo") return "Gruppo";
  if (lesson.courseKind === "online") return "Online";
  return "Individuale";
}

export default function LezioniCalendarioScreen() {
  const router = useRouter();
  const { member, roles, isLoading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const isDocente = roles.includes(MemberRole.Docente);

  const [mode, setMode] = useState<CalendarMode>("settimana");
  const [anchorDate, setAnchorDate] = useState(todayInRome);
  const [lessons, setLessons] = useState<CalendarLesson[]>([]);
  const [dayLessons, setDayLessons] = useState<CalendarLesson[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [canReschedule, setCanReschedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<CalendarLesson | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [moveTime, setMoveTime] = useState("");
  const [moveRoomId, setMoveRoomId] = useState<string | null>(null);
  const [savingMove, setSavingMove] = useState(false);
  const [moveMessage, setMoveMessage] = useState<string | null>(null);

  const today = todayInRome();
  const weekStart = startOfWeekMonday(anchorDate);
  const monthStart = startOfMonth(anchorDate);

  useEffect(() => {
    if (authLoading) return;
    if (!isDocente) {
      router.replace("/(tabs)/area-personale");
    }
  }, [authLoading, isDocente, router]);

  const loadProfileAndRooms = useCallback(async () => {
    if (!member) return;
    try {
      const [profile, roomRows] = await Promise.all([
        getTeacherProfile(supabase, member.id),
        listRooms(supabase),
      ]);
      setCanReschedule(Boolean(profile?.canReschedule));
      setRooms(roomRows);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossibile caricare il profilo docente.",
      );
    }
  }, [member, supabase]);

  const loadRange = useCallback(async () => {
    if (!member) return;
    setLoading(true);
    setError(null);
    try {
      const from = mode === "settimana" ? weekStart : monthStart;
      const to =
        mode === "settimana"
          ? addRomeDays(weekStart, 7)
          : addMonths(monthStart, 1);
      const rows = await listLessonsInRange(supabase, {
        from,
        to,
        teacherMemberId: member.id,
        includePendingHold: true,
      });
      setLessons(rows);
      setSelectedLesson((current) =>
        current ? (rows.find((row) => row.id === current.id) ?? null) : null,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossibile caricare il calendario.",
      );
    } finally {
      setLoading(false);
    }
  }, [member, mode, monthStart, supabase, weekStart]);

  const loadSelectedDay = useCallback(
    async (date: string) => {
      if (!member) return;
      try {
        const rows = await listLessonsOnDate(supabase, date, {
          teacherMemberId: member.id,
          includePendingHold: true,
        });
        setDayLessons(rows);
      } catch {
        setDayLessons([]);
      }
    },
    [member, supabase],
  );

  useEffect(() => {
    if (!isDocente || !member) return;
    void loadProfileAndRooms();
  }, [isDocente, loadProfileAndRooms, member]);

  useEffect(() => {
    if (!isDocente || !member) return;
    void loadRange();
  }, [isDocente, loadRange, member]);

  function closeMove() {
    setMoving(false);
    setMoveMessage(null);
  }

  function openDetail(lesson: CalendarLesson) {
    setSelectedLesson(lesson);
    const date = lessonDateInRome(lesson.startsAt);
    if (date) setSelectedDate(date);
    closeMove();
  }

  function startMove(lesson: CalendarLesson) {
    if (isHoldLesson(lesson) || !canReschedule) return;
    setSelectedLesson(lesson);
    const date = lessonDateInRome(lesson.startsAt) ?? today;
    setSelectedDate(date);
    setMoveDate(date);
    const time = formatRomeTime(lesson.startsAt);
    setMoveTime(time === "—" ? "09:00" : time);
    setMoveRoomId(lesson.roomId);
    setMoveMessage(null);
    setMoving(true);
  }

  async function handleSelectDate(date: string) {
    setSelectedDate(date);
    setSelectedLesson(null);
    setDayLessons([]);
    closeMove();
    await loadSelectedDay(date);
  }

  async function submitMove() {
    if (!selectedLesson || !member) return;
    if (!isValidDate(moveDate)) {
      setMoveMessage("Inserisci una data nel formato AAAA-MM-GG.");
      return;
    }
    if (!isValidTime(moveTime)) {
      setMoveMessage("Inserisci un orario nel formato HH:MM.");
      return;
    }

    setSavingMove(true);
    setMoveMessage(null);
    try {
      const result = await moveLesson(supabase, selectedLesson.id, {
        startsAt: romeLocalInputToUtcIso(`${moveDate}T${moveTime}`),
        roomId: moveRoomId,
        scope: "this",
        actor: {
          memberId: member.id,
          isStaff: false,
          canReschedule,
        },
      });
      if (!result.success) {
        setMoveMessage(result.errorMessage ?? "Impossibile spostare la lezione.");
        return;
      }
      const extra =
        result.warnings && result.warnings.length > 0
          ? ` ${result.warnings.join(" ")}`
          : "";
      setMoveMessage(`Lezione spostata.${extra}`);
      setMoving(false);
      setSelectedLesson(null);
      await loadRange();
      if (mode === "mese" && selectedDate) {
        await loadSelectedDay(selectedDate);
      }
    } catch (err) {
      setMoveMessage(
        err instanceof Error ? err.message : "Impossibile spostare la lezione.",
      );
    } finally {
      setSavingMove(false);
    }
  }

  function goPrev() {
    setSelectedLesson(null);
    closeMove();
    setAnchorDate((current) =>
      mode === "settimana" ? addRomeDays(current, -7) : addMonths(current, -1),
    );
  }

  function goNext() {
    setSelectedLesson(null);
    closeMove();
    setAnchorDate((current) =>
      mode === "settimana" ? addRomeDays(current, 7) : addMonths(current, 1),
    );
  }

  function goToday() {
    setSelectedLesson(null);
    closeMove();
    setAnchorDate(todayInRome());
    if (mode === "mese") {
      setSelectedDate(todayInRome());
      void loadSelectedDay(todayInRome());
    }
  }

  if (authLoading || !isDocente || !member) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
        <Text style={styles.loadingText}>Caricamento…</Text>
      </View>
    );
  }

  const monthLessons =
    mode === "mese" && selectedDate && dayLessons.length > 0
      ? mergeDayIntoRange(lessons, dayLessons, selectedDate)
      : lessons;

  const canMoveSelected =
    Boolean(selectedLesson) &&
    !isHoldLesson(selectedLesson!) &&
    canReschedule &&
    !selectedLesson!.hasAttendance;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.toggleRow}>
          {(["settimana", "mese"] as const).map((value) => {
            const active = mode === value;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  setMode(value);
                  setSelectedLesson(null);
                  closeMove();
                }}
                style={[styles.toggle, active && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                  {value === "settimana" ? "Settimana" : "Mese"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.navRow}>
          <Pressable onPress={goPrev} style={styles.navBtn}>
            <Text style={styles.navBtnText}>‹ Prec</Text>
          </Pressable>
          <Pressable onPress={goToday} style={styles.oggiBtn}>
            <Text style={styles.oggiBtnText}>Oggi</Text>
          </Pressable>
          <Pressable onPress={goNext} style={styles.navBtn}>
            <Text style={styles.navBtnText}>Succ ›</Text>
          </Pressable>
        </View>
        <Text style={styles.period}>
          {mode === "settimana" ? weekLabel(weekStart) : monthLabel(monthStart)}
        </Text>

        {error ? (
          <View style={styles.alertError}>
            <Text style={styles.alertErrorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator style={styles.loader} color="#1e3a5f" />
        ) : mode === "settimana" ? (
          <CalendarWeek
            weekStart={weekStart}
            lessons={lessons}
            today={today}
            selectedLessonId={selectedLesson?.id}
            onSelectLesson={openDetail}
            onLongPressLesson={canReschedule ? startMove : undefined}
          />
        ) : (
          <CalendarMonth
            monthStart={monthStart}
            lessons={monthLessons}
            today={today}
            selectedDate={selectedDate}
            selectedLessonId={selectedLesson?.id}
            onSelectDate={(date) => void handleSelectDate(date)}
            onSelectLesson={openDetail}
            onLongPressLesson={canReschedule ? startMove : undefined}
          />
        )}

        {selectedLesson ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>{selectedLesson.courseName}</Text>
            <Text style={styles.detailLine}>
              {formatRomeTime(selectedLesson.startsAt)}
              {selectedLesson.endsAt
                ? ` – ${formatRomeTime(selectedLesson.endsAt)}`
                : ""}
              {selectedLesson.roomName ? ` · ${selectedLesson.roomName}` : ""}
            </Text>
            <Text style={styles.detailMuted}>
              {kindLabel(selectedLesson)}
              {selectedLesson.subjectName ? ` · ${selectedLesson.subjectName}` : ""}
            </Text>
            {selectedLesson.studentNames.length > 0 ? (
              <Text style={styles.detailMuted}>
                {selectedLesson.studentNames.join(", ")}
              </Text>
            ) : null}
            {isHoldLesson(selectedLesson) ? (
              <Text style={styles.holdNote}>
                Corso in attesa: non si può spostare.
              </Text>
            ) : null}
            {selectedLesson.hasAttendance ? (
              <Text style={styles.holdNote}>
                Lezione già presenziata: sblocca la presenza prima di spostarla.
              </Text>
            ) : null}

            {canMoveSelected && !moving ? (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => startMove(selectedLesson)}
              >
                <Text style={styles.primaryBtnText}>Sposta</Text>
              </Pressable>
            ) : null}

            {moving ? (
              <View style={styles.moveBox}>
                <Text style={styles.moveTitle}>Sposta lezione</Text>
                <Text style={styles.fieldLabel}>Data (AAAA-MM-GG)</Text>
                <TextInput
                  value={moveDate}
                  onChangeText={setMoveDate}
                  placeholder="2026-09-01"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <Text style={styles.fieldLabel}>Ora (HH:MM)</Text>
                <TextInput
                  value={moveTime}
                  onChangeText={setMoveTime}
                  placeholder="18:00"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.slotScroller}
                >
                  {TIME_SLOTS.map((slot) => {
                    const active = slot === moveTime;
                    return (
                      <Pressable
                        key={slot}
                        onPress={() => setMoveTime(slot)}
                        style={[styles.slotChip, active && styles.slotChipActive]}
                      >
                        <Text
                          style={[
                            styles.slotChipText,
                            active && styles.slotChipTextActive,
                          ]}
                        >
                          {slot}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {selectedLesson.courseKind !== "online" ? (
                  <>
                    <Text style={styles.fieldLabel}>Sala (facoltativa)</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.slotScroller}
                    >
                      <Pressable
                        onPress={() => setMoveRoomId(null)}
                        style={[
                          styles.slotChip,
                          moveRoomId === null && styles.slotChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.slotChipText,
                            moveRoomId === null && styles.slotChipTextActive,
                          ]}
                        >
                          Invariata
                        </Text>
                      </Pressable>
                      {rooms.map((room) => {
                        const active = room.id === moveRoomId;
                        return (
                          <Pressable
                            key={room.id}
                            onPress={() => setMoveRoomId(room.id)}
                            style={[styles.slotChip, active && styles.slotChipActive]}
                          >
                            <Text
                              style={[
                                styles.slotChipText,
                                active && styles.slotChipTextActive,
                              ]}
                            >
                              {room.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : null}

                {moveMessage ? (
                  <Text
                    style={
                      moveMessage.startsWith("Lezione spostata")
                        ? styles.successText
                        : styles.errorText
                    }
                  >
                    {moveMessage}
                  </Text>
                ) : null}

                <View style={styles.moveActions}>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={closeMove}
                    disabled={savingMove}
                  >
                    <Text style={styles.secondaryBtnText}>Annulla</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => void submitMove()}
                    disabled={savingMove}
                  >
                    <Text style={styles.primaryBtnText}>
                      {savingMove ? "Spostamento…" : "Conferma"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {moveMessage && !selectedLesson ? (
          <View style={styles.alertSuccess}>
            <Text style={styles.successText}>{moveMessage}</Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function mergeDayIntoRange(
  range: CalendarLesson[],
  day: CalendarLesson[],
  date: string,
): CalendarLesson[] {
  const others = range.filter((lesson) => lessonDateInRome(lesson.startsAt) !== date);
  return [...others, ...day].sort((a, b) =>
    (a.startsAt ?? "").localeCompare(b.startsAt ?? ""),
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#fafafa",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
  },
  loadingText: {
    marginTop: 12,
    color: "#666",
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#e8eef5",
    borderRadius: 10,
    padding: 4,
  },
  toggle: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  toggleActive: {
    backgroundColor: "#1e3a5f",
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  toggleTextActive: {
    color: "#fff",
  },
  navRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  navBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  oggiBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#1e3a5f",
  },
  oggiBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  period: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "600",
    color: "#1e3a5f",
    textTransform: "capitalize",
    textAlign: "center",
  },
  loader: {
    marginTop: 24,
  },
  alertError: {
    marginTop: 12,
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
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  detailCard: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e3a5f",
  },
  detailLine: {
    marginTop: 6,
    fontSize: 14,
    color: "#222",
  },
  detailMuted: {
    marginTop: 4,
    fontSize: 13,
    color: "#666",
  },
  holdNote: {
    marginTop: 8,
    fontSize: 13,
    color: "#92400e",
  },
  primaryBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#1e3a5f",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d4d4d4",
  },
  secondaryBtnText: {
    color: "#1e3a5f",
    fontSize: 14,
    fontWeight: "600",
  },
  moveBox: {
    marginTop: 12,
  },
  moveTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e3a5f",
    marginBottom: 8,
  },
  fieldLabel: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#222",
  },
  slotScroller: {
    flexGrow: 0,
    marginTop: 8,
  },
  slotChip: {
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    backgroundColor: "#fff",
  },
  slotChipActive: {
    borderColor: "#1e3a5f",
    backgroundColor: "#1e3a5f",
  },
  slotChipText: {
    fontSize: 13,
    color: "#444",
  },
  slotChipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  moveActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    marginTop: 10,
    fontSize: 13,
    color: "#991b1b",
  },
  successText: {
    marginTop: 10,
    fontSize: 13,
    color: "#166534",
  },
});
