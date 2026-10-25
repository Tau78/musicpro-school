"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  type LastMinuteCampaign,
  type OperationalDaySchedule,
  type OperationalWeekSchedule,
  type WeekdayKey,
  defaultOperationalWeekSchedule,
  formatBookingDateTime,
  updateOperationalWeekSchedule,
} from "@musicpro/database";

import { CollapsibleSection } from "@/components/admin/collapsible-section";
import { FieldLabel, settingsInputClass } from "@/components/admin/settings-chrome";
import { createClient } from "@/lib/supabase/client";

const WEEKDAY_ORDER: WeekdayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

const WEEKDAY_SHORT: Record<WeekdayKey, string> = {
  mon: "Lun",
  tue: "Mar",
  wed: "Mer",
  thu: "Gio",
  fri: "Ven",
  sat: "Sab",
  sun: "Dom",
};

function timeInputValue(bandEnd: string): string {
  return bandEnd === "24:00" ? "23:59" : bandEnd;
}

function patchDay(
  schedule: OperationalWeekSchedule,
  key: WeekdayKey,
  patch: Partial<OperationalDaySchedule>,
): OperationalWeekSchedule {
  return { ...schedule, [key]: { ...schedule[key], ...patch } };
}

export function BookingOperationalSettingsSection({
  initialSchedule,
  recentCampaigns,
}: {
  initialSchedule: OperationalWeekSchedule;
  recentCampaigns: LastMinuteCampaign[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [schedule, setSchedule] = useState<OperationalWeekSchedule>(() => ({
    ...defaultOperationalWeekSchedule(),
    ...initialSchedule,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const result = await updateOperationalWeekSchedule(supabase, schedule);
    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Errore durante il salvataggio.");
      return;
    }

    setSuccess("Serata operativa aggiornata.");
    router.refresh();
  }

  return (
    <CollapsibleSection
      title="Last minute & serata operativa"
      description="Fascia serale e soglie operative per giorno (lun–dom)."
    >
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="hidden min-w-0 gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500 sm:grid sm:grid-cols-[2.5rem_2rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,3.5rem)_minmax(0,3.5rem)]">
          <span>Giorno</span>
          <span>On</span>
          <span>Fascia da</span>
          <span>Fascia a</span>
          <span>Appr. h</span>
          <span>Auto h</span>
        </div>

        {WEEKDAY_ORDER.map((key) => {
          const row = schedule[key];
          const disabled = !row.enabled;

          return (
            <div
              key={key}
              className="grid min-w-0 max-w-full grid-cols-[2.5rem_1fr] items-center gap-x-2 gap-y-1 rounded-lg border border-neutral-100 bg-neutral-50/80 px-2 py-1.5 sm:grid-cols-[2.5rem_2rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,3.5rem)_minmax(0,3.5rem)]"
            >
              <span className="text-xs font-medium text-neutral-800">
                {WEEKDAY_SHORT[key]}
              </span>
              <label className="flex items-center justify-center sm:justify-start">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  aria-label={`Attivo ${WEEKDAY_SHORT[key]}`}
                  onChange={(e) =>
                    setSchedule((prev) =>
                      patchDay(prev, key, { enabled: e.target.checked }),
                    )
                  }
                  className="h-4 w-4 accent-[var(--brand)]"
                />
              </label>
              <label className="min-w-0">
                <span className="sr-only">Fascia da</span>
                <input
                  type="time"
                  disabled={disabled}
                  value={row.bandStart}
                  onChange={(e) =>
                    setSchedule((prev) =>
                      patchDay(prev, key, { bandStart: e.target.value }),
                    )
                  }
                  className={`${settingsInputClass} min-w-0 py-1 text-sm disabled:opacity-50`}
                />
              </label>
              <label className="min-w-0">
                <span className="sr-only">Fascia a</span>
                <input
                  type="time"
                  disabled={disabled}
                  value={timeInputValue(row.bandEnd)}
                  onChange={(e) =>
                    setSchedule((prev) =>
                      patchDay(prev, key, { bandEnd: e.target.value }),
                    )
                  }
                  className={`${settingsInputClass} min-w-0 py-1 text-sm disabled:opacity-50`}
                />
              </label>
              <label className="min-w-0">
                <span className="sr-only">Approvazione min operativi</span>
                <input
                  type="number"
                  min={0}
                  disabled={disabled}
                  value={row.approvalMinHoursOperational}
                  onChange={(e) =>
                    setSchedule((prev) =>
                      patchDay(prev, key, {
                        approvalMinHoursOperational: Number(e.target.value) || 0,
                      }),
                    )
                  }
                  className={`${settingsInputClass} min-w-0 py-1 text-sm disabled:opacity-50`}
                />
              </label>
              <label className="min-w-0">
                <span className="sr-only">Conferma auto min operativi</span>
                <input
                  type="number"
                  min={0}
                  disabled={disabled}
                  value={row.autoConfirmMinHoursOperational}
                  onChange={(e) =>
                    setSchedule((prev) =>
                      patchDay(prev, key, {
                        autoConfirmMinHoursOperational:
                          Number(e.target.value) || 0,
                      }),
                    )
                  }
                  className={`${settingsInputClass} min-w-0 py-1 text-sm disabled:opacity-50`}
                />
              </label>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-neutral-500">
        Ore operative: default 0. Fascia = orario band serata; fine 24:00 resta
        salvata come mezzanotte.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-lg bg-[var(--brand)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : "Salva serata operativa"}
        </button>
      </div>

      <div className="border-t border-neutral-100 pt-3">
        <FieldLabel>Campagne last minute attive (ultime 5)</FieldLabel>
        {recentCampaigns.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">
            Nessuna campagna in elenco (o tabella non ancora attiva).
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-800">
            {recentCampaigns.map((campaign) => (
              <li
                key={campaign.id}
                className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-md border border-neutral-100 bg-white px-2 py-1.5"
              >
                <span className="min-w-0 truncate font-medium">
                  {formatBookingDateTime(campaign.start_at, campaign.end_at)}
                </span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {campaign.phase}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}
