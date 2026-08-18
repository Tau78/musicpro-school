import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getLessonRoster,
  saveLessonAttendance,
  type AttendanceStatus,
  type LessonRoster,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase";

export type AttendancePanelProps = {
  lessonId: string;
  actorMemberId: string;
  onSaved?: () => void;
};

const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: "presente", label: "Presente" },
  { value: "assente", label: "Assente" },
  { value: "assente_giustificato", label: "Assente giustificato" },
];

function isHoldLessonId(lessonId: string): boolean {
  return lessonId.startsWith("hold:");
}

function studentLabel(firstName: string, lastName: string): string {
  return `${lastName} ${firstName}`.trim() || "Allievo";
}

function draftFromRoster(
  roster: LessonRoster,
): Record<string, AttendanceStatus> {
  return Object.fromEntries(
    roster.students.map((student) => [
      student.memberId,
      student.status ?? "presente",
    ]),
  );
}

export function AttendancePanel({
  lessonId,
  actorMemberId,
  onSaved,
}: AttendancePanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const actor = useMemo(
    () => ({ memberId: actorMemberId, isStaff: false as const }),
    [actorMemberId],
  );

  const [roster, setRoster] = useState<LessonRoster | null>(null);
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(!isHoldLessonId(lessonId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    if (isHoldLessonId(lessonId)) {
      setRoster(null);
      setDraft({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await getLessonRoster(supabase, lessonId, actor);
      setRoster(next);
      setDraft(next ? draftFromRoster(next) : {});
    } catch (err) {
      setRoster(null);
      setDraft({});
      setError(
        err instanceof Error ? err.message : "Impossibile caricare il registro.",
      );
    } finally {
      setLoading(false);
    }
  }, [actor, lessonId, supabase]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  async function handleSave() {
    if (!roster?.canEdit) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const result = await saveLessonAttendance(supabase, {
      lessonId,
      actorMemberId,
      isStaff: false,
      rows: roster.students.map((student) => ({
        memberId: student.memberId,
        status: draft[student.memberId] ?? "presente",
      })),
    });

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile salvare le presenze.");
      return;
    }

    setSuccess("Presenze salvate.");
    await loadRoster();
    onSaved?.();
  }

  if (isHoldLessonId(lessonId)) {
    return (
      <Text style={styles.muted}>Corso in attesa, niente registro.</Text>
    );
  }

  if (loading) {
    return <ActivityIndicator style={styles.loader} color="#1e3a5f" />;
  }

  if (!roster) {
    return (
      <Text style={styles.muted}>
        {error ?? "Registro non disponibile."}
      </Text>
    );
  }

  return (
    <View>
      {error ? (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error}</Text>
        </View>
      ) : null}
      {success ? (
        <View style={styles.alertSuccess}>
          <Text style={styles.alertSuccessText}>{success}</Text>
        </View>
      ) : null}

      {!roster.canEdit && roster.editBlockReason ? (
        <View style={styles.alertWarn}>
          <Text style={styles.alertWarnText}>{roster.editBlockReason}</Text>
        </View>
      ) : null}

      {roster.students.length === 0 ? (
        <Text style={styles.muted}>Nessun allievo in elenco.</Text>
      ) : (
        roster.students.map((student) => {
          const selected = draft[student.memberId] ?? "presente";
          const phone = student.phone ?? student.tutorPhone;
          return (
            <View key={student.memberId} style={styles.studentRow}>
              <Text style={styles.studentName}>
                {studentLabel(student.firstName, student.lastName)}
              </Text>
              {phone ? (
                <Pressable onPress={() => void Linking.openURL(`tel:${phone}`)}>
                  <Text style={styles.phone}>{phone}</Text>
                </Pressable>
              ) : (
                <Text style={styles.mutedSmall}>Nessun telefono</Text>
              )}
              <View style={styles.statusRow}>
                {STATUSES.map((status) => {
                  const active = selected === status.value;
                  return (
                    <Pressable
                      key={status.value}
                      disabled={!roster.canEdit || saving}
                      onPress={() =>
                        setDraft((prev) => ({
                          ...prev,
                          [student.memberId]: status.value,
                        }))
                      }
                      style={[
                        styles.statusChip,
                        active && styles.statusChipActive,
                        (!roster.canEdit || saving) && styles.statusChipDisabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          active && styles.statusChipTextActive,
                        ]}
                      >
                        {status.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })
      )}

      <Pressable
        disabled={!roster.canEdit || saving || roster.students.length === 0}
        onPress={() => void handleSave()}
        style={[
          styles.saveButton,
          (!roster.canEdit || saving || roster.students.length === 0) &&
            styles.saveButtonDisabled,
        ]}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Salva presenze</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginVertical: 8,
  },
  muted: {
    fontSize: 13,
    color: "#888",
  },
  mutedSmall: {
    marginTop: 2,
    fontSize: 12,
    color: "#888",
  },
  alertError: {
    marginBottom: 10,
    padding: 10,
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
    marginBottom: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  alertSuccessText: {
    fontSize: 13,
    color: "#166534",
  },
  alertWarn: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  alertWarnText: {
    fontSize: 13,
    color: "#92400e",
  },
  studentRow: {
    marginBottom: 12,
  },
  studentName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#222",
  },
  phone: {
    marginTop: 2,
    fontSize: 13,
    color: "#1e3a5f",
    fontWeight: "500",
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    backgroundColor: "#fff",
  },
  statusChipActive: {
    borderColor: "#1e3a5f",
    backgroundColor: "#1e3a5f",
  },
  statusChipDisabled: {
    opacity: 0.5,
  },
  statusChipText: {
    fontSize: 12,
    color: "#444",
    fontWeight: "500",
  },
  statusChipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  saveButton: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: "#1e3a5f",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 140,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
