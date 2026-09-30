"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type BookingStatus,
  type CreateBookingResult,
  type MyBandSummary,
  type Room,
  type TimeSlot,
  bookingStatusLabel,
  calculateBookingPrice,
  proviDaSoloDiscountTotalEur,
  BOOKING_MICROPHONE_COUNTS,
  createBooking,
  creditsForBookingPrice,
  durationOptionsForRoom,
  formatDateItalian,
  formatDurationLabel,
  formatEuro,
  getBookingSettings,
  getCurrentMemberWithRoles,
  getMemberCreditBalance,
  getRoomAvailability,
  isSlotInProviSchedule,
  listMyBands,
  listProviSchedule,
  listRooms,
  peekRoomAvailabilityCache,
  requestBookingCreditsPayment,
  requestRoomBookingPaymentUrl,
  subscribeToBookings,
  invalidateRoomAvailabilityCache,
  todayInRome,
  type MemberCreditBalance,
  type ProviScheduleEntry,
} from "@musicpro/database";
import { mapUserFacingError } from "@musicpro/shared";
import { AuthSignInPanel } from "@/components/auth/auth-sign-in-panel";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { MemberQuotaAlert } from "@/components/associate/member-quota-alert";
import { SiteHeader } from "@/components/layout/site-header";
import { BandSelectStep } from "@/components/prenotazioni/band-select-step";
import {
  SessionTypeStep,
  type SessionType,
} from "@/components/prenotazioni/session-type-step";
import { RoomPickerGrid } from "@/components/prenotazioni/room-picker-grid";
import { PrenotazioniWelcomeHero } from "@/components/prenotazioni/welcome-hero";
import {
  getMembershipStatus,
  isAssociatoMember,
  type MembershipStatus,
} from "@/lib/membership";
import { createClient } from "@/lib/supabase/client";
import { requestBookingConfirmationEmail } from "@/lib/booking/send-confirmation-email";
import { requestBookingCalendarSync } from "@/lib/calendar/sync-booking";

type WizardStepKey =
  | "start"
  | "session"
  | "band"
  | "room"
  | "duration"
  | "date"
  | "time"
  | "slot"
  | "confirm";

type BookingStartMode = "room" | "date" | "time";

type AlternativeRoomOption = {
  room: Room;
  slot: TimeSlot;
};

