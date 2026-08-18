"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  type PaymentVisibility,
  type PayRateUnit,
  type TeacherProfile,
  createPayRateType,
  setTeacherPayRate,
  setTeacherSubjects,
  upsertTeacherProfile,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

type PayRateTypeOption = {
  id: string;
  slug: string;
  label: string;
  unit: PayRateUnit;
};

export interface TeacherDidacticPanelProps {
  memberId: string;
  initialProfile: TeacherProfile | null;
  initialSubjectIds: string[];
  initialRates: { payRateTypeId: string; amountEur: number }[];
  subjects: { id: string; name: string }[];
  payRateTypes: PayRateTypeOption[];
  /** Kept for the current parent page; unused — parent will gate render. */
  hasDocenteRole?: boolean;
  currentStaffMemberId?: string;
}

const PAYMENT_VISIBILITY_LABELS: Record<PaymentVisibility, string> = {
  hidden: "Niente",
  status: "Solo stato",
  amounts: "Stato e importi",
};

const DEFAULT_FLAGS = {
  canCreateCourses: false,
  canReschedule: false,
  canCloseCourses: false,
  paymentVisibility: "hidden" as PaymentVisibility,
};

function unitSuffix(unit: PayRateUnit): string {
  return unit === "hourly" ? "€/ora" : "€/lezione a testa";
}

function ratesToInputs(
  types: PayRateTypeOption[],
  initialRates: TeacherDidacticPanelProps["initialRates"],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const type of types) {
    const existing = initialRates.find((rate) => rate.payRateTypeId === type.id);
    map[type.id] = existing != null ? String(existing.amountEur) : "";
  }
  return map;
}

