"use client";

import {
  LOCATION_PRESETS,
  LOCATION_PRESET_LABELS,
  type LocationPreset,
} from "@musicpro/database";

export interface CespitiFilters {
  locations: LocationPreset[];
  includeDisposed: boolean;
  withoutPhoto: boolean;
  withoutSerial: boolean;
  includeDeleted: boolean;
}

export const emptyCespitiFilters = (): CespitiFilters => ({
  locations: [],
  includeDisposed: false,
  withoutPhoto: false,
  withoutSerial: false,
  includeDeleted: false,
});

interface CespitiFiltersDrawerProps {
  open: boolean;
  filters: CespitiFilters;
  onChange: (filters: CespitiFilters) => void;
  onClose: () => void;
}

export function CespitiFiltersDrawer({
  open,
  filters,
  onChange,
  onClose,
}: CespitiFiltersDrawerProps) {
  if (!open) return null;

  function toggleLocation(preset: LocationPreset) {
    const next = filters.locations.includes(preset)
      ? filters.locations.filter((item) => item !== preset)
      : [...filters.locations, preset];
    onChange({ ...filters, locations: next });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Chiudi filtri"
        className="fixed inset-0 z-40 bg-black/30 touch-manipulation"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[min(92vw,20rem)] flex-col border-l border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <h3 className="text-base font-semibold text-[var(--brand)]">Filtri</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-lg px-3 text-sm text-neutral-600 touch-manipulation hover:bg-neutral-50"
          >
            Chiudi
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-neutral-800">Sale</legend>
            {LOCATION_PRESETS.map((preset) => (
              <label
                key={preset}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 touch-manipulation hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300 text-[var(--brand)] focus:ring-[var(--brand)]"
                  checked={filters.locations.includes(preset)}
                  onChange={() => toggleLocation(preset)}
                />
                <span className="text-sm text-neutral-700">
                  {LOCATION_PRESET_LABELS[preset]}
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="mt-6 space-y-3 border-t border-neutral-100 pt-4">
            <legend className="text-sm font-medium text-neutral-800">Stato</legend>
            {[
              { key: "includeDisposed" as const, label: "Includi dismessi" },
              { key: "withoutPhoto" as const, label: "Senza foto" },
              { key: "withoutSerial" as const, label: "Senza seriale" },
              { key: "includeDeleted" as const, label: "Includi eliminati" },
            ].map((item) => (
              <label
                key={item.key}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 touch-manipulation hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300 text-[var(--brand)] focus:ring-[var(--brand)]"
                  checked={filters[item.key]}
                  onChange={(event) =>
                    onChange({ ...filters, [item.key]: event.target.checked })
                  }
                />
                <span className="text-sm text-neutral-700">{item.label}</span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="border-t border-neutral-100 px-4 py-3">
          <button
            type="button"
            onClick={() => onChange(emptyCespitiFilters())}
            className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 touch-manipulation hover:bg-neutral-50"
          >
            Azzera filtri
          </button>
        </div>
      </aside>
    </>
  );
}

export function activeFilterCount(filters: CespitiFilters): number {
  let count = 0;
  if (filters.locations.length > 0) count += 1;
  if (filters.includeDisposed) count += 1;
  if (filters.withoutPhoto) count += 1;
  if (filters.withoutSerial) count += 1;
  if (filters.includeDeleted) count += 1;
  return count;
}
