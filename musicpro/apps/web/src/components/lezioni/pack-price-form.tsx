"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  updateCoursePackPrice,
  type CourseKind,
  type CoursePackPrice,
} from "@musicpro/database";

import { settingsInputClass } from "@/components/admin/settings-chrome";
import { COURSE_KIND_LABELS } from "@/components/lezioni/course-labels";
import { createClient } from "@/lib/supabase/client";

const KINDS: CourseKind[] = ["individuale", "gruppo", "online"];
const DURATIONS = [30, 45, 60, 90] as const;

export type PackPriceFormRow = {
  id: string;
  courseKind: CourseKind;
  durationMinutes: number;
  amountEur: number | null;
};

interface PackPriceFormProps {
  prices: PackPriceFormRow[];
}

function cellKey(kind: CourseKind, duration: number): string {
  return `${kind}:${duration}`;
}

function parseEuroDraft(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return "invalid";
  return value;
}

function draftFromPrice(price: CoursePackPrice | PackPriceFormRow): string {
  return price.amountEur == null ? "" : String(price.amountEur);
}

export function PackPriceForm({ prices }: PackPriceFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const byKey = useMemo(() => {
    const map = new Map<string, PackPriceFormRow>();
    for (const row of prices) {
      map.set(cellKey(row.courseKind, row.durationMinutes), row);
    }
    return map;
  }, [prices]);

  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const row of prices) {
      initial[cellKey(row.courseKind, row.durationMinutes)] = draftFromPrice(row);
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function setCell(kind: CourseKind, duration: number, value: string) {
    setDrafts((prev) => ({ ...prev, [cellKey(kind, duration)]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const updates: { id: string; amountEur: number | null }[] = [];
    for (const kind of KINDS) {
      for (const duration of DURATIONS) {
        const key = cellKey(kind, duration);
        const row = byKey.get(key);
        if (!row) continue;
        const parsed = parseEuroDraft(drafts[key] ?? "");
        if (parsed === "invalid") {
          setSaving(false);
          setError(
            `Importo non valido per ${COURSE_KIND_LABELS[kind]} ${duration} min.`,
          );
          return;
        }
        updates.push({ id: row.id, amountEur: parsed });
      }
    }

    for (const update of updates) {
      const result = await updateCoursePackPrice(
        supabase,
        update.id,
        update.amountEur,
      );
      if (!result.success) {
        setSaving(false);
        setError(result.errorMessage ?? "Impossibile salvare il listino.");
        return;
      }
    }

    setSaving(false);
    setSuccess("Listino pacchetti salvato.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        Prezzo del pacchetto da 4 lezioni. Vuoto = non configurato. 0 € è
        consentito.
      </p>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="px-4 py-2 font-medium">Tipo</th>
              {DURATIONS.map((duration) => (
                <th key={duration} className="px-2 py-2 font-medium">
                  {duration} min
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {KINDS.map((kind) => (
              <tr key={kind} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2 font-medium text-neutral-900">
                  {COURSE_KIND_LABELS[kind]}
                </td>
                {DURATIONS.map((duration) => {
                  const key = cellKey(kind, duration);
                  const row = byKey.get(key);
                  return (
                    <td key={key} className="px-2 py-2">
                      {row ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={drafts[key] ?? ""}
                          onChange={(e) =>
                            setCell(kind, duration, e.target.value)
                          }
                          placeholder="—"
                          className={settingsInputClass}
                          aria-label={`${COURSE_KIND_LABELS[kind]} ${duration} minuti`}
                        />
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
      >
        {saving ? "Salvataggio…" : "Salva listino"}
      </button>
    </form>
  );
}