export function TeacherDidacticPanel({
  memberId,
  initialProfile,
  initialSubjectIds,
  initialRates,
  subjects,
  payRateTypes,
}: TeacherDidacticPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [types, setTypes] = useState<PayRateTypeOption[]>(payRateTypes);
  const [subjectIds, setSubjectIds] = useState<string[]>(initialSubjectIds);
  const [rateInputs, setRateInputs] = useState(() =>
    ratesToInputs(payRateTypes, initialRates),
  );
  const [canCreateCourses, setCanCreateCourses] = useState(
    initialProfile?.canCreateCourses ?? DEFAULT_FLAGS.canCreateCourses,
  );
  const [canReschedule, setCanReschedule] = useState(
    initialProfile?.canReschedule ?? DEFAULT_FLAGS.canReschedule,
  );
  const [canCloseCourses, setCanCloseCourses] = useState(
    initialProfile?.canCloseCourses ?? DEFAULT_FLAGS.canCloseCourses,
  );
  const [paymentVisibility, setPaymentVisibility] = useState<PaymentVisibility>(
    initialProfile?.paymentVisibility ?? DEFAULT_FLAGS.paymentVisibility,
  );

  const [addingVoice, setAddingVoice] = useState(false);
  const [newVoiceLabel, setNewVoiceLabel] = useState("");
  const [newVoiceUnit, setNewVoiceUnit] = useState<PayRateUnit>("hourly");
  const [creatingVoice, setCreatingVoice] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function toggleSubject(subjectId: string, checked: boolean) {
    setSubjectIds((prev) =>
      checked
        ? prev.includes(subjectId)
          ? prev
          : [...prev, subjectId]
        : prev.filter((id) => id !== subjectId),
    );
  }

  async function handleCreateVoice() {
    const label = newVoiceLabel.trim();
    if (!label) {
      setError("Il nome della voce è obbligatorio.");
      return;
    }

    setCreatingVoice(true);
    setError(null);
    setSuccess(null);

    const result = await createPayRateType(supabase, {
      label,
      unit: newVoiceUnit,
    });

    setCreatingVoice(false);

    if (!result.success || !result.id) {
      setError(
        result.errorMessage ?? "Impossibile creare la voce di retribuzione.",
      );
      return;
    }

    const created: PayRateTypeOption = {
      id: result.id,
      slug: "",
      label,
      unit: newVoiceUnit,
    };

    setTypes((prev) => [...prev, created]);
    setRateInputs((prev) => ({ ...prev, [result.id!]: "" }));
    setNewVoiceLabel("");
    setNewVoiceUnit("hourly");
    setAddingVoice(false);
    setSuccess("Voce di retribuzione creata.");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const ratesToSave: {
      payRateTypeId: string;
      amountEur: number;
      label: string;
    }[] = [];

    for (const type of types) {
      const raw = (rateInputs[type.id] ?? "").trim();
      if (!raw) continue;

      const amountEur = Number(raw.replace(",", "."));
      if (!Number.isFinite(amountEur) || amountEur < 0) {
        setSaving(false);
        setError(`Importo non valido per «${type.label}».`);
        return;
      }

      ratesToSave.push({
        payRateTypeId: type.id,
        amountEur,
        label: type.label,
      });
    }

    const profileResult = await upsertTeacherProfile(supabase, memberId, {
      canCreateCourses,
      canReschedule,
      canCloseCourses,
      paymentVisibility,
    });

    if (!profileResult.success) {
      setSaving(false);
      setError(
        profileResult.errorMessage ?? "Impossibile salvare il profilo docente.",
      );
      return;
    }

    const subjectsResult = await setTeacherSubjects(
      supabase,
      memberId,
      subjectIds,
    );

    if (!subjectsResult.success) {
      setSaving(false);
      setError(
        subjectsResult.errorMessage ??
          "Impossibile aggiornare le materie del docente.",
      );
      return;
    }

    for (const rate of ratesToSave) {
      const rateResult = await setTeacherPayRate(
        supabase,
        memberId,
        rate.payRateTypeId,
        rate.amountEur,
      );

      if (!rateResult.success) {
        setSaving(false);
        setError(
          rateResult.errorMessage ??
            `Impossibile salvare la tariffa «${rate.label}».`,
        );
        return;
      }
    }

    setSaving(false);
    setSuccess("Didattica salvata.");
    router.refresh();
  }

  return (
    <section className="mt-10 space-y-8">
      <h3 className="text-lg font-semibold text-[var(--brand)]">Didattica</h3>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <form onSubmit={(e) => void handleSave(e)} className="space-y-8">
        <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
            Materie
          </legend>
          {subjects.length === 0 ? (
            <p className="text-sm text-neutral-500">Nessuna materia attiva.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {subjects.map((subject) => (
                <label
                  key={subject.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={subjectIds.includes(subject.id)}
                    onChange={(e) =>
                      toggleSubject(subject.id, e.target.checked)
                    }
                    className="rounded border-neutral-300"
                  />
                  {subject.name}
                </label>
              ))}
            </div>
          )}
          {subjectIds.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Nessuna materia selezionata. Potrà creare corsi solo dopo averne
              indicata almeno una.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
            Retribuzione
          </legend>
          {types.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nessuna voce di retribuzione.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {types.map((type) => (
                <Field
                  key={type.id}
                  label={`${type.label} (${unitSuffix(type.unit)})`}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={rateInputs[type.id] ?? ""}
                    onChange={(e) =>
                      setRateInputs((prev) => ({
                        ...prev,
                        [type.id]: e.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
              ))}
            </div>
          )}

          {addingVoice ? (
            <div className="space-y-4 border-t border-neutral-100 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome">
                  <input
                    value={newVoiceLabel}
                    onChange={(e) => setNewVoiceLabel(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Unità">
                  <select
                    value={newVoiceUnit}
                    onChange={(e) =>
                      setNewVoiceUnit(e.target.value as PayRateUnit)
                    }
                    className={inputClass}
                  >
                    <option value="hourly">€/ora</option>
                    <option value="per_head_per_lesson">
                      €/lezione a testa
                    </option>
                  </select>
                </Field>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={creatingVoice}
                  onClick={() => void handleCreateVoice()}
                  className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
                >
                  {creatingVoice ? "Creazione…" : "Aggiungi"}
                </button>
                <button
                  type="button"
                  disabled={creatingVoice}
                  onClick={() => {
                    setAddingVoice(false);
                    setNewVoiceLabel("");
                    setNewVoiceUnit("hourly");
                  }}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingVoice(true)}
              className="text-sm font-medium text-[var(--brand)] hover:underline"
            >
              + Voce
            </button>
          )}
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
            Permessi
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={canCreateCourses}
                onChange={(e) => setCanCreateCourses(e.target.checked)}
                className="rounded border-neutral-300"
              />
              Crea corsi in autonomia
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={canReschedule}
                onChange={(e) => setCanReschedule(e.target.checked)}
                className="rounded border-neutral-300"
              />
              Annulla/sposta lezioni
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={canCloseCourses}
                onChange={(e) => setCanCloseCourses(e.target.checked)}
                className="rounded border-neutral-300"
              />
              Chiudi corso
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
            Visibilità pagamenti allievo
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cosa vede il docente">
              <select
                value={paymentVisibility}
                onChange={(e) =>
                  setPaymentVisibility(e.target.value as PaymentVisibility)
                }
                className={inputClass}
              >
                {(
                  Object.keys(PAYMENT_VISIBILITY_LABELS) as PaymentVisibility[]
                ).map((value) => (
                  <option key={value} value={value}>
                    {PAYMENT_VISIBILITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={saving || creatingVoice}
          className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : "Salva didattica"}
        </button>
      </form>
    </section>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
