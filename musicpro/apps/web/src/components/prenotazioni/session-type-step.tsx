"use client";

export type SessionType = "band" | "provi_da_solo";

interface SessionTypeStepProps {
  value: SessionType;
  onChange: (value: SessionType) => void;
  proviDaSoloAvailable?: boolean;
  onContinue: () => void;
}

export function SessionTypeStep({
  value,
  onChange,
  proviDaSoloAvailable = true,
  onContinue,
}: SessionTypeStepProps) {
  return (
    <section className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-medium text-[var(--brand)]">
          Tipo di sessione
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Scegli se prenotare con la tua band o in modalità prova da solo.
        </p>
      </div>

      <div className="grid gap-3">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-4 hover:border-[var(--brand)]">
          <input
            type="radio"
            name="session-type"
            value="band"
            checked={value === "band"}
            onChange={() => onChange("band")}
            className="mt-1"
          />
          <span>
            <span className="block font-medium text-neutral-900">
              Con la mia band
            </span>
            <span className="mt-1 block text-sm text-neutral-600">
              Prenotazione a nome band: tutti i membri devono essere in regola
              con quota e iscrizione.
            </span>
          </span>
        </label>

        <label
          className={`flex items-start gap-3 rounded-lg border border-neutral-200 p-4 ${
            proviDaSoloAvailable
              ? "cursor-pointer hover:border-[var(--brand)]"
              : "cursor-not-allowed opacity-60"
          }`}
        >
          <input
            type="radio"
            name="session-type"
            value="provi_da_solo"
            checked={value === "provi_da_solo"}
            onChange={() => onChange("provi_da_solo")}
            disabled={!proviDaSoloAvailable}
            className="mt-1"
          />
          <span>
            <span className="block font-medium text-neutral-900">
              PROVI DA SOLO
            </span>
            <span className="mt-1 block text-sm text-neutral-600">
              Solo per te, senza band. Disponibile nelle fasce orarie configurate
              per sala.
            </span>
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
      >
        Continua
      </button>
    </section>
  );
}

export function isBandRequiredForBooking(): boolean {
  /** @deprecated Usare BookingSettings.bandRequired da app_settings. */
  return false;
}
