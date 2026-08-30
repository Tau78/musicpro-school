import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  createCourse,
  createTrial,
  getRomeDayOfWeek,
  minutesToTimeLabel,
  romeLocalInputToUtcIso,
  todayInRome,
  type CourseDurationMinutes,
  type IsoWeekday,
  type MemberSummary,
} from "@musicpro/database";
import type { MemberRoleValue } from "@musicpro/shared";

import {
  isLessonStaff,
  loadCreateLessonData,
  type CreateLessonFormData,
  type CreateLessonTerm,
} from "@/components/lezioni/load-create-lesson-data";
import { createClient } from "@/lib/supabase";

export type CreateLessonType = "singola" | "corso" | "collettivo";

export type CreateLessonCreatedResult = {
  type: CreateLessonType;
  id: string;
  warnings?: string[];
};

export type CreateLessonSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Chiamato dopo create ok (sheet già chiuso se senza warnings bloccanti). */
  onCreated?: (result: CreateLessonCreatedResult) => void;
  actorMemberId: string;
  roles: MemberRoleValue[] | string[];
  /** Prefill da slot calendario (YYYY-MM-DD). */
  initialDate?: string;
  /** Prefill orario (HH:mm). */
  initialOra?: string;
};

const NAVY = "#1e3a5f";
const COURSE_DURATIONS: CourseDurationMinutes[] = [30, 45, 60, 90];
const TRIAL_DURATIONS = [30, 45, 60] as const;
type TrialDuration = (typeof TRIAL_DURATIONS)[number];

const WEEKDAY_LABELS: Record<IsoWeekday, string> = {
  1: "Lunedì",
  2: "Martedì",
  3: "Mercoledì",
  4: "Giovedì",
  5: "Venerdì",
  6: "Sabato",
  7: "Domenica",
};

const TYPE_OPTIONS: {
  value: CreateLessonType;
  title: string;
  subtitle: string;
}[] = [
  {
    value: "singola",
    title: "Lezione singola",
    subtitle: "Prova gratuita one-shot",
  },
  {
    value: "corso",
    title: "Corso",
    subtitle: "Individuale o online, ripetuto",
  },
  {
    value: "collettivo",
    title: "Corso collettivo",
    subtitle: "Gruppo con capienza",
  },
];

function todayRome(): string {
  return todayInRome();
}

function defaultStartsOn(term: CreateLessonTerm): string {
  const today = todayRome();
  if (today < term.startsOn) return term.startsOn;
  if (today > term.endsOn) return term.endsOn;
  return today;
}

