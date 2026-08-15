"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  mergeDuplicateMembers,
  type DuplicateMergePlan,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

interface DuplicatesMergePanelProps {
  plans: DuplicateMergePlan[];
}

export function DuplicatesMergePanel({ plans }: DuplicatesMergePanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [choices, setChoices] = useState<
    Record<string, Record<string, "canonical" | "duplicate">>
  >({});

  async function executeMerge(plan: DuplicateMergePlan) {
    if (plan.duplicates.length === 0) return;

    const confirmed = window.confirm(
      `Unisci i duplicati di "${plan.displayName}" nel record n. ${
        plan.canonical.memberNumber ?? "—"
      } e elimina ${plan.duplicates.length} duplicat${
        plan.duplicates.length === 1 ? "o" : "i"
      }?`,
    );
    if (!confirmed) return;

    setWorkingKey(plan.key);
    setError(null);
    setSuccess(null);

    const preferred = choices[plan.key] ?? {};
    let lastError: string | null = null;
    let deleted = 0;

    for (const dup of plan.duplicates) {
      const result = await mergeDuplicateMembers(
        supabase,
        plan.canonical.id,
        dup.id,
        preferred,
      );
      if (!result.success) {
        lastError = result.errorMessage ?? "Errore durante la fusione.";
        break;
      }
      deleted += result.deletedIds?.length ?? 1;
    }

    setWorkingKey(null);

    if (lastError) {
      setError(lastError);
      router.refresh();
      return;
    }

    setSuccess(
      `Fusione completata: eliminati ${deleted} duplicat${deleted === 1 ? "o" : "i"} di ${plan.displayName}.`,
    );
    router.refresh();
  }

  if (plans.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white px-6 py-10 text-center">
        <p className="text-sm text-neutral-600">
          Nessun duplicato trovato (stesso nome e cognome normalizzati).
        </p>
        <Link
          href="/admin/associati"
          className="mt-4 inline-block text-sm text-[var(--brand)] hover:underline"
        >
          Torna alla rubrica
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      <p className="text-sm text-neutral-600">
        Trovati <strong>{plans.length}</strong> gruppi di omonimi. Il record
        canonico è quello con numero associato più basso. La fusione riassegna
        rimborsi, quote, ruoli e collegamenti tutore, poi elimina i duplicati.
      </p>

      {plans.map((plan) => (
        <article
          key={plan.key}
          className="rounded-xl border border-neutral-200 bg-white p-6"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-neutral-900">
                {plan.displayName}
              </h3>
              <p className="text-sm text-neutral-500">
                Canonico: n. {plan.canonical.memberNumber ?? "—"} ·{" "}
                {plan.canonical.email ?? plan.canonical.phone ?? "—"}
              </p>
            </div>
            <button
              type="button"
              disabled={workingKey === plan.key}
              onClick={() => void executeMerge(plan)}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
            >
              {workingKey === plan.key ? "Unione…" : "Esegui fusione"}
            </button>
          </div>

          <ul className="mt-4 space-y-2 text-sm">
            <li className="rounded-lg bg-green-50 px-3 py-2 text-green-900">
              <span className="font-medium">Mantieni:</span>{" "}
              <Link
                href={`/admin/associati/${plan.canonical.id}`}
                className="underline"
              >
                n. {plan.canonical.memberNumber ?? "—"} · {plan.canonical.lastName}{" "}
                {plan.canonical.firstName}
              </Link>
              {plan.canonical.taxCode ? ` · CF ${plan.canonical.taxCode}` : ""}
            </li>
            {plan.duplicates.map((dup) => (
              <li
                key={dup.id}
                className="rounded-lg bg-amber-50 px-3 py-2 text-amber-950"
              >
                <span className="font-medium">Elimina:</span>{" "}
                <Link href={`/admin/associati/${dup.id}`} className="underline">
                  n. {dup.memberNumber ?? "—"} · {dup.lastName} {dup.firstName}
                </Link>
                {dup.taxCode ? ` · CF ${dup.taxCode}` : ""}
                {dup.email ? ` · ${dup.email}` : ""}
              </li>
            ))}
          </ul>

          {plan.autoFills.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Compilazione automatica (campi vuoti sul canonico)
              </p>
              <ul className="mt-1 list-inside list-disc text-sm text-neutral-700">
                {plan.autoFills.map((f) => (
                  <li key={f.field}>
                    {f.label}: {f.value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan.conflicts.length > 0 ? (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Conflitti (scegli il valore da tenere)
              </p>
              {plan.conflicts.map((c) => {
                const selected =
                  choices[plan.key]?.[c.field] ?? "canonical";
                return (
                  <fieldset
                    key={`${plan.key}-${c.field}-${c.duplicateValue}`}
                    className="rounded-lg border border-neutral-200 p-3 text-sm"
                  >
                    <legend className="px-1 font-medium text-neutral-800">
                      {c.label}
                    </legend>
                    <label className="mt-1 flex items-start gap-2">
                      <input
                        type="radio"
                        name={`${plan.key}-${c.field}`}
                        checked={selected === "canonical"}
                        onChange={() =>
                          setChoices((prev) => ({
                            ...prev,
                            [plan.key]: {
                              ...prev[plan.key],
                              [c.field]: "canonical",
                            },
                          }))
                        }
                      />
                      <span>
                        Canonico: <code>{c.canonicalValue}</code>
                      </span>
                    </label>
                    <label className="mt-1 flex items-start gap-2">
                      <input
                        type="radio"
                        name={`${plan.key}-${c.field}`}
                        checked={selected === "duplicate"}
                        onChange={() =>
                          setChoices((prev) => ({
                            ...prev,
                            [plan.key]: {
                              ...prev[plan.key],
                              [c.field]: "duplicate",
                            },
                          }))
                        }
                      />
                      <span>
                        Duplicato: <code>{c.duplicateValue}</code>
                      </span>
                    </label>
                  </fieldset>
                );
              })}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
