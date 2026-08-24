"use client";

import { useCallback, useEffect, useState } from "react";

import {
  SCADENZIARIO_ITEMS,
  type ScadenziarioItemId,
  type VerbaliScadenziarioState,
  emptyScadenziarioState,
} from "@/lib/admin/verbali-scadenziario";

export function VerbaliScadenziarioPanel() {
  const [state, setState] = useState<VerbaliScadenziarioState>(
    emptyScadenziarioState,
  );
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<ScadenziarioItemId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/documenti/verbali/scadenziario");
      const data = (await response.json()) as {
        success?: boolean;
        state?: VerbaliScadenziarioState;
        message?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Impossibile caricare lo scadenziario.");
      }

      setState({ ...emptyScadenziarioState(), ...data.state });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossibile caricare lo scadenziario.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  async function handleToggle(id: ScadenziarioItemId, checked: boolean) {
    const previous = state;
    const next = { ...state, [id]: checked };

    setState(next);
    setSavingId(id);
    setError(null);

    try {
      const response = await fetch("/api/admin/documenti/verbali/scadenziario", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Impossibile salvare lo scadenziario.");
      }
    } catch (saveError) {
      setState(previous);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossibile salvare lo scadenziario.",
      );
    } finally {
      setSavingId(null);
    }
  }

  const completedCount = SCADENZIARIO_ITEMS.filter((item) => state[item.id]).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">
          Checklist obblighi documentali per associazioni ETS (RUNTS).
        </p>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
          {completedCount}/{SCADENZIARIO_ITEMS.length} completati
        </span>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-500">Caricamento checklist…</p>
      ) : (
        <ul className="space-y-3">
          {SCADENZIARIO_ITEMS.map((item) => {
            const checked = Boolean(state[item.id]);
            const isSaving = savingId === item.id;

            return (
              <li
                key={item.id}
                className={`rounded-xl border px-4 py-3 transition-colors ${
                  checked
                    ? "border-[var(--brand)]/30 bg-[var(--brand)]/5"
                    : "border-neutral-200 bg-neutral-50"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-[var(--brand)] focus:ring-[var(--brand)]"
                    checked={checked}
                    disabled={isSaving}
                    onChange={(event) =>
                      void handleToggle(item.id, event.target.checked)
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--brand)]">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-neutral-600">
                      {item.description}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-500">
                      {item.frequency}
                    </span>
                  </span>
                  {isSaving ? (
                    <span className="shrink-0 text-xs text-neutral-400">
                      Salvataggio…
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