function parseOraToMinutes(ora: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(ora.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
}

function isoDateToWeekday(date: string): IsoWeekday {
  try {
    const utc = romeLocalInputToUtcIso(`${date}T12:00`);
    const jsDow = getRomeDayOfWeek(utc);
    return (jsDow === 0 ? 7 : jsDow) as IsoWeekday;
  } catch {
    return 1;
  }
}

function buildStartMinutes(
  open: number,
  close: number,
  step: number,
): number[] {
  const minutes: number[] = [];
  const safeStep = step > 0 ? step : 15;
  for (let m = open; m < close; m += safeStep) {
    minutes.push(m);
  }
  return minutes;
}

function memberLabel(member: MemberSummary): string {
  const name = `${member.lastName} ${member.firstName}`.trim();
  return member.memberNumber != null ? `${name} (#${member.memberNumber})` : name;
}

function ageFromBirthDate(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const birth = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  return Math.floor((Date.now() - birth.getTime()) / 31_557_600_000);
}

function snapMinute(value: number, options: number[], fallback: number): number {
  if (options.includes(value)) return value;
  if (options.length === 0) return fallback;
  let best = options[0];
  let bestDist = Math.abs(best - value);
  for (const option of options) {
    const dist = Math.abs(option - value);
    if (dist < bestDist) {
      best = option;
      bestDist = dist;
    }
  }
  return best;
}

export function CreateLessonSheet({
  visible,
  onClose,
  onCreated,
  actorMemberId,
  roles,
  initialDate,
  initialOra,
}: CreateLessonSheetProps) {
  const insets = useSafeAreaInsets();
  const supabase = useMemo(() => createClient(), []);
  const staffHint = isLessonStaff(roles);

  const [step, setStep] = useState<"tipo" | "form">("tipo");
  const [lessonType, setLessonType] = useState<CreateLessonType | null>(null);
  const [data, setData] = useState<CreateLessonFormData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Course fields
  const [online, setOnline] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [durationMinutes, setDurationMinutes] =
    useState<CourseDurationMinutes>(60);
  const [trialDuration, setTrialDuration] = useState<TrialDuration>(30);
  const [weeklyDow, setWeeklyDow] = useState<IsoWeekday>(1);
  const [weeklyStartMinute, setWeeklyStartMinute] = useState(600);
  const [startsOn, setStartsOn] = useState("");
  const [maxStudents, setMaxStudents] = useState(8);
  const [priceEur, setPriceEur] = useState("");
  const [openingPrepaid, setOpeningPrepaid] = useState("");
  const [titularMemberId, setTitularMemberId] = useState(actorMemberId);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState("");

  // Trial fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [tutorFirstName, setTutorFirstName] = useState("");
  const [tutorLastName, setTutorLastName] = useState("");
  const [tutorEmail, setTutorEmail] = useState("");
  const [tutorPhone, setTutorPhone] = useState("");
  const [trialDate, setTrialDate] = useState("");
  const [trialOra, setTrialOra] = useState("");

  const startMinutes = useMemo(() => {
    if (!data) return [];
    return buildStartMinutes(
      data.gridOpenMinute,
      data.gridCloseMinute,
      data.slotGranularityMinutes,
    );
  }, [data]);

  const weekdays = useMemo(() => {
    const all = (data?.sundayVisible
      ? [1, 2, 3, 4, 5, 6, 7]
      : [1, 2, 3, 4, 5, 6]) as IsoWeekday[];
    return all;
  }, [data?.sundayVisible]);

  const age = ageFromBirthDate(birthDate);
  const isMinor = age != null && age < 18;

  const resetForm = useCallback(() => {
    setStep("tipo");
    setLessonType(null);
    setError(null);
    setSuccess(null);
    setWarnings([]);
    setSaving(false);
    setOnline(false);
    setStudentIds([]);
    setStudentQuery("");
    setPriceEur("");
    setOpeningPrepaid("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setBirthDate("");
    setTutorFirstName("");
    setTutorLastName("");
    setTutorEmail("");
    setTutorPhone("");
  }, []);

  const applyPrefill = useCallback(
    (formData: CreateLessonFormData) => {
      const term = formData.currentTerm;
      const datePrefill =
        initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
          ? initialDate
          : term
            ? defaultStartsOn(term)
            : todayRome();

      const oraMinutes = initialOra ? parseOraToMinutes(initialOra) : null;
      const minutes = buildStartMinutes(
        formData.gridOpenMinute,
        formData.gridCloseMinute,
        formData.slotGranularityMinutes,
      );
      const startMin = snapMinute(
        oraMinutes ?? minutes[0] ?? formData.gridOpenMinute,
        minutes,
        formData.gridOpenMinute,
      );

      setSubjectId(formData.subjects[0]?.id ?? "");
      setRoomId(formData.rooms[0]?.id ?? "");
      setDurationMinutes(60);
      setTrialDuration(30);
      setWeeklyDow(isoDateToWeekday(datePrefill));
      setWeeklyStartMinute(startMin);
      setStartsOn(
        term
          ? datePrefill < term.startsOn
            ? term.startsOn
            : datePrefill > term.endsOn
              ? term.endsOn
              : datePrefill
          : datePrefill,
      );
      setMaxStudents(formData.defaultGroupCapacity);
      setTitularMemberId(
        formData.isStaff && formData.teachers.length > 0
          ? formData.teachers[0].id
          : actorMemberId,
      );
      setTrialDate(datePrefill);
      setTrialOra(
        initialOra && parseOraToMinutes(initialOra) != null
          ? initialOra.trim()
          : minutesToTimeLabel(startMin),
      );
    },
    [actorMemberId, initialDate, initialOra],
  );

  useEffect(() => {
    if (!visible) {
      resetForm();
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setData(null);

    void loadCreateLessonData(supabase, { actorMemberId, roles })
      .then((next) => {
        if (cancelled) return;
        setData(next);
        applyPrefill(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : "Impossibile caricare i dati per creare la lezione.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, supabase, actorMemberId, roles, applyPrefill, resetForm]);

  function selectType(type: CreateLessonType) {
    setLessonType(type);
    setOnline(false);
    setStudentIds([]);
    setError(null);
    setWarnings([]);
    setSuccess(null);
    setStep("form");
  }

  function addStudent(id: string) {
    const max = lessonType === "collettivo" ? maxStudents : 1;
    setStudentIds((prev) => {
      if (prev.includes(id)) return prev;
      if (lessonType === "collettivo") {
        if (prev.length >= max) return prev;
        return [...prev, id];
      }
      return [id];
    });
    setStudentQuery("");
  }

  function removeStudent(id: string) {
    setStudentIds((prev) => prev.filter((row) => row !== id));
  }

  const studentMatches = useMemo(() => {
    if (!data) return [];
    const term = studentQuery.trim().toLowerCase();
    const selected = new Set(studentIds);
    return data.members
      .filter((row) => row.isActive && !selected.has(row.id))
      .filter((row) => {
        if (!term) return true;
        const hay =
          `${row.lastName} ${row.firstName} ${row.email ?? ""} ${row.memberNumber ?? ""}`.toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 8);
  }, [data, studentIds, studentQuery]);

  async function handleSubmitCourse() {
    if (!data || !lessonType || lessonType === "singola") return;

    setSaving(true);
    setError(null);
    setWarnings([]);
    setSuccess(null);

    if (!subjectId) {
      setSaving(false);
      setError("Seleziona una materia.");
      return;
    }

    const courseKind =
      lessonType === "collettivo" ? "gruppo" : online ? "online" : "individuale";

    const titular =
      data.isStaff && data.teachers.length > 0
        ? titularMemberId
        : actorMemberId;

    if (!titular) {
      setSaving(false);
      setError("Seleziona il docente titolare.");
      return;
    }

    const parsedPrice = data.isStaff
      ? priceEur.trim() === ""
        ? 0
        : Number(priceEur)
      : undefined;

    let openingPrepaidLessons: number | undefined;
    if (data.isStaff) {
      const raw = openingPrepaid.trim();
      openingPrepaidLessons = raw === "" ? 0 : Number(raw);
      if (
        !Number.isInteger(openingPrepaidLessons) ||
        openingPrepaidLessons < 0
      ) {
        setSaving(false);
        setError("Le lezioni già pagate devono essere un intero ≥ 0.");
        return;
      }
    }

    if (studentIds.length < 1) {
      setSaving(false);
      setError(
        lessonType === "collettivo"
          ? "Seleziona almeno un allievo."
          : "Seleziona un allievo.",
      );
      return;
    }

    if (courseKind !== "online" && !roomId) {
      setSaving(false);
      setError("Seleziona una sala.");
      return;
    }

    const result = await createCourse(
      supabase,
      {
        courseKind,
        subjectId,
        titularMemberId: titular,
        studentMemberIds: studentIds,
        roomId: courseKind === "online" ? null : roomId || null,
        durationMinutes,
        weeklyDow,
        weeklyStartMinute,
        startsOn,
        maxStudents: courseKind === "gruppo" ? maxStudents : 1,
        priceEur: parsedPrice,
        openingPrepaidLessons,
      },
      {
        memberId: actorMemberId,
        isStaff: data.isStaff,
        canCreateCourses: data.canCreateCourses,
      },
    );

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile creare il corso.");
      return;
    }

    const created: CreateLessonCreatedResult = {
      type: lessonType,
      id: result.id ?? "",
      warnings: result.warnings,
    };

    if (result.warnings?.length) {
      setWarnings(result.warnings);
      setSuccess(
        data.isStaff
          ? "Corso creato (attivo), con avvisi."
          : "Corso creato (in attesa di conferma), con avvisi.",
      );
      onCreated?.(created);
      return;
    }

    setSuccess(
      data.isStaff ? "Corso creato e attivo." : "Corso creato: in attesa.",
    );
    onCreated?.(created);
    setTimeout(() => {
      onClose();
    }, 700);
  }

  async function handleSubmitTrial() {
    if (!data) return;

    setSaving(true);
    setError(null);
    setWarnings([]);
    setSuccess(null);

    if (!subjectId) {
      setSaving(false);
      setError("Seleziona una materia.");
      return;
    }

    if (isMinor) {
      if (
        !tutorFirstName.trim() ||
        !tutorLastName.trim() ||
        !tutorEmail.trim() ||
        !tutorPhone.trim()
      ) {
        setSaving(false);
        setError(
          "Per i minori servono nome, cognome, email e telefono del tutore.",
        );
        return;
      }
    }

    if (!online && !roomId) {
      setSaving(false);
      setError("Seleziona una sala per la prova in presenza.");
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setSaving(false);
      setError("Compila nome, cognome, email e telefono dell’allievo.");
      return;
    }

    if (!birthDate) {
      setSaving(false);
      setError("Inserisci la data di nascita.");
      return;
    }

    let startsAt: string;
    try {
      startsAt = romeLocalInputToUtcIso(`${trialDate}T${trialOra}`);
    } catch {
      setSaving(false);
      setError("Data e ora della prova non valide.");
      return;
    }

    const titular =
      data.isStaff && data.teachers.length > 0
        ? titularMemberId
        : actorMemberId;

    const result = await createTrial(
      supabase,
      {
        subjectId,
        titularMemberId: titular,
        startsAt,
        durationMinutes: trialDuration,
        roomId: online ? null : roomId || null,
        online,
        student: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          birthDate: birthDate || null,
          tutorFirstName: isMinor ? tutorFirstName.trim() : undefined,
          tutorLastName: isMinor ? tutorLastName.trim() : undefined,
          tutorEmail: isMinor ? tutorEmail.trim() : undefined,
          tutorPhone: isMinor ? tutorPhone.trim() : undefined,
        },
      },
      {
        memberId: actorMemberId,
        isStaff: data.isStaff,
        canCreateCourses: data.canCreateCourses,
      },
    );

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile creare la prova.");
      return;
    }

    const created: CreateLessonCreatedResult = {
      type: "singola",
      id: result.id ?? "",
      warnings: result.warnings,
    };

    if (result.warnings?.length) {
      setWarnings(result.warnings);
      setSuccess("Prova creata, con avvisi.");
      onCreated?.(created);
      return;
    }

    setSuccess("Prova creata.");
    onCreated?.(created);
    setTimeout(() => {
      onClose();
    }, 700);
  }

  const title =
    step === "tipo"
      ? "Aggiungi lezione"
      : lessonType === "singola"
        ? "Lezione singola"
        : lessonType === "collettivo"
          ? "Corso collettivo"
          : "Nuovo corso";

  const canCreate = data?.isStaff || data?.canCreateCourses;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            {step === "form" ? (
              <Pressable
                onPress={() => {
                  setStep("tipo");
                  setError(null);
                  setWarnings([]);
                  setSuccess(null);
                }}
                hitSlop={8}
              >
                <Text style={styles.backLink}>← Tipo</Text>
              </Pressable>
            ) : (
              <View style={styles.backSpacer} />
            )}
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeLink}>Chiudi</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={NAVY} />
              <Text style={styles.muted}>Caricamento…</Text>
            </View>
          ) : loadError ? (
            <View style={styles.pad}>
              <View style={styles.alertError}>
                <Text style={styles.alertErrorText}>{loadError}</Text>
              </View>
            </View>
          ) : data && !canCreate ? (
            <View style={styles.pad}>
              <View style={styles.alertWarn}>
                <Text style={styles.alertWarnText}>
                  Non puoi creare lezioni o corsi in autonomia. Chiedi alla
                  segreteria.
                </Text>
              </View>
            </View>
          ) : data && !data.currentTerm ? (
            <View style={styles.pad}>
              <View style={styles.alertWarn}>
                <Text style={styles.alertWarnText}>
                  Imposta prima l’anno corsi nelle impostazioni lezioni
                  {staffHint ? " (web admin)." : "."}
                </Text>
              </View>
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
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
              {warnings.length > 0 ? (
                <View style={styles.alertWarn}>
                  {warnings.map((warning) => (
                    <Text key={warning} style={styles.alertWarnText}>
                      • {warning}
                    </Text>
                  ))}
                </View>
              ) : null}

              {step === "tipo" ? (
                <View style={styles.typeList}>
                  {TYPE_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      style={styles.typeCard}
                      onPress={() => selectType(option.value)}
                    >
                      <Text style={styles.typeTitle}>{option.title}</Text>
                      <Text style={styles.typeSubtitle}>{option.subtitle}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : lessonType === "singola" ? (
                <TrialFields
                  data={data!}
                  online={online}
                  setOnline={setOnline}
                  subjectId={subjectId}
                  setSubjectId={setSubjectId}
                  roomId={roomId}
                  setRoomId={setRoomId}
                  trialDuration={trialDuration}
                  setTrialDuration={setTrialDuration}
                  trialDate={trialDate}
                  setTrialDate={setTrialDate}
                  trialOra={trialOra}
                  setTrialOra={setTrialOra}
                  titularMemberId={titularMemberId}
                  setTitularMemberId={setTitularMemberId}
                  firstName={firstName}
                  setFirstName={setFirstName}
                  lastName={lastName}
                  setLastName={setLastName}
                  email={email}
                  setEmail={setEmail}
                  phone={phone}
                  setPhone={setPhone}
                  birthDate={birthDate}
                  setBirthDate={setBirthDate}
                  isMinor={isMinor}
                  tutorFirstName={tutorFirstName}
                  setTutorFirstName={setTutorFirstName}
                  tutorLastName={tutorLastName}
                  setTutorLastName={setTutorLastName}
                  tutorEmail={tutorEmail}
                  setTutorEmail={setTutorEmail}
                  tutorPhone={tutorPhone}
                  setTutorPhone={setTutorPhone}
                />
              ) : (
                <CourseFields
                  data={data!}
                  lessonType={lessonType!}
                  online={online}
                  setOnline={setOnline}
                  subjectId={subjectId}
                  setSubjectId={setSubjectId}
                  roomId={roomId}
                  setRoomId={setRoomId}
                  durationMinutes={durationMinutes}
                  setDurationMinutes={setDurationMinutes}
                  weeklyDow={weeklyDow}
                  setWeeklyDow={setWeeklyDow}
                  weeklyStartMinute={weeklyStartMinute}
                  setWeeklyStartMinute={setWeeklyStartMinute}
                  startsOn={startsOn}
                  setStartsOn={setStartsOn}
                  maxStudents={maxStudents}
                  setMaxStudents={(next) => {
                    setMaxStudents(next);
                    setStudentIds((prev) => prev.slice(0, next));
                  }}
                  priceEur={priceEur}
                  setPriceEur={setPriceEur}
                  openingPrepaid={openingPrepaid}
                  setOpeningPrepaid={setOpeningPrepaid}
                  titularMemberId={titularMemberId}
                  setTitularMemberId={setTitularMemberId}
                  weekdays={weekdays}
                  startMinutes={startMinutes}
                  studentIds={studentIds}
                  studentQuery={studentQuery}
                  setStudentQuery={setStudentQuery}
                  studentMatches={studentMatches}
                  addStudent={addStudent}
                  removeStudent={removeStudent}
                />
              )}

              {step === "form" ? (
                <Pressable
                  disabled={saving}
                  onPress={() =>
                    void (lessonType === "singola"
                      ? handleSubmitTrial()
                      : handleSubmitCourse())
                  }
                  style={[styles.submitButton, saving && styles.buttonDisabled]}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {lessonType === "singola" ? "Crea prova" : "Crea corso"}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TrialFields({
  data,
  online,
  setOnline,
  subjectId,
  setSubjectId,
  roomId,
  setRoomId,
  trialDuration,
  setTrialDuration,
  trialDate,
  setTrialDate,
  trialOra,
  setTrialOra,
  titularMemberId,
  setTitularMemberId,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  email,
  setEmail,
  phone,
  setPhone,
  birthDate,
  setBirthDate,
  isMinor,
  tutorFirstName,
  setTutorFirstName,
  tutorLastName,
  setTutorLastName,
  tutorEmail,
  setTutorEmail,
  tutorPhone,
  setTutorPhone,
}: {
  data: CreateLessonFormData;
  online: boolean;
  setOnline: (v: boolean) => void;
  subjectId: string;
  setSubjectId: (v: string) => void;
  roomId: string;
  setRoomId: (v: string) => void;
  trialDuration: TrialDuration;
  setTrialDuration: (v: TrialDuration) => void;
  trialDate: string;
  setTrialDate: (v: string) => void;
  trialOra: string;
  setTrialOra: (v: string) => void;
  titularMemberId: string;
  setTitularMemberId: (v: string) => void;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  birthDate: string;
  setBirthDate: (v: string) => void;
  isMinor: boolean;
  tutorFirstName: string;
  setTutorFirstName: (v: string) => void;
  tutorLastName: string;
  setTutorLastName: (v: string) => void;
  tutorEmail: string;
  setTutorEmail: (v: string) => void;
  tutorPhone: string;
  setTutorPhone: (v: string) => void;
}) {
  return (
    <View style={styles.formBlock}>
      <Text style={styles.sectionTitle}>Allievo</Text>
      {data.currentTerm ? (
        <Text style={styles.mutedSmall}>
          Prova gratuita · anno corsi {data.currentTerm.label}
        </Text>
      ) : null}

      <Field label="Nome *">
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />
      </Field>
      <Field label="Cognome *">
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />
      </Field>
      <Field label="Email *">
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </Field>
      <Field label="Telefono *">
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
      </Field>
      <Field label="Data di nascita * (AAAA-MM-GG)">
        <TextInput
          style={styles.input}
          value={birthDate}
          onChangeText={setBirthDate}
          placeholder="2008-05-14"
          placeholderTextColor="#999"
          autoCapitalize="none"
        />
      </Field>

      {isMinor ? (
        <>
          <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Tutore</Text>
          <Text style={styles.mutedSmall}>
            L’allievo ha meno di 18 anni: i dati del tutore sono obbligatori.
          </Text>
          <Field label="Nome tutore *">
            <TextInput
              style={styles.input}
              value={tutorFirstName}
              onChangeText={setTutorFirstName}
            />
          </Field>
          <Field label="Cognome tutore *">
            <TextInput
              style={styles.input}
              value={tutorLastName}
              onChangeText={setTutorLastName}
            />
          </Field>
          <Field label="Email tutore *">
            <TextInput
              style={styles.input}
              value={tutorEmail}
              onChangeText={setTutorEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </Field>
          <Field label="Telefono tutore *">
            <TextInput
              style={styles.input}
              value={tutorPhone}
              onChangeText={setTutorPhone}
              keyboardType="phone-pad"
            />
          </Field>
        </>
      ) : null}

      <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Slot</Text>
      <Field label="Materia *">
        <ChipRow
          options={data.subjects.map((row) => ({
            value: row.id,
            label: row.name,
          }))}
          value={subjectId}
          onChange={setSubjectId}
        />
      </Field>
      <Field label="Durata *">
        <ChipRow
          options={TRIAL_DURATIONS.map((minutes) => ({
            value: String(minutes),
            label: `${minutes} min`,
          }))}
          value={String(trialDuration)}
          onChange={(v) => setTrialDuration(Number(v) as TrialDuration)}
        />
      </Field>
      <Field label="Data * (AAAA-MM-GG)">
        <TextInput
          style={styles.input}
          value={trialDate}
          onChangeText={setTrialDate}
          placeholder="2026-09-15"
          placeholderTextColor="#999"
          autoCapitalize="none"
        />
      </Field>
      <Field label="Ora * (HH:mm)">
        <TextInput
          style={styles.input}
          value={trialOra}
          onChangeText={setTrialOra}
          placeholder="16:30"
          placeholderTextColor="#999"
          autoCapitalize="none"
        />
      </Field>
      {data.isStaff && data.teachers.length > 0 ? (
        <Field label="Docente *">
          <ChipRow
            options={data.teachers.map((row) => ({
              value: row.id,
              label: row.label,
            }))}
            value={titularMemberId}
            onChange={setTitularMemberId}
          />
        </Field>
      ) : null}
      <Pressable
        style={styles.checkRow}
        onPress={() => setOnline(!online)}
      >
        <View style={[styles.checkbox, online && styles.checkboxOn]} />
        <Text style={styles.checkLabel}>Online (niente sala)</Text>
      </Pressable>
      {!online ? (
        <Field label="Sala *">
          <ChipRow
            options={data.rooms.map((row) => ({
              value: row.id,
              label: row.name,
            }))}
            value={roomId}
            onChange={setRoomId}
          />
        </Field>
      ) : null}
    </View>
  );
}

function CourseFields({
  data,
  lessonType,
  online,
  setOnline,
  subjectId,
  setSubjectId,
  roomId,
  setRoomId,
  durationMinutes,
  setDurationMinutes,
  weeklyDow,
  setWeeklyDow,
  weeklyStartMinute,
  setWeeklyStartMinute,
  startsOn,
  setStartsOn,
  maxStudents,
  setMaxStudents,
  priceEur,
  setPriceEur,
  openingPrepaid,
  setOpeningPrepaid,
  titularMemberId,
  setTitularMemberId,
  weekdays,
  startMinutes,
  studentIds,
  studentQuery,
  setStudentQuery,
  studentMatches,
  addStudent,
  removeStudent,
}: {
  data: CreateLessonFormData;
  lessonType: CreateLessonType;
  online: boolean;
  setOnline: (v: boolean) => void;
  subjectId: string;
  setSubjectId: (v: string) => void;
  roomId: string;
  setRoomId: (v: string) => void;
  durationMinutes: CourseDurationMinutes;
  setDurationMinutes: (v: CourseDurationMinutes) => void;
  weeklyDow: IsoWeekday;
  setWeeklyDow: (v: IsoWeekday) => void;
  weeklyStartMinute: number;
  setWeeklyStartMinute: (v: number) => void;
  startsOn: string;
  setStartsOn: (v: string) => void;
  maxStudents: number;
  setMaxStudents: (v: number) => void;
  priceEur: string;
  setPriceEur: (v: string) => void;
  openingPrepaid: string;
  setOpeningPrepaid: (v: string) => void;
  titularMemberId: string;
  setTitularMemberId: (v: string) => void;
  weekdays: IsoWeekday[];
  startMinutes: number[];
  studentIds: string[];
  studentQuery: string;
  setStudentQuery: (v: string) => void;
  studentMatches: MemberSummary[];
  addStudent: (id: string) => void;
  removeStudent: (id: string) => void;
}) {
  const membersById = useMemo(
    () => new Map(data.members.map((row) => [row.id, row])),
    [data.members],
  );
  const selectedStudents = studentIds
    .map((id) => membersById.get(id))
    .filter((row): row is MemberSummary => Boolean(row));

  return (
    <View style={styles.formBlock}>
      <Text style={styles.sectionTitle}>Corso</Text>
      {data.currentTerm ? (
        <Text style={styles.mutedSmall}>
          Anno corsi: {data.currentTerm.label}
          {data.isStaff ? " · attivo subito" : " · in attesa di conferma"}
        </Text>
      ) : null}

      <Field label="Materia *">
        <ChipRow
          options={data.subjects.map((row) => ({
            value: row.id,
            label: row.name,
          }))}
          value={subjectId}
          onChange={setSubjectId}
        />
      </Field>

      {data.isStaff && data.teachers.length > 0 ? (
        <Field label="Titolare *">
          <ChipRow
            options={data.teachers.map((row) => ({
              value: row.id,
              label: row.label,
            }))}
            value={titularMemberId}
            onChange={setTitularMemberId}
          />
        </Field>
      ) : null}

      {lessonType === "corso" ? (
        <Pressable
          style={styles.checkRow}
          onPress={() => setOnline(!online)}
        >
          <View style={[styles.checkbox, online && styles.checkboxOn]} />
          <Text style={styles.checkLabel}>Online (niente sala)</Text>
        </Pressable>
      ) : null}

      {!online ? (
        <Field label="Sala *">
          <ChipRow
            options={data.rooms.map((row) => ({
              value: row.id,
              label: row.name,
            }))}
            value={roomId}
            onChange={setRoomId}
          />
        </Field>
      ) : null}

      <Field label="Durata *">
        <ChipRow
          options={COURSE_DURATIONS.map((minutes) => ({
            value: String(minutes),
            label: `${minutes} min`,
          }))}
          value={String(durationMinutes)}
          onChange={(v) =>
            setDurationMinutes(Number(v) as CourseDurationMinutes)
          }
        />
      </Field>

      <Field label="Giorno *">
        <ChipRow
          options={weekdays.map((day) => ({
            value: String(day),
            label: WEEKDAY_LABELS[day],
          }))}
          value={String(weeklyDow)}
          onChange={(v) => setWeeklyDow(Number(v) as IsoWeekday)}
        />
      </Field>

      <Field label="Orario *">
        <ChipRow
          options={startMinutes.map((minute) => ({
            value: String(minute),
            label: minutesToTimeLabel(minute),
          }))}
          value={String(weeklyStartMinute)}
          onChange={(v) => setWeeklyStartMinute(Number(v))}
        />
      </Field>

      <Field label="Data inizio * (AAAA-MM-GG)">
        <TextInput
          style={styles.input}
          value={startsOn}
          onChangeText={setStartsOn}
          placeholder={data.currentTerm?.startsOn ?? "2026-09-01"}
          placeholderTextColor="#999"
          autoCapitalize="none"
        />
      </Field>

      {lessonType === "collettivo" ? (
        <Field label="Capienza massima">
          <TextInput
            style={styles.input}
            value={String(maxStudents)}
            onChangeText={(text) => {
              const next = Number(text) || 1;
              setMaxStudents(Math.max(1, next));
            }}
            keyboardType="number-pad"
          />
        </Field>
      ) : null}

      {data.isStaff ? (
        <>
          <Field label="Prezzo (€)">
            <TextInput
              style={styles.input}
              value={priceEur}
              onChangeText={setPriceEur}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#999"
            />
          </Field>
          <Field label="Lezioni già pagate">
            <TextInput
              style={styles.input}
              value={openingPrepaid}
              onChangeText={setOpeningPrepaid}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#999"
            />
          </Field>
        </>
      ) : null}

      <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Allievi</Text>
      <Text style={styles.mutedSmall}>
        {lessonType === "collettivo"
          ? `Seleziona da 1 a ${maxStudents} allievi.`
          : "Seleziona un allievo."}
      </Text>

      {selectedStudents.length > 0 ? (
        <View style={styles.selectedWrap}>
          {selectedStudents.map((student) => (
            <Pressable
              key={student.id}
              style={styles.selectedChip}
              onPress={() => removeStudent(student.id)}
            >
              <Text style={styles.selectedChipText}>
                {memberLabel(student)} ×
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <TextInput
        style={styles.input}
        value={studentQuery}
        onChangeText={setStudentQuery}
        placeholder="Cerca allievo…"
        placeholderTextColor="#999"
        autoCapitalize="none"
      />
      <View style={styles.matchList}>
        {studentMatches.map((row) => (
          <Pressable
            key={row.id}
            style={styles.matchRow}
            onPress={() => addStudent(row.id)}
          >
            <Text style={styles.matchText}>{memberLabel(row)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d4d4d4",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    color: NAVY,
  },
  backLink: {
    fontSize: 14,
    color: NAVY,
    fontWeight: "500",
    minWidth: 56,
  },
  backSpacer: {
    minWidth: 56,
  },
  closeLink: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
    textAlign: "right",
    minWidth: 56,
  },
  centered: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 10,
  },
  pad: {
    padding: 16,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  muted: {
    fontSize: 13,
    color: "#888",
  },
  mutedSmall: {
    marginBottom: 10,
    fontSize: 12,
    color: "#888",
  },
  typeList: {
    gap: 10,
  },
  typeCard: {
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 12,
    padding: 16,
    backgroundColor: "#fafafa",
  },
  typeTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: NAVY,
  },
  typeSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#666",
  },
  formBlock: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: NAVY,
    marginBottom: 4,
  },
  sectionSpaced: {
    marginTop: 16,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "500",
    color: "#444",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 11 : 8,
    fontSize: 15,
    color: "#222",
    backgroundColor: "#fff",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    backgroundColor: "#fff",
  },
  chipActive: {
    borderColor: NAVY,
    backgroundColor: NAVY,
  },
  chipText: {
    fontSize: 12,
    color: "#444",
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#a3a3a3",
    backgroundColor: "#fff",
  },
  checkboxOn: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },
  checkLabel: {
    fontSize: 14,
    color: "#333",
  },
  selectedWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  selectedChip: {
    backgroundColor: "#e8eef6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectedChipText: {
    fontSize: 13,
    color: NAVY,
    fontWeight: "500",
  },
  matchList: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    overflow: "hidden",
  },
  matchRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  matchText: {
    fontSize: 14,
    color: "#222",
  },
  submitButton: {
    marginTop: 16,
    backgroundColor: NAVY,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  alertError: {
    marginBottom: 12,
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
    marginBottom: 12,
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
    marginBottom: 12,
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
});