function slotStartMinutes(label: string): number {
  const match = label.match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

export default function PrenotazioniPage() {
  const supabase = useMemo(() => createClient(), []);
  const loadRequestId = useRef(0);

  const [stepIndex, setStepIndex] = useState(0);
  const [startMode, setStartMode] = useState<BookingStartMode>("room");
  const [preferredTime, setPreferredTime] = useState("18:00");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [myBands, setMyBands] = useState<MyBandSummary[]>([]);
  const [sessionType, setSessionType] = useState<SessionType>("band");
  const [selectedBandId, setSelectedBandId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(120);
  const [selectedDate, setSelectedDate] = useState(todayInRome());
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [alternativeRoomsByStartAt, setAlternativeRoomsByStartAt] = useState<
    Record<string, AlternativeRoomOption[]>
  >({});
  const [memberId, setMemberId] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [payingWithCredits, setPayingWithCredits] = useState(false);
  const [creditBalance, setCreditBalance] = useState<MemberCreditBalance | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proviSchedule, setProviSchedule] = useState<ProviScheduleEntry[]>([]);
  const [proviDaSolo, setProviDaSolo] = useState(false);
  const [microphoneCount, setMicrophoneCount] = useState(0);
  const [bookingNotes, setBookingNotes] = useState("");
  const [bandRequired, setBandRequired] = useState(false);
  const [bookingLocked, setBookingLocked] = useState(false);
  const [bookingLockedMessage, setBookingLockedMessage] = useState("");
  const [quotaStatus, setQuotaStatus] = useState<MembershipStatus | null>(
    null,
  );

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const durationOptions = useMemo(
    () => (selectedRoom ? durationOptionsForRoom(selectedRoom) : []),
    [selectedRoom],
  );

  const bookableBands = useMemo(
    () => myBands.filter((band) => band.myStatus === "active" && band.allQuotaOk),
    [myBands],
  );

  const showBandFlow = bandRequired;

  const previewPrice = useMemo(() => {
    if (!selectedRoom) return null;
    const base =
      selectedSlot?.priceEur ??
      calculateBookingPrice(selectedRoom, durationMinutes);
    if (
      (proviDaSolo || (showBandFlow && sessionType === "provi_da_solo")) &&
      selectedRoom.provi_da_solo_enabled &&
      selectedRoom.provi_da_solo_discount_eur > 0
    ) {
      const discount = proviDaSoloDiscountTotalEur(
        selectedRoom.provi_da_solo_discount_eur,
        durationMinutes,
      );
      return Math.max(0, Math.round((base - discount) * 100) / 100);
    }
    return base;
  }, [durationMinutes, proviDaSolo, selectedRoom, selectedSlot, sessionType, showBandFlow]);

  const slotAllowsProviDaSolo = useMemo(() => {
    if (!selectedRoom?.provi_da_solo_enabled || !selectedSlot) return false;
    return isSlotInProviSchedule(
      selectedSlot.startAt,
      selectedSlot.endAt,
      proviSchedule,
    );
  }, [proviSchedule, selectedRoom, selectedSlot]);

  const creditCost = useMemo(
    () => creditsForBookingPrice(previewPrice ?? 0),
    [previewPrice],
  );

  const canPayWithCredits =
    creditBalance != null && creditBalance.available >= creditCost;

  const wizardSteps = useMemo(() => {
    const steps: { key: WizardStepKey; label: string }[] = [
      { key: "start", label: "Partenza" },
    ];
    if (showBandFlow) {
      steps.push({ key: "session", label: "Tipo sessione" });
      if (sessionType === "band") {
        steps.push({ key: "band", label: "Band" });
      }
    }
    if (startMode === "room") {
      steps.push(
        { key: "room", label: "Sala" },
        { key: "duration", label: "Durata" },
        { key: "date", label: "Giorno" },
      );
    } else if (startMode === "date") {
      steps.push(
        { key: "date", label: "Giorno" },
        { key: "room", label: "Sala" },
        { key: "duration", label: "Durata" },
      );
    } else {
      steps.push(
        { key: "time", label: "Orario" },
        { key: "date", label: "Giorno" },
        { key: "room", label: "Sala" },
        { key: "duration", label: "Durata" },
      );
    }
    steps.push({ key: "slot", label: "Soluzioni" });
    steps.push({ key: "confirm", label: "Conferma" });
    return steps;
  }, [showBandFlow, sessionType, startMode]);

  const currentStepKey = wizardSteps[stepIndex]?.key ?? "room";

  useEffect(() => {
    if (stepIndex >= wizardSteps.length) {
      setStepIndex(Math.max(0, wizardSteps.length - 1));
    }
  }, [stepIndex, wizardSteps.length]);

  // Back da Stripe (bfcache / history): sblocca i CTA lasciati su «Reindirizzamento…».
  useEffect(() => {
    function unlockPaymentButtons() {
      setSubmitting(false);
      setPayingWithCredits(false);
    }
    window.addEventListener("pageshow", unlockPaymentButtons);
    return () => {
      window.removeEventListener("pageshow", unlockPaymentButtons);
    };
  }, []);

  const selectedBand = useMemo(
    () => bookableBands.find((band) => band.id === selectedBandId) ?? null,
    [bookableBands, selectedBandId],
  );

  const visibleSlots = useMemo(
    () =>
      slots.filter(
        (slot) =>
          slot.available ||
          (alternativeRoomsByStartAt[slot.startAt]?.length ?? 0) > 0,
      ),
    [alternativeRoomsByStartAt, slots],
  );

  const solutionSlots = useMemo(() => {
    if (startMode !== "time") return visibleSlots;
    const [hours, minutes] = preferredTime.split(":").map(Number);
    const target = hours * 60 + minutes;
    return [...visibleSlots].sort(
      (a, b) =>
        Math.abs(slotStartMinutes(a.label) - target) -
        Math.abs(slotStartMinutes(b.label) - target),
    );
  }, [preferredTime, startMode, visibleSlots]);

  const loadAvailability = useCallback(async () => {
    if (
      !selectedRoomId ||
      currentStepKey === "start" ||
      currentStepKey === "session" ||
      currentStepKey === "band" ||
      currentStepKey === "room" ||
      currentStepKey === "duration" ||
      currentStepKey === "date" ||
      currentStepKey === "time"
    ) {
      return;
    }

    const requestId = ++loadRequestId.current;
    setAlternativeRoomsByStartAt({});
    const cached = peekRoomAvailabilityCache(
      selectedRoomId,
      selectedDate,
      durationMinutes,
    );
    if (cached) {
      setSlots(cached.slots);
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

      const alternativeRooms = rooms.filter(
        (room) =>
          room.id !== selectedRoomId &&
          durationOptionsForRoom(room).includes(durationMinutes),
      );
      const alternativeAvailability = await Promise.all(
        alternativeRooms.map(async (room) => {
          try {
            const result = await getRoomAvailability(
              supabase,
              room.id,
              selectedDate,
              durationMinutes,
              { prefetchNeighbors: false },
            );
            return { room, slots: result.slots };
          } catch {
            return null;
          }
        }),
      );
      if (requestId !== loadRequestId.current) return;

      const suggestions: Record<string, AlternativeRoomOption[]> = {};
      for (const slot of availability.slots) {
        if (
          slot.available ||
          !slot.bookingId ||
          slot.leadTimeCategory === "too_late"
        ) {
          continue;
        }
        for (const candidate of alternativeAvailability) {
          const alternativeSlot = candidate?.slots.find(
            (item) =>
              item.available &&
              item.startAt === slot.startAt &&
              item.endAt === slot.endAt,
          );
          if (!candidate || !alternativeSlot) continue;
          (suggestions[slot.startAt] ??= []).push({
            room: candidate.room,
            slot: alternativeSlot,
          });
        }
      }
      setAlternativeRoomsByStartAt(suggestions);
    } catch (err) {
      if (requestId !== loadRequestId.current) return;
      if (cached) return;
      setError(
        mapUserFacingError(
          err instanceof Error ? err.message : "",
          "Errore nel caricamento degli slot.",
        ),
      );
    }
  }, [
    currentStepKey,
    durationMinutes,
    rooms,
    selectedDate,
    selectedRoomId,
    supabase,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const member = user
          ? await getCurrentMemberWithRoles(supabase)
          : null;
        const includeSandbox =
          (member?.email ?? "").trim().toLowerCase() ===
          "mauro.andreoni@gmail.com";
        const showQuotaUi = member ? isAssociatoMember(member.roles) : false;

        const [roomList, bands, bookingSettings, membershipStatus] =
          await Promise.all([
          user
            ? listRooms(supabase, { includeSandbox })
            : Promise.resolve([] as Room[]),
          user ? listMyBands(supabase).catch(() => [] as MyBandSummary[]) : Promise.resolve([] as MyBandSummary[]),
          user
            ? getBookingSettings(supabase)
            : Promise.resolve({
                bandRequired: false,
                locked: false,
                lockedMessage: "",
              } as Awaited<ReturnType<typeof getBookingSettings>>),
          showQuotaUi && member
            ? getMembershipStatus(supabase, member.id)
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        setHasSession(Boolean(user));
        setRooms(roomList);
        setMyBands(bands);
        setBandRequired(bookingSettings.bandRequired);
        setBookingLocked(bookingSettings.locked);
        setBookingLockedMessage(bookingSettings.lockedMessage);
        if (roomList.length > 0) {
          setSelectedRoomId(roomList[0].id);
          setDurationMinutes(roomList[0].default_duration_minutes);
        }
        const bookable = bands.filter(
          (band) => band.myStatus === "active" && band.allQuotaOk,
        );
        if (bookable.length > 0) {
          setSelectedBandId(bookable[0].id);
        }
        setMemberId(member?.id ?? null);
        setQuotaStatus(membershipStatus);
      } catch (err) {
        if (!cancelled) {
          setError(
            mapUserFacingError(
              err instanceof Error ? err.message : "",
              "Impossibile caricare le sale prova.",
            ),
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
    if (!selectedRoomId) {
      setProviSchedule([]);
      return;
    }

    let cancelled = false;

    void listProviSchedule(supabase, selectedRoomId)
      .then((entries) => {
        if (!cancelled) setProviSchedule(entries);
      })
      .catch(() => {
        if (!cancelled) setProviSchedule([]);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRoomId, supabase]);

  useEffect(() => {
    if (!slotAllowsProviDaSolo) {
      setProviDaSolo(false);
    }
  }, [slotAllowsProviDaSolo]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  useEffect(() => {
    if (
      !selectedRoomId ||
      currentStepKey === "start" ||
      currentStepKey === "session" ||
      currentStepKey === "band" ||
      currentStepKey === "room" ||
      currentStepKey === "duration" ||
      currentStepKey === "date" ||
      currentStepKey === "time"
    ) {
      return;
    }

    const unsubscribe = subscribeToBookings(supabase, selectedRoomId, () => {
      invalidateRoomAvailabilityCache(selectedRoomId);
      void loadAvailability();
    });

    return unsubscribe;
  }, [currentStepKey, loadAvailability, selectedRoomId, supabase]);

  useEffect(() => {
    if (currentStepKey !== "confirm" || !memberId) {
      setCreditBalance(null);
      return;
    }

    let cancelled = false;

    void getMemberCreditBalance(supabase, memberId)
      .then((balance) => {
        if (!cancelled) setCreditBalance(balance);
      })
      .catch(() => {
        if (!cancelled) setCreditBalance(null);
      });

    return () => {
      cancelled = true;
    };
  }, [memberId, currentStepKey, supabase]);

  function goToStepIndex(next: number) {
    setError(null);
    setMessage(null);
    setStepIndex(Math.max(0, Math.min(next, wizardSteps.length - 1)));
  }

  function handleStepTabClick(targetIndex: number) {
    if (targetIndex === stepIndex) return;
    if (targetIndex > stepIndex) return;

    if (wizardSteps[targetIndex]?.key !== "confirm") {
      setSelectedSlot(null);
    }
    goToStepIndex(targetIndex);
  }

  function handleSessionContinue() {
    goToStepIndex(stepIndex + 1);
  }

  async function finalizeBooking(
    result: CreateBookingResult,
    paidWithCredits: boolean,
  ): Promise<"redirect" | "done"> {
    const needsCardPayment =
      !paidWithCredits &&
      result.requiresPayment &&
      result.bookingId &&
      (result.status === "pending" || result.status === "pending_approval");

    if (needsCardPayment) {
      const payment = await requestRoomBookingPaymentUrl(result.bookingId!);
      if (payment.success && payment.url) {
        window.location.href = payment.url;
        return "redirect";
      }
      setError(
        mapUserFacingError(
          payment.message ?? "",
          "Impossibile avviare il pagamento. Riprova o contatta la segreteria.",
        ),
      );
      return "done";
    }

    if (result.requiresPayment && !paidWithCredits) {
      setError("Completa il pagamento per confermare la prenotazione.");
      return "done";
    }

    let successMessage = "Prenotazione registrata.";
    if (paidWithCredits) {
      if (result.status === "pending_approval") {
        successMessage =
          "Richiesta inviata: crediti riservati, in attesa di approvazione dalla segreteria.";
      } else if (result.status === "confirmed") {
        successMessage = "Prenotazione confermata e pagata con crediti!";
      } else {
        successMessage = "Prenotazione registrata e pagata con crediti.";
      }
    } else if (result.status === "pending_approval") {
      successMessage =
        "Richiesta inviata: in attesa di approvazione dalla segreteria.";
    } else if (result.status === "confirmed") {
      successMessage = "Prenotazione confermata!";
    }

    setMessage(successMessage);
    setSelectedSlot(null);
    setSessionType("band");
    setProviDaSolo(false);
    setMicrophoneCount(0);
    setBookingNotes("");
    if (bookableBands.length > 0) {
      setSelectedBandId(bookableBands[0].id);
    }
    goToStepIndex(0);
    await loadAvailability();

    if (result.bookingId) {
      if (result.status === "confirmed") {
        void requestBookingCalendarSync(result.bookingId);
        void requestBookingConfirmationEmail(result.bookingId, { template: "confirm" });
      } else if (result.status === "pending_approval") {
        void requestBookingConfirmationEmail(result.bookingId, { template: "confirm" });
      }
    }

    if (paidWithCredits) {
      window.location.assign("/dashboard");
      return "redirect";
    }

    return "done";
  }

  async function handleConfirm(payWithCredits = false) {
    if (!memberId || !selectedSlot) {
      setError("Seleziona uno slot disponibile.");
      return;
    }

    if (submitting || payingWithCredits) return;

    if (payWithCredits && !canPayWithCredits) {
      setError(
        creditBalance != null
          ? `Saldo crediti insufficiente: servono ${creditCost}, disponibili ${creditBalance.available}.`
          : "Impossibile verificare il saldo crediti.",
      );
      return;
    }

    if (payWithCredits) {
      setPayingWithCredits(true);
    } else {
      setSubmitting(true);
    }
    setError(null);
    setMessage(null);

    const isProviBooking =
      showBandFlow && sessionType === "provi_da_solo"
        ? true
        : proviDaSolo && slotAllowsProviDaSolo;

    let outcome: "redirect" | "done" = "done";

    try {
      const result: CreateBookingResult = await createBooking(supabase, {
        roomId: selectedRoomId,
        memberId,
        startAt: selectedSlot.startAt,
        endAt: selectedSlot.endAt,
        proviDaSolo: isProviBooking,
        bandId:
          showBandFlow && sessionType === "band" && selectedBandId
            ? selectedBandId
            : undefined,
        notes: bookingNotes,
        microphoneCount,
      });

      if (!result.success) {
        setError(result.errorMessage ?? "Prenotazione non riuscita.");
        return;
      }

      if (payWithCredits && result.bookingId) {
        const creditPayment = await requestBookingCreditsPayment(result.bookingId);

        if (!creditPayment.success) {
          setError(
            mapUserFacingError(
              creditPayment.message ?? "",
              "Prenotazione registrata ma il pagamento con crediti non è riuscito. Puoi riprovare da «Le mie prenotazioni».",
            ),
          );
          return;
        }

        const afterCreditsStatus: BookingStatus =
          creditPayment.status === "pending_approval" ||
          creditPayment.status === "confirmed" ||
          creditPayment.status === "pending"
            ? creditPayment.status
            : creditPayment.action === "hold" || result.status === "pending_approval"
              ? "pending_approval"
              : "confirmed";

        outcome = await finalizeBooking(
          {
            ...result,
            status: afterCreditsStatus,
            requiresPayment: false,
          },
          true,
        );
        return;
      }

      outcome = await finalizeBooking(result, false);
    } finally {
      if (outcome !== "redirect") {
        setSubmitting(false);
        setPayingWithCredits(false);
      }
    }
  }

  return (
    <main className="associate-gradient-page min-h-screen">
      <SiteHeader
        eyebrow="Sale prova"
        title="Prenota una sala"
        navLinks={[
          {
            href: "/prenotazioni/mie",
            label: "Le mie prenotazioni",
            mobileLabel: "Le mie",
          },
          { href: "/dashboard", label: "Dashboard" },
        ]}
        actions={hasSession ? <SignOutButton className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50" /> : null}
      />

      {!loading && !hasSession ? (
        <div className="mx-auto max-w-5xl px-6 py-10 lg:py-14">
          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
            <PrenotazioniWelcomeHero />
            <Suspense
              fallback={
                <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500">
                  Caricamento accesso…
                </div>
              }
            >
              <AuthSignInPanel
                defaultRedirect="/prenotazioni"
                title="Accedi per prenotare"
                subtitle="Password, magic link via email o recupero password."
              />
            </Suspense>
          </div>
        </div>
      ) : (
      <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
        {hasSession && memberId && quotaStatus && !quotaStatus.quotaPaid ? (
          <div className="mb-4">
            <MemberQuotaAlert {...quotaStatus} />
          </div>
        ) : null}

        {hasSession && !memberId && !loading && (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-900">Profilo non collegato</h2>
            <p className="mt-2 text-sm text-amber-800">
              Il tuo accesso è attivo ma non risulta un profilo associato per questa email.
              Contatta la segreteria MusicPro per collegare l&apos;account.
            </p>
          </div>
        )}

        {hasSession && memberId && bookingLocked ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-900">
              Prenotazioni chiuse
            </h2>
            <p className="mt-2 text-sm text-amber-800">
              {bookingLockedMessage ||
                "Le prenotazioni sono temporaneamente chiuse."}
            </p>
          </div>
        ) : null}

        {hasSession && memberId && !bookingLocked && (
        <>
        <ol
          className="-mx-1 flex flex-nowrap gap-1 overflow-x-auto px-1 pb-0.5 text-xs sm:text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Passaggi prenotazione"
        >
          {wizardSteps.map(({ key, label }, index) => {
            const isCurrent = stepIndex === index;
            const isCompleted = stepIndex > index;
            const isClickable = index <= stepIndex;

            const className = isCurrent
              ? "bg-[var(--brand)] text-white"
              : isCompleted
                ? "bg-[var(--brand)]/10 text-[var(--brand)] hover:bg-[var(--brand)]/20"
                : "bg-neutral-100 text-neutral-500";

            return (
              <li key={key} className="shrink-0">
                {isClickable ? (
                  <button
                    type="button"
                    onClick={() => handleStepTabClick(index)}
                    aria-current={isCurrent ? "step" : undefined}
                    title={
                      isCurrent
                        ? undefined
                        : `Torna a: ${label}`
                    }
                    className={`touch-manipulation whitespace-nowrap rounded-full px-2.5 py-1 font-medium sm:px-3 ${className} ${
                      isClickable && !isCurrent ? "cursor-pointer" : ""
                    }`}
                  >
                    {label}
                  </button>
                ) : (
                  <span
                    className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 sm:px-3 ${className}`}
                    aria-disabled="true"
                  >
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {loading && (
          <p className="mt-6 text-sm text-neutral-500">Caricamento…</p>
        )}

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {message && (
          <p className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {message}
            {" "}
            <Link href="/prenotazioni/mie" className="font-medium underline">
              Vai alle tue prenotazioni
            </Link>
          </p>
        )}

        {!loading && memberId && rooms.length === 0 && (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-[var(--brand)]">
              Nessuna sala disponibile
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Verifica di aver pagato la quota associativa e di avere il ruolo
              corretto. Se il problema persiste, scrivi alla segreteria.
            </p>
            <Link
              href="/dashboard"
              className="mt-4 inline-flex rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
            >
              Vai alla dashboard
            </Link>
          </div>
        )}

        {currentStepKey === "start" && (
          <section className="glass-card mt-3 space-y-3 p-4 sm:mt-4 sm:p-5">
            <div>
              <h2 className="text-base font-semibold text-[var(--brand)] sm:text-lg">
                Da cosa vuoi partire?
              </h2>
              <p className="mt-1 text-xs text-neutral-600 sm:text-sm">
                Ti portiamo alle soluzioni disponibili con il percorso più breve.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["room", "Sala", "So già dove"],
                  ["date", "Giorno", "So già quando"],
                  ["time", "Orario", "Cerco quell’ora"],
                ] as const
              ).map(([mode, label, hint]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setStartMode(mode);
                    setSelectedSlot(null);
                    goToStepIndex(stepIndex + 1);
                  }}
                  className="touch-manipulation rounded-xl border border-neutral-200 bg-white px-2 py-3 text-center hover:border-[var(--brand)]/40 hover:bg-neutral-50"
                >
                  <span className="block text-sm font-semibold text-[var(--brand)]">
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-neutral-500 sm:text-xs">
                    {hint}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {currentStepKey === "session" && (
          <div className="mt-3 sm:mt-4">
            <SessionTypeStep
              value={sessionType}
              onChange={setSessionType}
              onContinue={handleSessionContinue}
            />
          </div>
        )}

        {currentStepKey === "band" && sessionType === "band" && (
          <div className="mt-3 space-y-3 sm:mt-4">
            {myBands.length === 0 ? (
              <section className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <div>
                  <h2 className="text-lg font-medium text-[var(--brand)]">
                    Crea una band
                  </h2>
                  <p className="mt-2 text-sm text-neutral-600">
                    Per prenotare con la band devi prima crearne una e invitare i
                    membri dalla dashboard.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/dashboard/band"
                    className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
                  >
                    Vai alle band
                  </Link>
                  <button
                    type="button"
                    onClick={() => goToStepIndex(stepIndex - 1)}
                    className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm"
                  >
                    Indietro
                  </button>
                </div>
              </section>
            ) : (
              <BandSelectStep
                bands={myBands}
                selectedBandId={selectedBandId}
                onSelectBand={setSelectedBandId}
                onContinue={() => goToStepIndex(stepIndex + 1)}
                onBack={() => goToStepIndex(stepIndex - 1)}
                quotaStatus={quotaStatus}
              />
            )}
          </div>
        )}

        {currentStepKey === "time" && (
          <section className="glass-card mt-3 p-4 sm:mt-4 sm:p-5">
            <div className="flex items-end gap-2">
              <label htmlFor="preferredTime" className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-neutral-600">
                  A che ora preferisci?
                </span>
                <input
                  id="preferredTime"
                  type="time"
                  step={1800}
                  value={preferredTime}
                  onChange={(event) => setPreferredTime(event.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => goToStepIndex(stepIndex + 1)}
                className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
              >
                Continua
              </button>
            </div>
          </section>
        )}

        {currentStepKey === "date" && (
          <section className="glass-card mt-3 p-4 sm:mt-4 sm:p-5">
            <div className="flex items-end gap-2">
              <label htmlFor="date" className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-neutral-600">
                  In quale giorno?
                </span>
                <input
                  id="date"
                  type="date"
                  value={selectedDate}
                  min={todayInRome()}
                  onChange={(event) => {
                    setSelectedDate(event.target.value);
                    setSelectedSlot(null);
                  }}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => goToStepIndex(stepIndex + 1)}
                className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
              >
                Continua
              </button>
            </div>
            <p className="mt-2 text-xs capitalize text-neutral-500">
              {formatDateItalian(selectedDate)}
            </p>
          </section>
        )}

        {rooms.length > 0 && currentStepKey === "room" && (
          <section className="glass-card mt-3 space-y-3 p-4 sm:mt-4 sm:space-y-4 sm:p-5">
            <RoomPickerGrid
              rooms={rooms}
              selectedRoomId={selectedRoomId}
              onSelectRoom={(roomId) => {
                setSelectedRoomId(roomId);
                setSelectedSlot(null);
                setProviDaSolo(false);
                const room = rooms.find((r) => r.id === roomId);
                if (room) {
                  setDurationMinutes(room.default_duration_minutes);
                  goToStepIndex(stepIndex + 1);
                }
              }}
            />
            {selectedRoom?.description ? (
              <p className="text-xs text-neutral-500 sm:text-sm">
                {selectedRoom.description}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => goToStepIndex(stepIndex - 1)}
              className="text-sm text-neutral-600 underline"
            >
              Indietro
            </button>
          </section>
        )}

        {rooms.length > 0 && currentStepKey === "duration" && (
          <section className="glass-card mt-3 space-y-3 p-4 sm:mt-4 sm:space-y-4 sm:p-5">
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {durationOptions.map((minutes) => {
                const active = minutes === durationMinutes;
                return (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => {
                      setDurationMinutes(minutes);
                      setSelectedSlot(null);
                      goToStepIndex(stepIndex + 1);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition sm:px-4 sm:py-2 sm:text-sm ${
                      active
                        ? "bg-[var(--brand)] text-white"
                        : "border border-neutral-200 bg-white/80 text-neutral-700 hover:border-[var(--brand)]/30"
                    }`}
                  >
                    {formatDurationLabel(minutes)}
                    {selectedRoom
                      ? ` · ${formatEuro(calculateBookingPrice(selectedRoom, minutes))}`
                      : ""}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => goToStepIndex(stepIndex - 1)}
              className="text-sm text-neutral-600 underline"
            >
              Indietro
            </button>
          </section>
        )}

        {rooms.length > 0 && currentStepKey === "slot" && (
          <section className="glass-card mt-3 space-y-3 p-4 sm:mt-4 sm:space-y-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
              <p className="font-medium text-[var(--brand)]">
                {startMode === "time"
                  ? `Soluzioni più vicine alle ${preferredTime}`
                  : startMode === "date"
                    ? "Prime soluzioni disponibili"
                    : "Orari disponibili"}
              </p>
              <p className="shrink-0 capitalize text-neutral-500">
                {formatDateItalian(selectedDate)}
              </p>
            </div>

            <div>
              {visibleSlots.length === 0 ? (
                <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-center text-xs text-neutral-600 sm:text-sm">
                  Nessuno slot per questa data e durata. Cambia data, durata o sala.
                </p>
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
                  {solutionSlots.map((slot) => {
                    const alternatives =
                      alternativeRoomsByStartAt[slot.startAt] ?? [];
                    return (
                      <li key={slot.startAt}>
                        {slot.available ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSlot(slot);
                              goToStepIndex(stepIndex + 1);
                            }}
                            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm transition hover:border-[var(--brand)] hover:bg-neutral-50"
                          >
                            <span className="font-medium">{slot.label}</span>
                            <span className="mt-0.5 block text-xs text-neutral-600">
                              {slot.leadTimeCategory === "approval" ? (
                                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                                  Richiede approvazione
                                </span>
                              ) : slot.priceEur != null ? (
                                formatEuro(slot.priceEur)
                              ) : (
                                "Disponibile"
                              )}
                            </span>
                          </button>
                        ) : (
                          <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{slot.label}</span>
                              <span className="text-xs text-amber-800">
                                {selectedRoom?.name ?? "Sala"} occupata
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-700">
                              <span>Se vuoi, a quell&apos;ora è libera</span>
                              {alternatives.map((alternative) => (
                                <button
                                  key={alternative.room.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedRoomId(alternative.room.id);
                                    setSelectedSlot(alternative.slot);
                                    setProviDaSolo(false);
                                    goToStepIndex(stepIndex + 1);
                                  }}
                                  className="rounded-full border border-[var(--brand)]/25 bg-white px-2 py-1 font-semibold text-[var(--brand)] hover:bg-[var(--brand)]/5"
                                >
                                  {alternative.room.name.replace(
                                    /^Sala\s+/i,
                                    "",
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={() => goToStepIndex(stepIndex - 1)}
              className="text-sm text-neutral-600 underline"
            >
              Indietro
            </button>
          </section>
        )}

        {currentStepKey === "confirm" && selectedSlot && selectedRoom && (
          <section className="mt-3 space-y-4 sm:mt-4">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
              <h2 className="text-base font-medium text-[var(--brand)] sm:text-lg">
                Riepilogo
              </h2>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-500">Sala</dt>
                  <dd className="font-medium">{selectedRoom.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-500">Quando</dt>
                  <dd className="text-right font-medium">
                    {formatDateItalian(selectedDate)}
                    <br />
                    {selectedSlot.label}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-500">Durata</dt>
                  <dd className="font-medium">
                    {formatDurationLabel(durationMinutes)}
                  </dd>
                </div>
                {selectedBand && sessionType === "band" && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-neutral-500">Band</dt>
                    <dd className="font-medium">{selectedBand.name}</dd>
                  </div>
                )}
                {((showBandFlow && sessionType === "provi_da_solo") ||
                  (!showBandFlow && proviDaSolo)) && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-neutral-500">PROVI DA SOLO</dt>
                    <dd className="font-medium">Sì</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-neutral-100 pt-2">
                  <dt className="text-neutral-500">Totale</dt>
                  <dd className="text-lg font-semibold text-[var(--brand)]">
                    {previewPrice != null ? formatEuro(previewPrice) : "—"}
                  </dd>
                </div>
                {slotAllowsProviDaSolo && !showBandFlow && (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={proviDaSolo}
                        onChange={(e) => setProviDaSolo(e.target.checked)}
                        className="rounded border-neutral-300"
                      />
                      <span className="font-medium text-neutral-900">
                        Provo da solo
                        {selectedRoom.provi_da_solo_discount_eur > 0 ? (
                          <span className="ml-1.5 font-normal text-neutral-600">
                            (−{formatEuro(selectedRoom.provi_da_solo_discount_eur)}
                            /ora)
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                  <label
                    htmlFor="microphoneCount"
                    className="shrink-0 text-sm text-neutral-500"
                  >
                    Microfoni
                  </label>
                  <select
                    id="microphoneCount"
                    value={microphoneCount}
                    onChange={(e) => setMicrophoneCount(Number(e.target.value))}
                    className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
                  >
                    {BOOKING_MICROPHONE_COUNTS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pt-1">
                  <label
                    htmlFor="bookingNotes"
                    className="block text-sm text-neutral-500"
                  >
                    Note aggiuntive
                  </label>
                  <textarea
                    id="bookingNotes"
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Opzionale — visibili in calendario e in segreteria"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                {creditBalance != null && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-neutral-500">Crediti</dt>
                    <dd className="text-right text-sm">
                      <span className="font-medium">
                        {creditBalance.available} disponibili
                      </span>
                      <span className="mt-0.5 block text-neutral-500">
                        Costo: {creditCost}{" "}
                        {creditCost === 1 ? "credito" : "crediti"} · 1 credito =
                        1 €
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
              {selectedSlot.leadTimeCategory === "approval" && (
                <p className="mt-4 text-sm text-amber-800">
                  Questa fascia richiede approvazione admin (6–12 ore prima
                  dell&apos;inizio).
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={submitting || payingWithCredits}
                onClick={() => void handleConfirm(false)}
                className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
              >
                {submitting ? "Reindirizzamento…" : "Procedi al pagamento"}
              </button>
              {canPayWithCredits && (
                <button
                  type="button"
                  disabled={submitting || payingWithCredits}
                  onClick={() => void handleConfirm(true)}
                  className="rounded-lg border border-[var(--brand)] bg-white px-5 py-2.5 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5 disabled:opacity-60"
                >
                  {payingWithCredits
                    ? "Pagamento crediti…"
                    : `Paga con crediti (${creditCost})`}
                </button>
              )}
              <button
                type="button"
                onClick={() => goToStepIndex(stepIndex - 1)}
                className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm"
              >
                Indietro
              </button>
            </div>
          </section>
        )}
        </>
        )}
      </div>
      )}
    </main>
  );
}
