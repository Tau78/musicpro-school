"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import {
  buildRoomAvailability,
  fetchRoomAvailability,
  type BookingStatus,
  type CreateBookingResult,
  type MyBandSummary,
  type Room,
  type TimeSlot,
  bookingStatusLabel,
  calculateBookingPrice,
  proviDaSoloDiscountTotalEur,
  createBooking,
  creditsForBookingDuration,
  durationOptionsForRoom,
  formatDateItalian,
  formatDurationLabel,
  formatEuro,
  getBookingSettings,
  getCurrentMember,
  getMemberCreditBalance,
  isSlotInProviSchedule,
  listMyBands,
  listProviSchedule,
  listRooms,
  requestBookingCreditsPayment,
  requestRoomBookingPaymentUrl,
  subscribeToBookings,
  todayInRome,
  type MemberCreditBalance,
  type ProviScheduleEntry,
} from "@musicpro/database";
import { mapUserFacingError } from "@musicpro/shared";
import { AuthSignInPanel } from "@/components/auth/auth-sign-in-panel";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SiteHeader } from "@/components/layout/site-header";
import { BandSelectStep } from "@/components/prenotazioni/band-select-step";
import {
  SessionTypeStep,
  type SessionType,
} from "@/components/prenotazioni/session-type-step";
import { PrenotazioniWelcomeHero } from "@/components/prenotazioni/welcome-hero";
import { createClient } from "@/lib/supabase/client";
import { requestBookingConfirmationEmail } from "@/lib/booking/send-confirmation-email";
import { requestBookingCalendarSync } from "@/lib/calendar/sync-booking";

type WizardStepKey = "session" | "band" | "room" | "slot" | "confirm";

export default function PrenotazioniPage() {
  const supabase = createClient();

  const [stepIndex, setStepIndex] = useState(0);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [myBands, setMyBands] = useState<MyBandSummary[]>([]);
  const [sessionType, setSessionType] = useState<SessionType>("band");
  const [selectedBandId, setSelectedBandId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(120);
  const [selectedDate, setSelectedDate] = useState(todayInRome());
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
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
  const [bandRequired, setBandRequired] = useState(false);
  const [bookingLocked, setBookingLocked] = useState(false);
  const [bookingLockedMessage, setBookingLockedMessage] = useState("");

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
    () => creditsForBookingDuration(durationMinutes),
    [durationMinutes],
  );

  const canPayWithCredits =
    creditBalance != null && creditBalance.available >= creditCost;

  const wizardSteps = useMemo(() => {
    const steps: { key: WizardStepKey; label: string }[] = [];
    if (showBandFlow) {
      steps.push({ key: "session", label: "Tipo sessione" });
      if (sessionType === "band") {
        steps.push({ key: "band", label: "Band" });
      }
    }
    steps.push({ key: "room", label: "Sala e durata" });
    steps.push({ key: "slot", label: "Data e orario" });
    steps.push({ key: "confirm", label: "Conferma" });
    return steps;
  }, [showBandFlow, sessionType]);

  const currentStepKey = wizardSteps[stepIndex]?.key ?? "room";

  const selectedBand = useMemo(
    () => bookableBands.find((band) => band.id === selectedBandId) ?? null,
    [bookableBands, selectedBandId],
  );

  const bookableSlots = useMemo(
    () => slots.filter((slot) => slot.available),
    [slots],
  );

  const loadAvailability = useCallback(async () => {
    if (!selectedRoomId || currentStepKey === "session" || currentStepKey === "band" || currentStepKey === "room") {
      return;
    }

    try {
      const availability = await fetchRoomAvailability(
        selectedRoomId,
        selectedDate,
        durationMinutes,
      );
      setSlots(availability.slots);
    } catch (err) {
      setError(
        mapUserFacingError(
          err instanceof Error ? err.message : "",
          "Errore nel caricamento degli slot.",
        ),
      );
    }
  }, [currentStepKey, durationMinutes, selectedDate, selectedRoomId, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const [roomList, member, bands, bookingSettings] = await Promise.all([
          user ? listRooms(supabase) : Promise.resolve([] as Room[]),
          user ? getCurrentMember(supabase) : Promise.resolve(null),
          user ? listMyBands(supabase).catch(() => [] as MyBandSummary[]) : Promise.resolve([] as MyBandSummary[]),
          user
            ? getBookingSettings(supabase)
            : Promise.resolve({
                bandRequired: false,
                locked: false,
                lockedMessage: "",
              } as Awaited<ReturnType<typeof getBookingSettings>>),
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
    if (selectedRoom) {
      setDurationMinutes(selectedRoom.default_duration_minutes);
      setSelectedSlot(null);
      setProviDaSolo(false);
    }
  }, [selectedRoomId, selectedRoom]);

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
    if (!selectedRoomId || currentStepKey === "session" || currentStepKey === "band" || currentStepKey === "room") {
      return;
    }

    const unsubscribe = subscribeToBookings(supabase, selectedRoomId, () => {
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
    if (sessionType === "provi_da_solo") {
      const roomIndex = wizardSteps.findIndex((step) => step.key === "room");
      goToStepIndex(roomIndex >= 0 ? roomIndex : stepIndex + 1);
      return;
    }
    goToStepIndex(stepIndex + 1);
  }

  async function finalizeBooking(
    result: CreateBookingResult,
    paidWithCredits: boolean,
  ) {
    const needsCardPayment =
      !paidWithCredits &&
      result.requiresPayment &&
      result.bookingId &&
      (result.status === "pending" || result.status === "pending_approval");

    if (needsCardPayment) {
      const payment = await requestRoomBookingPaymentUrl(result.bookingId!);
      if (payment.success && payment.url) {
        window.location.href = payment.url;
        return;
      }
      setError(
        mapUserFacingError(
          payment.message ?? "",
          "Impossibile avviare il pagamento. Riprova o contatta la segreteria.",
        ),
      );
      return;
    }

    if (result.requiresPayment && !paidWithCredits) {
      setError("Completa il pagamento per confermare la prenotazione.");
      return;
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
      return;
    }
  }

  async function handleConfirm(payWithCredits = false) {
    if (!memberId || !selectedSlot) {
      setError("Seleziona uno slot disponibile.");
      return;
    }

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
    });

    if (!result.success) {
      setSubmitting(false);
      setPayingWithCredits(false);
      setError(result.errorMessage ?? "Prenotazione non riuscita.");
      return;
    }

    if (payWithCredits && result.bookingId) {
      const creditPayment = await requestBookingCreditsPayment(
        result.bookingId,
        creditCost,
      );

      setSubmitting(false);
      setPayingWithCredits(false);

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

      await finalizeBooking(
        {
          ...result,
          status: afterCreditsStatus,
          requiresPayment: false,
        },
        true,
      );
      return;
    }

    setSubmitting(false);
    await finalizeBooking(result, false);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[var(--brand)]/5 via-[var(--background)] to-[var(--background)]">
      <SiteHeader
        eyebrow="Sale prova"
        title="Prenota una sala"
        navLinks={[
          { href: "/prenotazioni/mie", label: "Le mie prenotazioni" },
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
      <div className="mx-auto max-w-3xl px-6 py-8">
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
        <ol className="flex flex-wrap gap-2 text-sm" aria-label="Passaggi prenotazione">
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
              <li key={key}>
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
                    className={`rounded-full px-3 py-1 font-medium transition ${className} ${
                      isClickable && !isCurrent ? "cursor-pointer" : ""
                    }`}
                  >
                    {index + 1}. {label}
                  </button>
                ) : (
                  <span
                    className={`inline-block rounded-full px-3 py-1 ${className}`}
                    aria-disabled="true"
                  >
                    {index + 1}. {label}
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

        {currentStepKey === "session" && (
          <div className="mt-8">
            <SessionTypeStep
              value={sessionType}
              onChange={setSessionType}
              onContinue={handleSessionContinue}
            />
          </div>
        )}

        {currentStepKey === "band" && sessionType === "band" && (
          <div className="mt-8 space-y-4">
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
              />
            )}
          </div>
        )}

        {rooms.length > 0 && currentStepKey === "room" && (
          <section className="mt-8 space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div>
              <label
                htmlFor="room"
                className="block text-sm font-medium text-[var(--brand)]"
              >
                Sala
              </label>
              <select
                id="room"
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} — {formatEuro(room.hourly_rate_eur)}/h
                  </option>
                ))}
              </select>
              {selectedRoom?.description && (
                <p className="mt-2 text-sm text-neutral-500">
                  {selectedRoom.description}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="duration"
                className="block text-sm font-medium text-[var(--brand)]"
              >
                Durata
              </label>
              <select
                id="duration"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                {durationOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDurationLabel(minutes)}
                    {selectedRoom
                      ? ` — ${formatEuro(calculateBookingPrice(selectedRoom, minutes))}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => goToStepIndex(stepIndex + 1)}
              className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
            >
              Continua
            </button>
            {showBandFlow && (
              <button
                type="button"
                onClick={() => goToStepIndex(stepIndex - 1)}
                className="ml-3 text-sm text-neutral-600 underline"
              >
                Indietro
              </button>
            )}
          </section>
        )}

        {rooms.length > 0 && currentStepKey === "slot" && (
          <section className="mt-8 space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div>
              <label
                htmlFor="date"
                className="block text-sm font-medium text-[var(--brand)]"
              >
                Data
              </label>
              <input
                id="date"
                type="date"
                value={selectedDate}
                min={todayInRome()}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlot(null);
                }}
                className="mt-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              />
              <p className="mt-2 text-sm capitalize text-neutral-500">
                {formatDateItalian(selectedDate)}
              </p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-[var(--brand)]">
                Slot disponibili ({formatDurationLabel(durationMinutes)})
              </h2>
              {bookableSlots.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">
                  Nessuno slot prenotabile per questa data e durata.
                  <br />
                  Prova un&apos;altra data o torna indietro per cambiare sala o durata.
                </p>
              ) : (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {bookableSlots.map((slot) => (
                    <li key={slot.startAt}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSlot(slot);
                          goToStepIndex(stepIndex + 1);
                        }}
                        className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left text-sm transition hover:border-[var(--brand)] hover:bg-neutral-50"
                      >
                        <span className="font-medium">{slot.label}</span>
                        <span className="mt-1 block text-xs text-neutral-600">
                          {slot.leadTimeCategory === "approval" ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                              Richiede approvazione admin
                            </span>
                          ) : slot.priceEur != null ? (
                            formatEuro(slot.priceEur)
                          ) : (
                            "Disponibile"
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
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
          <section className="mt-8 space-y-6">
            <div className="rounded-xl border border-neutral-200 bg-white p-6">
              <h2 className="text-lg font-medium text-[var(--brand)]">
                Riepilogo
              </h2>
              <dl className="mt-4 space-y-2 text-sm">
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
                {(showBandFlow && sessionType === "provi_da_solo") && (
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
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3">
                    <label className="flex cursor-pointer items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={proviDaSolo}
                        onChange={(e) => setProviDaSolo(e.target.checked)}
                        className="mt-0.5 rounded border-neutral-300"
                      />
                      <span>
                        <span className="font-medium text-neutral-900">
                          Provo da solo
                        </span>
                        {selectedRoom.provi_da_solo_discount_eur > 0 && (
                          <span className="mt-0.5 block text-neutral-600">
                            Sconto {formatEuro(selectedRoom.provi_da_solo_discount_eur)}
                            /ora
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                )}
                {creditBalance != null && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-neutral-500">Crediti</dt>
                    <dd className="text-right text-sm">
                      <span className="font-medium">
                        {creditBalance.available} disponibili
                      </span>
                      <span className="mt-0.5 block text-neutral-500">
                        Costo: {creditCost}{" "}
                        {creditCost === 1 ? "credito" : "crediti"} (
                        {formatDurationLabel(durationMinutes)})
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
